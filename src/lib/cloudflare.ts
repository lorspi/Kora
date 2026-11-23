/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cloudflare storage adapter for Kora.
 *
 * "Bring Your Own Backend" cloud mode, like Firebase: each team deploys the Kora
 * backend (folder `cloudflare-backend/`) to its own Cloudflare account with the
 * "Deploy to Cloudflare" button, then pastes the Worker address and its password
 * into Kora. The browser talks straight to that Worker; no Kora-owned server is
 * involved, and it works the same from the hosted Kora or from localhost.
 *
 * The adapter mirrors the public interface of FileSystemAdapter / FirebaseAdapter
 * so the rest of the app (store, CRUD, locks, polling) works unchanged:
 *   - Files go over HTTP (`/api/{space}/file`, `/list`, ...).
 *   - Realtime goes over one WebSocket (`/api/{space}/ws`): file change pings and
 *     the record subscriptions used by collaborative editing (lib/records).
 *
 * Access: the admin password (secret ADMIN_TOKEN of the Worker) or an invitation
 * token an admin created. Invitations travel as a code / link (see encodeInvite).
 */

import { normalizePath } from './fs';
import type { RecordChange, RecordStore } from './records';

/**
 * Window event fired (once per open project) when the backend stops accepting
 * this project's token, e.g. because an admin revoked the invitation.
 */
export const CLOUD_ACCESS_LOST_EVENT = 'kora:cloud-access-lost';

/** Backend API versions this Kora understands. */
const MIN_BACKEND_API = 1;

/** Public repository folder the deploy button copies into the team's account. */
export const CLOUDFLARE_BACKEND_REPO = 'https://github.com/lorspi/Kora/tree/main/cloudflare-backend';
export const CLOUDFLARE_DEPLOY_URL = `https://deploy.workers.cloudflare.com/?url=${CLOUDFLARE_BACKEND_REPO}`;

export type CloudflareRole = 'admin' | 'member';

/** Everything needed to reach one space of a team's backend. */
export interface CloudflareLink {
  /** Worker address, e.g. https://kora-backend.equipo.workers.dev */
  url: string;
  /** Admin password or invitation token. */
  token: string;
  /** Logical space inside the backend (allows several Kora projects per backend). */
  spaceId: string;
}

export interface CloudflareInviteInfo {
  id: string;
  name: string;
  role: CloudflareRole;
  createdAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Clean up a Worker address typed or pasted by the user. */
export function normalizeWorkerUrl(input: string): string {
  let raw = (input || '').trim();
  if (!raw) throw new Error('Pega la dirección de tu backend (termina en .workers.dev).');
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('La dirección no es válida. Debe verse como https://kora-backend.tu-cuenta.workers.dev');
  }
  // Only the origin matters (people sometimes paste /api/... or a trailing slash).
  return url.origin;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** What an invitation carries: where the backend is, the token, and a project name. */
export interface CloudflareInvite extends CloudflareLink {
  name?: string;
}

/** Compact invitation code (also the `i` parameter of an invitation link). */
export function encodeInvite(invite: CloudflareInvite): string {
  return toBase64Url(JSON.stringify({ u: invite.url, t: invite.token, s: invite.spaceId, n: invite.name || undefined }));
}

/**
 * Read an invitation from a code, or from a full invitation link (any Kora
 * address with `#/unirse?i=...`). Returns null if it isn't one.
 */
export function decodeInvite(input: string): CloudflareInvite | null {
  let code = (input || '').trim();
  if (!code) return null;
  const inLink = code.match(/[?&#]i=([A-Za-z0-9_-]+)/);
  if (inLink) code = inLink[1];
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return null;
  try {
    const obj = JSON.parse(fromBase64Url(code));
    if (!obj || typeof obj.u !== 'string' || typeof obj.t !== 'string') return null;
    return {
      url: normalizeWorkerUrl(obj.u),
      token: obj.t,
      spaceId: typeof obj.s === 'string' && obj.s ? obj.s : 'default',
      name: typeof obj.n === 'string' ? obj.n : undefined,
    };
  } catch {
    return null;
  }
}

/** Invitation link that opens this same Kora (hosted or localhost) and joins the project. */
export function buildInviteLink(invite: CloudflareInvite): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/unirse?i=${encodeInvite(invite)}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes]);
}

function randomId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

