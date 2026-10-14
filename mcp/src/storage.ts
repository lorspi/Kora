/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Storage backends for the Kora MCP server. Both mirror the path-based file API of
 * the app's adapters (src/lib/fs.ts and src/lib/firebase.ts), so the server reads
 * and writes exactly the same files the app does:
 *   - LocalStorage: a project folder on disk (the app's "carpeta local" projects).
 *   - FirebaseStorage: the team's Firestore (the app's cloud projects), one document
 *     per file under kora/{spaceId}/files/{path with "/" → "__"}.
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
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
  type Firestore,
} from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

export interface Storage {
  /** Human-readable description of where the project lives. */
  readonly label: string;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  listFiles(folder: string): Promise<string[]>;
  listDirectories(folder: string): Promise<string[]>;
  fileExists(path: string): Promise<boolean>;
}

/** Same normalization as the app: forward slashes and a leading "/". */
export function normalizePath(p: string): string {
  let cleaned = p.replace(/\\/g, '/');
  if (!cleaned.startsWith('/')) cleaned = '/' + cleaned;
  return cleaned;
}

export class LocalStorage implements Storage {
  readonly label: string;
  private root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.label = `carpeta local ${this.root}`;
  }

  /** Absolute path for a project path; never lets a path escape the project folder. */
  private resolve(p: string): string {
    const abs = path.resolve(this.root, '.' + normalizePath(p));
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) {
      throw new Error(`Ruta fuera del proyecto: ${p}`);
    }
    return abs;
  }

  async readTextFile(p: string): Promise<string> {
    return fsp.readFile(this.resolve(p), 'utf-8');
  }

  /** Written to a temporary file and renamed, so the app never reads a half-written JSON. */
  async writeTextFile(p: string, content: string): Promise<void> {
    const abs = this.resolve(p);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.${randomUUID()}.tmp`;
    await fsp.writeFile(tmp, content, 'utf-8');
    await fsp.rename(tmp, abs);
  }

  async deleteFile(p: string): Promise<void> {
    await fsp.rm(this.resolve(p), { force: true });
  }

  private async entries(folder: string) {
    try {
      return await fsp.readdir(this.resolve(folder), { withFileTypes: true });
    } catch {
      return [];
    }
  }

  async listFiles(folder: string): Promise<string[]> {
    return (await this.entries(folder)).filter((e) => e.isFile()).map((e) => e.name);
  }

  async listDirectories(folder: string): Promise<string[]> {
    return (await this.entries(folder)).filter((e) => e.isDirectory()).map((e) => e.name);
  }

  async fileExists(p: string): Promise<boolean> {
    try {
      return (await fsp.stat(this.resolve(p))).isFile();
    } catch {
      return false;
    }
  }
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

/** Firestore ids cannot contain "/" (same encoding as the app). */
function pathToDocId(p: string): string {
  return normalizePath(p).replace(/^\//, '').replace(/\//g, '__');
}

function folderPrefix(folder: string): string {
  const f = normalizePath(folder);
  return f.endsWith('/') ? f : f + '/';
}

export class FirebaseStorage implements Storage {
  readonly label: string;
  private db: Firestore;
  private spaceId: string;
  private ready: Promise<void>;

  constructor(config: FirebaseConfig, spaceId = 'default') {
    this.spaceId = spaceId || 'default';
    this.label = `Firebase ${config.projectId} (espacio "${this.spaceId}")`;
    const name = `kora-mcp-${config.projectId}`;
    const app: FirebaseApp = getApps().find((a) => a.name === name) ?? initializeApp({ ...config }, name);
    this.db = getFirestore(app);
    const auth = getAuth(app);
    // The team's security rules require auth; the app signs in anonymously too.
    this.ready = auth.currentUser
      ? Promise.resolve()
      : signInAnonymously(auth).then(
          () => undefined,
          (err) => {
            throw new Error(
              'No se pudo autenticar con Firebase (¿está habilitado el inicio de sesión anónimo?): ' +
                (err?.message || String(err))
            );
          }
        );
  }

  private files() {
    return collection(this.db, 'kora', this.spaceId, 'files');
  }

  private fileDoc(p: string) {
    return doc(this.db, 'kora', this.spaceId, 'files', pathToDocId(p));
  }

  /** Paths under a folder (range query on `path`, like the app; skips collab records). */
  private async pathsUnder(folder: string): Promise<string[]> {
    await this.ready;
    const prefix = folderPrefix(folder);
    const snap = await getDocs(
      query(this.files(), where('path', '>=', prefix), where('path', '<', prefix + ''))
    );
    const paths: string[] = [];
    snap.forEach((d) => {
      const p = normalizePath(String(d.data().path || ''));
      if (p.startsWith(prefix)) paths.push(p.slice(prefix.length));
    });
    return paths;
  }

  async readTextFile(p: string): Promise<string> {
    await this.ready;
    const snap = await getDoc(this.fileDoc(p));
    if (!snap.exists()) throw new Error(`Archivo no encontrado: ${normalizePath(p)}`);
    const content = snap.data().content;
    return typeof content === 'string' ? content : '';
  }

  async writeTextFile(p: string, content: string): Promise<void> {
    await this.ready;
    const normalized = normalizePath(p);
    await setDoc(this.fileDoc(normalized), { path: normalized, content, isBinary: false, updatedAt: Date.now() });
  }

  async deleteFile(p: string): Promise<void> {
    await this.ready;
    await deleteDoc(this.fileDoc(p));
  }

  async listFiles(folder: string): Promise<string[]> {
    return (await this.pathsUnder(folder)).filter((rest) => rest && !rest.includes('/'));
  }

  async listDirectories(folder: string): Promise<string[]> {
    const dirs = new Set<string>();
    for (const rest of await this.pathsUnder(folder)) {
      const slash = rest.indexOf('/');
      if (slash > 0) dirs.add(rest.slice(0, slash));
    }
    return [...dirs];
  }

  async fileExists(p: string): Promise<boolean> {
    await this.ready;
    return (await getDoc(this.fileDoc(p))).exists();
  }
}
