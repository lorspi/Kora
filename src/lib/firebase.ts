/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Firebase (Firestore) storage adapter for Kora.
 *
 * This provides a "Bring Your Own Backend" cloud mode: each team creates their
 * own Firebase project in the Firebase console, pastes the public config object
 * into Kora, and the app talks directly to their Firestore from the browser.
 * No Kora-owned backend is involved.
 *
 * The adapter mirrors the public interface of FileSystemAdapter (src/lib/fs.ts)
 * so the rest of the app (store, CRUD, locks, polling) works unchanged.
 *
 * Storage model:
 *   Every "file" (e.g. "/tasks/abc.json") maps to a single Firestore document
 *   inside a flat collection. The document id is the path with "/" replaced by
 *   a safe separator (Firestore ids cannot contain "/"). Each document holds:
 *     { path: string, content: string, isBinary: boolean, updatedAt: number }
 *   Binary blobs are stored base64-encoded in `content`.
 *
 *   All documents live under a per-project root:  kora/{spaceId}/files/{docId}
 *   so multiple Kora spaces can share one Firebase project if desired.
 */

import { initializeApp, getApps, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  runTransaction,
  writeBatch,
  type Firestore,
  type DocumentReference,
  type CollectionReference,
} from 'firebase/firestore';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { normalizePath } from './fs';
import type { RecordStore } from './records';

/** Shape of the public Firebase web config object the user pastes from the console. */
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
}

/** The fields we require to consider a config valid. */
const REQUIRED_CONFIG_KEYS: (keyof FirebaseConfig)[] = ['apiKey', 'authDomain', 'projectId', 'appId'];

/**
 * Parse and validate a Firebase config from either a JSON object or the raw
 * `const firebaseConfig = { ... };` snippet the console shows.
 * Throws a descriptive (Spanish) error if it cannot be parsed.
 */
export function parseFirebaseConfig(input: string): FirebaseConfig {
  const raw = (input || '').trim();
  if (!raw) {
    throw new Error('Pega el objeto de configuración de Firebase.');
  }

  let obj: any = null;

  // Try direct JSON first.
  try {
    obj = JSON.parse(raw);
  } catch {
    // Fall through to snippet extraction.
  }

  if (!obj) {
    // Extract the { ... } block from a JS snippet like:
    // const firebaseConfig = { apiKey: "...", ... };
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      let body = match[0];
      // Quote unquoted keys:  apiKey:  ->  "apiKey":
      body = body.replace(/([,{]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');
      // Convert single quotes to double quotes.
      body = body.replace(/'/g, '"');
      // Remove trailing commas.
      body = body.replace(/,(\s*[}\]])/g, '$1');
      try {
        obj = JSON.parse(body);
      } catch (e) {
        throw new Error('No se pudo interpretar la configuración. Copia el objeto tal cual aparece en la consola de Firebase.');
      }
    }
  }

  if (!obj || typeof obj !== 'object') {
    throw new Error('Configuración inválida. Debe ser un objeto con apiKey, authDomain, projectId y appId.');
  }

  const missing = REQUIRED_CONFIG_KEYS.filter((k) => !obj[k]);
  if (missing.length > 0) {
    throw new Error(`Faltan campos en la configuración: ${missing.join(', ')}.`);
  }

  const cfg: FirebaseConfig = {
    apiKey: String(obj.apiKey),
    authDomain: String(obj.authDomain),
    projectId: String(obj.projectId),
    appId: String(obj.appId),
  };
  if (obj.storageBucket) cfg.storageBucket = String(obj.storageBucket);
  if (obj.messagingSenderId) cfg.messagingSenderId = String(obj.messagingSenderId);
  if (obj.measurementId) cfg.measurementId = String(obj.measurementId);
  return cfg;
}

/**
 * Initialize (or reuse) a Firebase app for a given config. We name the app after
 * the projectId so multiple teams' projects can coexist without clashing with a
 * default app instance.
 */
function getFirebaseApp(config: FirebaseConfig): FirebaseApp {
  const name = `kora-${config.projectId}`;
  const existing = getApps().find((a) => a.name === name);
  if (existing) return existing;
  return initializeApp({ ...config }, name);
}

/**
 * Ensure the client is signed in (anonymously) so Firestore security rules that
 * require `request.auth != null` allow access. Anonymous auth must be enabled in
 * the team's Firebase console. If it is disabled, we surface a helpful error.
 */
async function ensureSignedIn(auth: Auth): Promise<void> {
  if (auth.currentUser) return;
  try {
    await signInAnonymously(auth);
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
      throw new Error(
        'El inicio de sesión anónimo no está habilitado. Actívalo en Firebase Console → Authentication → Sign-in method → Anónimo.'
      );
    }
    if (code === 'auth/configuration-not-found') {
      throw new Error(
        'Authentication no está configurado en tu proyecto. Ve a Firebase Console → Authentication → Comenzar, y habilita el proveedor Anónimo.'
      );
    }
    throw new Error('No se pudo autenticar con Firebase: ' + (err?.message || String(err)));
  }
}