class BackendError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Raw request to a space of the backend. Throws BackendError with a friendly message. */
async function request(
  link: CloudflareLink,
  method: string,
  route: string,
  body?: unknown,
  clientId?: string
): Promise<any> {
  const headers: Record<string, string> = { Authorization: `Bearer ${link.token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (clientId) headers['X-Kora-Client'] = clientId;
  let res: Response;
  try {
    res = await fetch(`${link.url}/api/${encodeURIComponent(link.spaceId)}${route}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new BackendError(0, 'network', 'No se pudo contactar con el backend. Revisa la dirección y tu conexión a internet.');
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    if (res.status === 401) {
      throw new BackendError(401, 'unauthorized', 'La contraseña o el token de acceso no son válidos (o la invitación fue revocada).');
    }
    if (!data || !data.error) {
      throw new BackendError(res.status, 'not_kora', 'Esa dirección no responde como un backend de Kora. Revisa que sea la del Worker desplegado.');
    }
    throw new BackendError(res.status, data.error, data.message || `Error del backend (${res.status}).`);
  }
  return data;
}

/**
 * Check that a backend is reachable with the given token. Returns the role the
 * token has. Throws a friendly (Spanish) error otherwise.
 */
export async function testCloudflareConnection(link: CloudflareLink): Promise<{ role: CloudflareRole }> {
  const info = await request(link, 'GET', '/info');
  if (!info?.ok) throw new Error('Esa dirección no responde como un backend de Kora.');
  if (typeof info.api !== 'number' || info.api < MIN_BACKEND_API) {
    throw new Error('Tu backend de Kora está desactualizado. Vuelve a desplegarlo desde el botón de Cloudflare.');
  }
  return { role: info.role === 'admin' ? 'admin' : 'member' };
}

// ─── Realtime connection ──────────────────────────────────────────────────────

type DocSub = { kind: 'doc'; id: string; onData: (data: any | null) => void; onError?: (e: unknown) => void };
type QuerySub = {
  kind: 'q';
  field: string;
  value: string | number | boolean;
  known: Set<string>;
  gotFirst: boolean;
  onChanges: (changes: RecordChange[]) => void;
  onError?: (e: unknown) => void;
};
type Sub = DocSub | QuerySub;

const PING_EVERY = 25_000;
const FIRST_SNAPSHOT_TIMEOUT = 10_000;

/**
 * Cloudflare-backed storage adapter. Mirrors FileSystemAdapter's public API.
 */
export class CloudflareAdapter {
  private link: CloudflareLink;
  private role: CloudflareRole = 'member';
  private readyPromise: Promise<void> | null = null;
  /** Identifies this tab, so the backend doesn't echo our own file writes back. */
  private clientId = randomId();

  private socket: WebSocket | null = null;
  private authed = false;
  private everConnected = false;
  private disposed = false;
  private retryDelay = 1000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private fileListeners = new Set<() => void>();
  private subs = new Map<string, Sub>();
  private recordStore: RecordStore | null = null;
  private accessLost = false;

  constructor(link: CloudflareLink) {
    this.link = { ...link, url: normalizeWorkerUrl(link.url), spaceId: link.spaceId || 'default' };
  }

