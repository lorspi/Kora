/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Backend de Kora en Cloudflare.
 *
 * Cada equipo lo despliega en su propia cuenta con el botón "Deploy to Cloudflare";
 * Kora (en la nube o en localhost) habla con él desde el navegador. No hay ningún
 * servidor de Kora de por medio.
 *
 * Un Worker sin estado recibe las peticiones y las pasa al Durable Object del
 * espacio (`/api/{espacio}/...`). Cada espacio es un Durable Object con SQLite que
 * guarda:
 *   files    Los archivos del proyecto (los mismos JSON y Markdown que en una carpeta).
 *   records  Registros de la edición colaborativa (estado Yjs, presencia, etc.).
 *   tokens   Accesos de invitación, guardados como hash y revocables.
 * y avisa en tiempo real por WebSocket (con hibernación) de los cambios.
 *
 * Autenticación: `Authorization: Bearer <token>`. El token es la contraseña de
 * administración (secreto ADMIN_TOKEN, se pide al desplegar) o un token de
 * invitación creado por un administrador.
 */
import { DurableObject } from 'cloudflare:workers';

export interface Env {
  SPACE: DurableObjectNamespace<KoraSpace>;
  ADMIN_TOKEN?: string;
}

/** Versión de la API. Kora la compara para avisar si el backend necesita actualizarse. */
const API_VERSION = 1;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Kora-Client',
  'Access-Control-Max-Age': '86400',
};

/** Las filas de SQLite en Durable Objects admiten hasta 8 MB; dejamos margen. */
const MAX_VALUE_LENGTH = 7_500_000;
const MAX_PATH_LENGTH = 1024;
const MAX_ID_LENGTH = 512;
const FIELD_RE = /^[A-Za-z0-9_]{1,64}$/;
const SPACE_RE = /^[A-Za-z0-9_-]{1,64}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

function fail(status: number, error: string, message: string): Response {
  return json({ error, message }, status);
}

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Placeholder of .dev.vars.example, which the deploy flow pre-fills: never valid. */
const EXAMPLE_ADMIN_TOKEN = 'elige-una-contrasena-larga';
const MIN_ADMIN_TOKEN_LENGTH = 12;
const SECRET_SETTINGS = 'Cloudflare → Workers y Pages → kora-backend → Configuración → Variables y secretos';