/** Encode a normalized path into a Firestore-safe document id. */
function pathToDocId(path: string): string {
  // Firestore ids cannot contain "/". Use a rare separator token.
  return normalizePath(path).replace(/^\//, '').replace(/\//g, '__');
}

const textEncoder = new TextEncoder();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is a data URL: "data:...;base64,XXXX" — keep only the payload.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string): Blob {
  const byteChars = atob(b64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i);
  }
  return new Blob([bytes]);
}

/**
 * Test that a config can actually reach Firestore. Attempts a lightweight read.
 * Throws a friendly error if the project is unreachable or rules deny access.
 */
export async function testFirebaseConnection(config: FirebaseConfig, spaceId = 'default'): Promise<void> {
  const app = getFirebaseApp(config);
  const db = getFirestore(app);
  const auth = getAuth(app);
  // Sign in first so rules requiring auth don't produce a false negative.
  await ensureSignedIn(auth);
  try {
    // Reading a (likely) nonexistent doc is enough to exercise auth + rules.
    // NOTE: Firestore reserves ids that start & end with double underscores,
    // so we use a plain reserved-safe id here.
    await getDoc(doc(db, 'kora', spaceId, 'files', 'kora-connection-test'));
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'permission-denied') {
      throw new Error('Conexión establecida, pero las reglas de seguridad denegaron el acceso. Revisa las reglas de Firestore.');
    }
    if (code === 'unavailable' || code === 'failed-precondition') {
      throw new Error('No se pudo conectar a Firestore. ¿Creaste la base de datos Firestore en tu proyecto?');
    }
    throw new Error('No se pudo conectar a Firebase. Verifica la configuración: ' + (err?.message || String(err)));
  }
}

/**
 * Firestore-backed storage adapter. Mirrors FileSystemAdapter's public API.
 */
export class FirebaseAdapter {
  private app: FirebaseApp;
  private db: Firestore;
  private auth: Auth;
  private spaceId: string;
  private config: FirebaseConfig;
  private authReady: Promise<void>;

  constructor(config: FirebaseConfig, spaceId = 'default') {
    this.config = config;
    this.spaceId = spaceId || 'default';
    this.app = getFirebaseApp(config);
    this.db = getFirestore(this.app);
    this.auth = getAuth(this.app);
    // Kick off anonymous sign-in once; every op awaits this before touching Firestore.
    this.authReady = ensureSignedIn(this.auth);
  }

  /** Await anonymous sign-in. Safe to call repeatedly. */
  async ready(): Promise<void> {
    await this.authReady;
  }

  /** Identifies this adapter as the cloud engine (mirrors FileSystemAdapter.getMode). */
  getMode(): 'FIREBASE' {
    return 'FIREBASE';
  }

  getConfig(): FirebaseConfig {
    return this.config;
  }

  getSpaceId(): string {
    return this.spaceId;
  }

  /** FileSystemAdapter compatibility: there is no directory handle in cloud mode. */
  getDirectoryHandle(): null {
    return null;
  }

  private filesCollection() {
    return collection(this.db, 'kora', this.spaceId, 'files');
  }

  private recordStore: RecordStore | null = null;