  /** Validate the token once (and learn its role). Safe to call repeatedly. */
  ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = testCloudflareConnection(this.link).then(({ role }) => {
        this.role = role;
      });
      this.readyPromise.catch(() => {
        // Allow a retry on the next call.
        this.readyPromise = null;
      });
    }
    return this.readyPromise;
  }

  getMode(): 'CLOUDFLARE' {
    return 'CLOUDFLARE';
  }

  getLink(): CloudflareLink {
    return { ...this.link };
  }

  getRole(): CloudflareRole {
    return this.role;
  }

  getSpaceId(): string {
    return this.link.spaceId;
  }

  /** FileSystemAdapter compatibility: there is no directory handle in cloud mode. */
  getDirectoryHandle(): null {
    return null;
  }

  private async call(method: string, route: string, body?: unknown) {
    try {
      return await request(this.link, method, route, body, this.clientId);
    } catch (err) {
      if (err instanceof BackendError && err.status === 401) this.reportAccessLost();
      throw err;
    }
  }

  private reportAccessLost() {
    if (this.accessLost || this.disposed) return;
    this.accessLost = true;
    window.dispatchEvent(new CustomEvent(CLOUD_ACCESS_LOST_EVENT));
  }

  // ── Files ──────────────────────────────────────────────────────────────────

  async readTextFile(path: string): Promise<string> {
    const data = await this.call('GET', `/file?path=${encodeURIComponent(normalizePath(path))}`);
    return typeof data.content === 'string' ? data.content : '';
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    await this.call('PUT', '/file', { path: normalizePath(path), content, isBinary: false });
  }

  async writeBinaryFile(path: string, blob: Blob): Promise<void> {
    const content = await blobToBase64(blob);
    await this.call('PUT', '/file', { path: normalizePath(path), content, isBinary: true });
  }

  async readBinaryFile(path: string): Promise<Blob> {
    const data = await this.call('GET', `/file?path=${encodeURIComponent(normalizePath(path))}`);
    const content = String(data.content || '');
    return data.isBinary ? base64ToBlob(content) : new Blob([new TextEncoder().encode(content)]);
  }

  async deleteFile(path: string): Promise<void> {
    try {
      await this.call('DELETE', `/file?path=${encodeURIComponent(normalizePath(path))}`);
    } catch (err) {
      console.warn(`No se pudo eliminar el archivo: ${path}`, err);
    }
  }

  async deleteDirectory(subFolder: string): Promise<void> {
    await this.call('DELETE', `/files?prefix=${encodeURIComponent(this.folderPrefix(subFolder))}`);
  }

  private folderPrefix(subFolder: string): string {
    let folder = normalizePath(subFolder);
    if (!folder.endsWith('/')) folder += '/';
    return folder;
  }

  private async pathsUnder(subFolder: string): Promise<{ prefix: string; paths: string[] }> {
    const prefix = this.folderPrefix(subFolder);
    const data = await this.call('GET', `/list?prefix=${encodeURIComponent(prefix)}`);
    return { prefix, paths: Array.isArray(data.paths) ? data.paths : [] };
  }

  /** List file names (not full paths) that are direct children of a folder. */
  async listFiles(subFolder: string): Promise<string[]> {
    const { prefix, paths } = await this.pathsUnder(subFolder);
    return paths
      .map((p) => p.slice(prefix.length))
      .filter((rest) => rest && !rest.includes('/'));
  }

  /** List immediate subdirectory names inside a folder. */
  async listDirectories(subFolder: string): Promise<string[]> {
    const { prefix, paths } = await this.pathsUnder(subFolder);
    const dirs = new Set<string>();
    paths.forEach((p) => {
      const rest = p.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash > 0) dirs.add(rest.slice(0, slash));
    });
    return Array.from(dirs);
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const data = await this.call('GET', `/exists?path=${encodeURIComponent(normalizePath(path))}`);
      return !!data.exists;
    } catch {
      return false;
    }
  }

  /**
   * Subscribe to changes made by others to any file of the space. Returns an
   * unsubscribe function. Also fires after a reconnection, in case something
   * changed while offline.
   */
  subscribe(onChange: () => void): () => void {
    this.fileListeners.add(onChange);
    this.ensureSocket();
    return () => {
      this.fileListeners.delete(onChange);
    };
  }

  // ── Invitations (admins) ───────────────────────────────────────────────────

  async listInvites(): Promise<CloudflareInviteInfo[]> {
    const data = await this.call('GET', '/tokens');
    return Array.isArray(data.tokens) ? data.tokens : [];
  }

  async createInvite(name: string, role: CloudflareRole): Promise<CloudflareInviteInfo & { token: string }> {
    return this.call('POST', '/tokens', { name, role });
  }

  async revokeInvite(id: string): Promise<void> {
    await this.call('DELETE', `/tokens?id=${encodeURIComponent(id)}`);
  }

  // ── Realtime records (lib/records) ─────────────────────────────────────────

  records(): RecordStore {
    if (this.recordStore) return this.recordStore;
    const rec = (body: unknown) => this.call('POST', '/rec', body);
    this.recordStore = {
      get: async (id) => (await rec({ op: 'get', id })).data ?? null,
      set: async (id, data) => {
        await rec({ op: 'set', id, data });
      },
      remove: async (id) => {
        await rec({ op: 'del', ids: [id] });
      },
      removeMany: async (ids) => {
        for (let i = 0; i < ids.length; i += 200) await rec({ op: 'del', ids: ids.slice(i, i + 200) });
      },
      query: async (field, value) => (await rec({ op: 'query', field, value })).items ?? [],
      transact: async (check, writes) => {
        const res = await rec({ op: 'txn', check, writes });
        return { ok: !!res.ok, current: res.current ?? null };
      },
      watch: (id, onData, onError) => this.addSub({ kind: 'doc', id, onData, onError }),
      watchQuery: (field, value, onChanges, onError) => {
        const sub: QuerySub = { kind: 'q', field, value, known: new Set(), gotFirst: false, onChanges, onError };
        const unsub = this.addSub(sub);
        // Callers wait for the first listing; don't let a dead connection block them.
        const timer = setTimeout(() => {
          if (!sub.gotFirst) onError?.(new Error('El backend no respondió a tiempo.'));
        }, FIRST_SNAPSHOT_TIMEOUT);
        return () => {
          clearTimeout(timer);
          unsub();
        };
      },
    };
    return this.recordStore;
  }

  private addSub(sub: Sub): () => void {
    const sid = randomId();
    this.subs.set(sid, sub);
    this.ensureSocket();
    if (this.authed) this.sendSub(sid, sub);
    return () => {
      if (!this.subs.delete(sid)) return;
      this.send({ t: 'unsub', sid });
    };
  }

  private sendSub(sid: string, sub: Sub) {
    if (sub.kind === 'doc') this.send({ t: 'sub', sid, k: 'doc', id: sub.id });
    else this.send({ t: 'sub', sid, k: 'q', f: sub.field, v: sub.value });
  }

  private send(msg: unknown) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(msg));
      } catch {
        /* closing */
      }
    }
  }

  private ensureSocket() {
    if (this.disposed || this.socket || this.retryTimer) return;
    const wsUrl = `${this.link.url.replace(/^http/i, 'ws')}/api/${encodeURIComponent(this.link.spaceId)}/ws`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      console.warn('Could not open realtime connection', err);
      this.scheduleReconnect();
      return;
    }
    this.socket = ws;
    this.authed = false;

    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'auth', token: this.link.token, client: this.clientId }));
    };
    ws.onmessage = (e) => this.onMessage(e.data);
    ws.onclose = (e) => {
      if (this.socket === ws) this.socket = null;
      this.authed = false;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.disposed) return;
      if (e.code === 4001) {
        console.warn('Realtime connection refused: invalid or revoked token');
        this.subs.forEach((s) => s.onError?.(new Error('Acceso revocado.')));
        this.reportAccessLost();
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.disposed || this.retryTimer) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.ensureSocket();
    }, delay);
  }

  private onMessage(raw: unknown) {
    if (typeof raw !== 'string' || raw === 'pong') return;
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.t) {
      case 'auth': {
        if (!msg.ok) return;
        this.authed = true;
        this.retryDelay = 1000;
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          if (this.socket?.readyState === WebSocket.OPEN) this.socket.send('ping');
        }, PING_EVERY);
        this.subs.forEach((sub, sid) => this.sendSub(sid, sub));
        // Something may have changed while we were disconnected.
        if (this.everConnected) this.fileListeners.forEach((fn) => fn());
        this.everConnected = true;
        return;
      }
      case 'files': {
        if (msg.by === this.clientId) return;
        this.fileListeners.forEach((fn) => fn());
        return;
      }
      case 'doc': {
        const sub = this.subs.get(msg.sid);
        if (sub?.kind === 'doc') sub.onData(msg.data ?? null);
        return;
      }
      case 'snap': {
        // Full listing (first one, or after a reconnection): diff it against what we knew.
        const sub = this.subs.get(msg.sid);
        if (sub?.kind !== 'q') return;
        const items: { id: string; data: any }[] = Array.isArray(msg.items) ? msg.items : [];
        const seen = new Set<string>();
        const changes: RecordChange[] = items.map((it) => {
          seen.add(it.id);
          return { type: sub.known.has(it.id) ? 'modified' : 'added', id: it.id, data: it.data };
        });
        sub.known.forEach((id) => {
          if (!seen.has(id)) changes.push({ type: 'removed', id, data: null });
        });
        sub.known = seen;
        sub.gotFirst = true;
        sub.onChanges(changes);
        return;
      }
      case 'chg': {
        const sub = this.subs.get(msg.sid);
        if (sub?.kind !== 'q' || !Array.isArray(msg.changes)) return;
        (msg.changes as RecordChange[]).forEach((c) => {
          if (c.type === 'removed') sub.known.delete(c.id);
          else sub.known.add(c.id);
        });
        sub.onChanges(msg.changes);
        return;
      }
    }
  }

  /** Close the realtime connection (used when closing a project). */
  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
    this.fileListeners.clear();
    this.subs.clear();
    try {
      this.socket?.close();
    } catch {
      /* ignore */
    }
    this.socket = null;
  }
}