function adminTokenProblem(env: Env): string | null {
  const t = env.ADMIN_TOKEN;
  if (!t) return `El backend no tiene contraseña de administración (secreto ADMIN_TOKEN). Defínela en ${SECRET_SETTINGS}.`;
  if (t === EXAMPLE_ADMIN_TOKEN) {
    return `La contraseña de administración (ADMIN_TOKEN) es la de ejemplo: cámbiala por una tuya en ${SECRET_SETTINGS}.`;
  }
  if (t.length < MIN_ADMIN_TOKEN_LENGTH) {
    return `La contraseña de administración (ADMIN_TOKEN) es demasiado corta: usa al menos ${MIN_ADMIN_TOKEN_LENGTH} caracteres. Cámbiala en ${SECRET_SETTINGS}.`;
  }
  return null;
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Página de estado: lo que ve quien abre la dirección del Worker en el navegador.
    if (url.pathname === '/' || url.pathname === '') {
      const problem = adminTokenProblem(env);
      return json({
        kora: true,
        api: API_VERSION,
        ready: !problem,
        message: problem ?? 'Backend de Kora listo. Pega esta dirección en Kora → Nuevo proyecto → Cloudflare.',
      });
    }

    const match = url.pathname.match(/^\/api\/([^/]+)(\/.*)$/);
    if (!match || !SPACE_RE.test(match[1])) {
      return fail(404, 'not_found', 'Ruta no encontrada.');
    }

    const problem = adminTokenProblem(env);
    if (problem) return fail(503, 'not_configured', problem);

    // El Durable Object ya añade las cabeceras CORS (y las respuestas WebSocket no las necesitan).
    const stub = env.SPACE.get(env.SPACE.idFromName(match[1]));
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;

// ─── Durable Object ───────────────────────────────────────────────────────────

type Role = 'admin' | 'member';

interface Identity {
  role: Role;
  /** Id del token de invitación, o "admin" para la contraseña de administración. */
  tid: string;
}

type Sub = { k: 'doc'; id: string } | { k: 'q'; f: string; v: string | number | boolean };

interface SocketState {
  authed: boolean;
  client?: string;
  tid?: string;
  subs: Record<string, Sub>;
}

interface RecordEvent {
  id: string;
  before: any | null;
  after: any | null;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(bytes = 24): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Exclusive upper bound of the paths that start with `prefix` (which ends in "/"):
 * "/docs/" -> "/docs0". SQLite compares UTF-8 bytes, so a bound like prefix + U+FFFF
 * would leave out names with emoji (their bytes start at F0).
 */
function prefixEnd(prefix: string): string {
  return prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);
}

function matches(data: any | null, sub: Sub & { k: 'q' }): boolean {
  return !!data && data[sub.f] === sub.v;
}

export class KoraSpace extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, content TEXT NOT NULL, is_binary INTEGER NOT NULL, updated_at INTEGER NOT NULL)'
    );
    this.sql.exec('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS tokens (id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL)'
    );
    // Los "ping" de los clientes se responden sin despertar al objeto.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  // ── Autenticación ──────────────────────────────────────────────────────────

  private async identify(token: string | null | undefined): Promise<Identity | null> {
    if (!token || token.length > 512) return null;
    const hash = await sha256(token);
    const admin = this.env.ADMIN_TOKEN;
    if (admin && hash === (await sha256(admin))) return { role: 'admin', tid: 'admin' };
    const row = this.sql.exec<{ id: string; role: string }>('SELECT id, role FROM tokens WHERE hash = ?', hash).toArray()[0];
    if (!row) return null;
    return { role: row.role === 'admin' ? 'admin' : 'member', tid: row.id };
  }

  // ── HTTP ───────────────────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = url.pathname.replace(/^\/api\/[^/]+/, '');

    if (route === '/ws') return this.acceptSocket(request);

    const auth = request.headers.get('Authorization') || '';
    const who = await this.identify(auth.replace(/^Bearer\s+/i, '').trim());
    if (!who) return fail(401, 'unauthorized', 'El token de acceso no es válido o fue revocado.');

    const client = (request.headers.get('X-Kora-Client') || '').slice(0, 64);

    try {
      const key = `${request.method} ${route}`;
      switch (key) {
        case 'GET /info':
          return json({ ok: true, api: API_VERSION, role: who.role });
        case 'GET /file':
          return this.readFile(url.searchParams.get('path'));
        case 'GET /exists':
          return json({ exists: this.fileExists(url.searchParams.get('path')) });
        case 'PUT /file':
          return this.writeFile(await request.json(), client);
        case 'DELETE /file':
          return this.deleteFiles(url.searchParams.get('path'), false, client);
        case 'DELETE /files':
          return this.deleteFiles(url.searchParams.get('prefix'), true, client);
        case 'GET /list':
          return this.listFiles(url.searchParams.get('prefix'));
        case 'POST /rec':
          return json(this.recordOp(await request.json()));
        case 'GET /tokens':
          this.requireAdmin(who);
          return json({ tokens: this.listTokens() });
        case 'POST /tokens':
          this.requireAdmin(who);
          return json(await this.createToken(await request.json()));
        case 'DELETE /tokens':
          this.requireAdmin(who);
          return json(this.revokeToken(url.searchParams.get('id')));
        default:
          return fail(404, 'not_found', 'Ruta no encontrada.');
      }
    } catch (err: any) {
      if (err instanceof HttpError) return fail(err.status, err.code, err.message);
      return fail(500, 'server_error', err?.message || String(err));
    }
  }

  private requireAdmin(who: Identity) {
    if (who.role !== 'admin') throw new HttpError(403, 'forbidden', 'Solo un administrador puede gestionar los accesos.');
  }

  // ── Archivos ───────────────────────────────────────────────────────────────

  private checkPath(path: string | null | undefined): string {
    if (typeof path !== 'string' || !path.startsWith('/') || path.length > MAX_PATH_LENGTH) {
      throw new HttpError(400, 'bad_path', 'Ruta de archivo inválida.');
    }
    return path;
  }

  private readFile(rawPath: string | null): Response {
    const path = this.checkPath(rawPath);
    const row = this.sql
      .exec<{ content: string; is_binary: number; updated_at: number }>(
        'SELECT content, is_binary, updated_at FROM files WHERE path = ?',
        path
      )
      .toArray()[0];
    if (!row) return fail(404, 'not_found', `Archivo no encontrado: ${path}`);
    return json({ path, content: row.content, isBinary: !!row.is_binary, updatedAt: row.updated_at });
  }

  private fileExists(rawPath: string | null): boolean {
    const path = this.checkPath(rawPath);
    return this.sql.exec('SELECT 1 FROM files WHERE path = ?', path).toArray().length > 0;
  }

  private writeFile(body: any, client: string): Response {
    const path = this.checkPath(body?.path);
    const content = body?.content;
    if (typeof content !== 'string') throw new HttpError(400, 'bad_content', 'Contenido inválido.');
    if (content.length > MAX_VALUE_LENGTH) {
      throw new HttpError(413, 'too_large', 'El archivo es demasiado grande (máximo unos 5 MB).');
    }
    this.sql.exec(
      'INSERT INTO files (path, content, is_binary, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET content = excluded.content, is_binary = excluded.is_binary, updated_at = excluded.updated_at',
      path,
      content,
      body?.isBinary ? 1 : 0,
      Date.now()
    );
    this.broadcastFiles(client);
    return json({ ok: true });
  }

  private deleteFiles(raw: string | null, isPrefix: boolean, client: string): Response {
    const path = this.checkPath(raw);
    if (isPrefix) {
      const prefix = path.endsWith('/') ? path : path + '/';
      this.sql.exec('DELETE FROM files WHERE path >= ? AND path < ?', prefix, prefixEnd(prefix));
    } else {
      this.sql.exec('DELETE FROM files WHERE path = ?', path);
    }
    this.broadcastFiles(client);
    return json({ ok: true });
  }

  private listFiles(raw: string | null): Response {
    const path = this.checkPath(raw);
    const prefix = path.endsWith('/') ? path : path + '/';
    const paths = this.sql
      .exec<{ path: string }>('SELECT path FROM files WHERE path >= ? AND path < ? ORDER BY path', prefix, prefixEnd(prefix))
      .toArray()
      .map((r) => r.path);
    return json({ paths });
  }

  // ── Registros (edición colaborativa) ───────────────────────────────────────

  private checkId(id: unknown): string {
    if (typeof id !== 'string' || !id || id.length > MAX_ID_LENGTH) {
      throw new HttpError(400, 'bad_id', 'Identificador de registro inválido.');
    }
    return id;
  }

  private getRecord(id: string): any | null {
    const row = this.sql.exec<{ data: string }>('SELECT data FROM records WHERE id = ?', id).toArray()[0];
    return row ? JSON.parse(row.data) : null;
  }

  private putRecord(id: string, data: any) {
    const text = JSON.stringify(data ?? {});
    if (text.length > MAX_VALUE_LENGTH) throw new HttpError(413, 'too_large', 'Registro demasiado grande.');
    this.sql.exec(
      'INSERT INTO records (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      id,
      text
    );
  }

  private recordOp(body: any): unknown {
    const op = body?.op;
    switch (op) {
      case 'get':
        return { data: this.getRecord(this.checkId(body.id)) };

      case 'set':
      case 'update': {
        const id = this.checkId(body.id);
        const before = this.getRecord(id);
        if (op === 'update' && !before) throw new HttpError(404, 'not_found', 'El registro no existe.');
        const after = op === 'update' ? { ...before, ...body.data } : body.data ?? {};
        this.putRecord(id, after);
        this.notify([{ id, before, after }]);
        return { ok: true };
      }

      case 'del': {
        const ids: string[] = Array.isArray(body.ids) ? body.ids.map((x: unknown) => this.checkId(x)) : [];
        const events: RecordEvent[] = [];
        for (const id of ids) {
          const before = this.getRecord(id);
          if (!before) continue;
          this.sql.exec('DELETE FROM records WHERE id = ?', id);
          events.push({ id, before, after: null });
        }
        this.notify(events);
        return { ok: true };
      }

      case 'query': {
        const field = String(body.field ?? '');
        if (!FIELD_RE.test(field)) throw new HttpError(400, 'bad_field', 'Campo de consulta inválido.');
        const value = body.value;
        const items = this.sql
          .exec<{ id: string; data: string }>(`SELECT id, data FROM records WHERE json_extract(data, '$.${field}') = ?`, value)
          .toArray()
          .map((r) => ({ id: r.id, data: JSON.parse(r.data) }))
          // json_extract compara con conversión de tipos; filtramos por igualdad estricta.
          .filter((r) => r.data[field] === value);
        return { items };
      }

      case 'txn': {
        // Escritura condicional y atómica: solo se aplica si el campo del registro
        // de control vale lo esperado (null = el registro no existe o no tiene el campo).
        const check = body.check ?? {};
        const checkId = this.checkId(check.id);
        const field = String(check.field ?? '');
        if (!FIELD_RE.test(field)) throw new HttpError(400, 'bad_field', 'Campo de control inválido.');
        const current = this.getRecord(checkId);
        if ((current?.[field] ?? null) !== (check.expect ?? null)) return { ok: false, current };
        const writes: any[] = Array.isArray(body.writes) ? body.writes : [];
        const events: RecordEvent[] = [];
        this.ctx.storage.transactionSync(() => {
          for (const w of writes) {
            const id = this.checkId(w?.id);
            const before = this.getRecord(id);
            if (w.op === 'update' && !before) throw new HttpError(404, 'not_found', 'El registro no existe.');
            const after = w.op === 'update' ? { ...before, ...w.data } : w.data ?? {};
            this.putRecord(id, after);
            events.push({ id, before, after });
          }
        });
        this.notify(events);
        return { ok: true, current };
      }

      default:
        throw new HttpError(400, 'bad_op', 'Operación desconocida.');
    }
  }

  // ── Tokens de invitación ───────────────────────────────────────────────────

  private listTokens() {
    return this.sql
      .exec<{ id: string; name: string; role: string; created_at: number }>(
        'SELECT id, name, role, created_at FROM tokens ORDER BY created_at DESC'
      )
      .toArray()
      .map((r) => ({ id: r.id, name: r.name, role: r.role, createdAt: r.created_at }));
  }

  private async createToken(body: any) {
    const name = String(body?.name ?? '').trim().slice(0, 80) || 'Invitación';
    const role: Role = body?.role === 'admin' ? 'admin' : 'member';
    const id = crypto.randomUUID();
    const token = `kora_${randomToken()}`;
    this.sql.exec(
      'INSERT INTO tokens (id, hash, name, role, created_at) VALUES (?, ?, ?, ?, ?)',
      id,
      await sha256(token),
      name,
      role,
      Date.now()
    );
    return { id, name, role, token };
  }

  private revokeToken(rawId: string | null) {
    const id = this.checkId(rawId);
    this.sql.exec('DELETE FROM tokens WHERE id = ?', id);
    // Quien estuviera conectado con ese token pierde la conexión en tiempo real.
    for (const ws of this.ctx.getWebSockets()) {
      const st = ws.deserializeAttachment() as SocketState | null;
      if (st?.tid === id) {
        try {
          ws.close(4001, 'revoked');
        } catch {
          /* ya cerrado */
        }
      }
    }
    return { ok: true };
  }

  // ── Tiempo real ────────────────────────────────────────────────────────────

  private acceptSocket(request: Request): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return fail(426, 'upgrade_required', 'Se esperaba una conexión WebSocket.');
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ authed: false, subs: {} } satisfies SocketState);
    return new Response(null, { status: 101, webSocket: client });
  }

  private send(ws: WebSocket, msg: unknown) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket cerrado */
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;
    let msg: any;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    const st = (ws.deserializeAttachment() as SocketState | null) ?? { authed: false, subs: {} };

    // El token viaja en el primer mensaje (no en la URL) para que no quede en registros.
    if (msg.t === 'auth') {
      const who = await this.identify(String(msg.token ?? ''));
      if (!who) {
        this.send(ws, { t: 'auth', ok: false });
        ws.close(4001, 'unauthorized');
        return;
      }
      st.authed = true;
      st.client = String(msg.client ?? '').slice(0, 64);
      st.tid = who.tid;
      ws.serializeAttachment(st);
      this.send(ws, { t: 'auth', ok: true, role: who.role, api: API_VERSION });
      return;
    }
    if (!st.authed) return;

    if (msg.t === 'sub') {
      const sid = String(msg.sid ?? '').slice(0, 32);
      if (!sid) return;
      let sub: Sub;
      if (msg.k === 'doc') {
        sub = { k: 'doc', id: this.checkId(msg.id) };
      } else if (msg.k === 'q' && FIELD_RE.test(String(msg.f ?? ''))) {
        sub = { k: 'q', f: String(msg.f), v: msg.v };
      } else {
        return;
      }
      st.subs[sid] = sub;
      // Los adjuntos de un WebSocket admiten 16 KB serializados.
      if (JSON.stringify(st).length > 15_000) {
        delete st.subs[sid];
        this.send(ws, { t: 'err', sid, message: 'Demasiadas suscripciones abiertas.' });
        return;
      }
      ws.serializeAttachment(st);
      if (sub.k === 'doc') {
        this.send(ws, { t: 'doc', sid, data: this.getRecord(sub.id) });
      } else {
        const { items } = this.recordOp({ op: 'query', field: sub.f, value: sub.v }) as { items: unknown[] };
        this.send(ws, { t: 'snap', sid, items });
      }
      return;
    }

    if (msg.t === 'unsub') {
      delete st.subs[String(msg.sid ?? '')];
      ws.serializeAttachment(st);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code, reason);
    } catch {
      /* ya cerrado */
    }
  }

  /** Avisa a todos los clientes (menos al que escribió) de que cambiaron archivos. */
  private broadcastFiles(by: string) {
    for (const ws of this.ctx.getWebSockets()) {
      const st = ws.deserializeAttachment() as SocketState | null;
      if (st?.authed) this.send(ws, { t: 'files', by });
    }
  }

  /** Reenvía los cambios de registros a las suscripciones afectadas. */
  private notify(events: RecordEvent[]) {
    if (!events.length) return;
    for (const ws of this.ctx.getWebSockets()) {
      const st = ws.deserializeAttachment() as SocketState | null;
      if (!st?.authed) continue;
      for (const [sid, sub] of Object.entries(st.subs)) {
        if (sub.k === 'doc') {
          for (const e of events) if (e.id === sub.id) this.send(ws, { t: 'doc', sid, data: e.after });
          continue;
        }
        const changes: { type: 'added' | 'modified' | 'removed'; id: string; data: any }[] = [];
        for (const e of events) {
          const was = matches(e.before, sub);
          const is = matches(e.after, sub);
          if (is) changes.push({ type: was ? 'modified' : 'added', id: e.id, data: e.after });
          else if (was) changes.push({ type: 'removed', id: e.id, data: e.before });
        }
        if (changes.length) this.send(ws, { t: 'chg', sid, changes });
      }
    }
  }
}