  /**
   * Realtime records for collaborative editing (lib/collab, lib/docPresence). They
   * live in the same collection as the files, so the security rules teams already
   * have cover them, but they carry no `path` field: file listings and the change
   * subscription (both filtered on `path`) never see them.
   */
  records(): RecordStore {
    if (this.recordStore) return this.recordStore;
    const db: Firestore = this.db;
    const coll: CollectionReference = this.filesCollection();
    const ref = (id: string): DocumentReference => doc(this.db, 'kora', this.spaceId, 'files', id);
    const authReady = () => this.authReady;
    this.recordStore = {
      async get(id) {
        await authReady();
        const snap = await getDoc(ref(id));
        return snap.exists() ? snap.data() : null;
      },
      async set(id, data) {
        await authReady();
        await setDoc(ref(id), data);
      },
      async remove(id) {
        await authReady();
        await deleteDoc(ref(id));
      },
      async removeMany(ids) {
        await authReady();
        // Firestore batches hold up to 500 writes.
        for (let i = 0; i < ids.length; i += 400) {
          const batch = writeBatch(db);
          ids.slice(i, i + 400).forEach((id) => batch.delete(ref(id)));
          await batch.commit();
        }
      },
      async query(field, value) {
        await authReady();
        const snap = await getDocs(query(coll, where(field, '==', value)));
        return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
      },
      watch(id, onData, onError) {
        let unsub = () => {};
        let closed = false;
        authReady().then(() => {
          if (closed) return;
          unsub = onSnapshot(ref(id), (snap) => onData(snap.exists() ? snap.data() : null), onError);
        }, onError);
        return () => {
          closed = true;
          unsub();
        };
      },
      watchQuery(field, value, onChanges, onError) {
        let unsub = () => {};
        let closed = false;
        authReady().then(() => {
          if (closed) return;
          unsub = onSnapshot(
            query(coll, where(field, '==', value)),
            (snap) => onChanges(snap.docChanges().map((c) => ({ type: c.type, id: c.doc.id, data: c.doc.data() }))),
            onError
          );
        }, onError);
        return () => {
          closed = true;
          unsub();
        };
      },
      async transact(check, writes) {
        await authReady();
        return runTransaction(db, async (tx) => {
          const cur = await tx.get(ref(check.id));
          const current = cur.exists() ? cur.data() : null;
          if ((current?.[check.field] ?? null) !== check.expect) return { ok: false, current };
          for (const w of writes) {
            if (w.op === 'update') tx.update(ref(w.id), w.data);
            else tx.set(ref(w.id), w.data);
          }
          return { ok: true, current };
        });
      },
    };
    return this.recordStore;
  }

  private fileDoc(path: string) {
    return doc(this.db, 'kora', this.spaceId, 'files', pathToDocId(path));
  }

  async readTextFile(path: string): Promise<string> {
    await this.authReady;
    const snap = await getDoc(this.fileDoc(path));
    if (!snap.exists()) {
      throw new Error(`Archivo no encontrado: ${normalizePath(path)}`);
    }
    const data = snap.data() as any;
    return typeof data.content === 'string' ? data.content : '';
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    await this.authReady;
    const normalized = normalizePath(path);
    await setDoc(this.fileDoc(normalized), {
      path: normalized,
      content,
      isBinary: false,
      updatedAt: Date.now(),
    });
  }

  async writeBinaryFile(path: string, blob: Blob): Promise<void> {
    await this.authReady;
    const normalized = normalizePath(path);
    const b64 = await blobToBase64(blob);
    await setDoc(this.fileDoc(normalized), {
      path: normalized,
      content: b64,
      isBinary: true,
      updatedAt: Date.now(),
    });
  }

  async readBinaryFile(path: string): Promise<Blob> {
    await this.authReady;
    const snap = await getDoc(this.fileDoc(path));
    if (!snap.exists()) {
      throw new Error(`Archivo no encontrado: ${normalizePath(path)}`);
    }
    const data = snap.data() as any;
    if (data.isBinary) {
      return base64ToBlob(String(data.content || ''));
    }
    // Stored as text — return as a text blob.
    return new Blob([textEncoder.encode(String(data.content || ''))]);
  }

  async deleteFile(path: string): Promise<void> {
    try {
      await this.authReady;
      await deleteDoc(this.fileDoc(path));
    } catch (err) {
      console.warn(`No se pudo eliminar el archivo: ${path}`, err);
    }
  }

  /** Delete every file whose path starts with the given folder prefix. */
  async deleteDirectory(subFolder: string): Promise<void> {
    await this.authReady;
    const prefix = this.folderPrefix(subFolder);
    const snap = await getDocs(this.filesUnder(prefix));
    const deletions: Promise<void>[] = [];
    snap.forEach((d) => {
      const p = normalizePath((d.data() as any).path || '');
      if (p.startsWith(prefix)) {
        deletions.push(deleteDoc(d.ref));
      }
    });
    await Promise.all(deletions);
  }

  private folderPrefix(subFolder: string): string {
    let folder = normalizePath(subFolder);
    if (!folder.endsWith('/')) folder += '/';
    return folder;
  }

  /**
   * Files whose path starts with `prefix`, as a range query on `path`. Only
   * downloads that folder, and never the collaboration documents (lib/collab),
   * which share the collection but have no `path` field.
   */
  private filesUnder(prefix: string) {
    return query(this.filesCollection(), where('path', '>=', prefix), where('path', '<', prefix + ''));
  }

  /** List file names (not full paths) that are direct children of a folder. */
  async listFiles(subFolder: string): Promise<string[]> {
    await this.authReady;
    const prefix = this.folderPrefix(subFolder);
    const snap = await getDocs(this.filesUnder(prefix));
    const names: string[] = [];
    snap.forEach((d) => {
      const p = normalizePath((d.data() as any).path || '');
      if (p.startsWith(prefix)) {
        const rest = p.slice(prefix.length);
        // Direct child only (no nested folders).
        if (rest && !rest.includes('/')) {
          names.push(rest);
        }
      }
    });
    return names;
  }

  /** List immediate subdirectory names inside a folder. */
  async listDirectories(subFolder: string): Promise<string[]> {
    await this.authReady;
    const prefix = this.folderPrefix(subFolder);
    const snap = await getDocs(this.filesUnder(prefix));
    const dirs = new Set<string>();
    snap.forEach((d) => {
      const p = normalizePath((d.data() as any).path || '');
      if (p.startsWith(prefix)) {
        const rest = p.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash > 0) {
          dirs.add(rest.slice(0, slash));
        }
      }
    });
    return Array.from(dirs);
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      await this.authReady;
      const snap = await getDoc(this.fileDoc(path));
      return snap.exists();
    } catch {
      return false;
    }
  }

  /**
   * Subscribe to realtime changes across all files in this space. The callback
   * fires whenever any document changes. Returns an unsubscribe function.
   * This is what makes cloud mode feel instant vs. shared-folder sync.
   */
  subscribe(onChange: () => void): () => void {
    try {
      const q = query(this.filesCollection(), where('path', '!=', ''));
      return onSnapshot(
        q,
        (snap) => {
          // Ignore local-only echo writes to reduce churn; still fire on remote.
          if (!snap.metadata.hasPendingWrites) {
            onChange();
          }
        },
        (err) => {
          console.warn('Realtime subscription error', err);
        }
      );
    } catch (err) {
      console.warn('Could not establish realtime subscription', err);
      return () => {};
    }
  }

  /** Release the underlying Firebase app (used when closing a project). */
  async dispose(): Promise<void> {
    try {
      const name = `kora-${this.config.projectId}`;
      const app = getApps().find((a) => a.name === name);
      if (app) await deleteApp(app);
    } catch (err) {
      console.warn('Could not dispose Firebase app', err);
    }
  }
}

/** Recommended Firestore security rules template shown to users in the UI. */
export const FIRESTORE_RULES_TEMPLATE = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Kora: solo usuarios autenticados pueden leer/escribir los datos del equipo.
    match /kora/{space}/files/{document} {
      allow read, write: if request.auth != null;
    }
  }
}`;
