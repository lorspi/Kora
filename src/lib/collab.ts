/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Realtime collaborative editing of documents in cloud projects (Firebase or
 * Cloudflare).
 *
 * Several people can edit the same document at once, Google Docs style: their
 * edits merge as they type (Yjs CRDT) and everyone sees the others' text cursors
 * and selections. There is no Kora server: the transport is the team's own
 * backend, through the realtime records of its adapter (lib/records): Firestore
 * documents in the same `files` collection the rest of the project uses (so the
 * security rules teams already have keep working), or the records of the team's
 * Cloudflare backend.
 *
 * The Markdown file in /docs stays the source of truth on disk. The collaborative
 * state only lives while people edit: it is seeded from the file, editors keep
 * saving the merged result back to the file (see DocView), and when the file
 * changes outside a collaborative session the state is re-seeded from it.
 *
 * Records (in Firestore, ids in the files collection; none has a `path` field, so
 * file listings and the change subscription never see them):
 *   collab-state~{docId}            { epoch, seed }  Base Yjs state of the current
 *                                    epoch (written on creation, re-seed, compaction).
 *   collab-saved~{docId}            { epoch, hash }  Hash of the last Markdown saved to
 *                                    the file, so each editor knows whether the file is
 *                                    behind the shared state.
 *   collab-up~{docId}~{random}      { stream, u }    One batch of Yjs updates. Folded
 *                                    into the seed (and deleted) once there are many.
 *   collab-peer~{docId}~{clientId}  { a, t, ... }    One editor session: its awareness
 *                                    (user, cursor, selection), renewed while open.
 *
 * Yjs updates are idempotent and commutative, so duplicates (two clients compacting
 * at once, a seed that repeats updates) are harmless; the only thing that must
 * never happen is two clients seeding the same epoch, which a transaction prevents.
 */
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { getSchema, generateJSON, type AnyExtension } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { prosemirrorJSONToYDoc, ySyncPluginKey } from '@tiptap/y-tiptap';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import type { CloudAdapterLike, RecordStore } from './records';
import { PEER_KIND, PEER_ACTIVE_WINDOW } from './docPresence';
import { buildExtensions } from '../components/editor/extensions';
import { markdownToTiptapHtml, normalizeMarkdown, pmDocToMarkdown } from './tiptapMarkdown';

const STATE_KIND = 'kora-collab-state';
const SAVED_KIND = 'kora-collab-saved';
const UPDATE_KIND = 'kora-collab-update';

/** Batching of local edits before they are written: fast with company, lazy alone. */
const FLUSH_DELAY_SHARED = 250;
const FLUSH_DELAY_ALONE = 2500;
/** Same for cursor/selection moves. */
const PEER_DELAY_SHARED = 250;
const PEER_DELAY_ALONE = 2500;
/** Update records before they are folded into the seed. */
const COMPACT_AT = 60;
/** Firestore documents are capped at 1 MiB; leave room for the other fields. */
const MAX_SEED_LENGTH = 900_000;
/** Peer records older than this are leftovers of closed tabs and get deleted. */
const PEER_GC_AGE = 10 * 60_000;

export interface CollabUser {
  id: string;
  name: string;
  color: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** cyrb53: a fast, well-distributed 53-bit string hash. */
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Identity of a Markdown text, as saved to the file. */
export function hashMarkdown(markdown: string): string {
  return `${markdown.length}-${cyrb53(normalizeMarkdown(markdown))}`;
}

let schemaCache: { extensions: AnyExtension[]; schema: ReturnType<typeof getSchema> } | null = null;
function editorSchema() {
  if (!schemaCache) {
    const extensions = buildExtensions() as AnyExtension[];
    schemaCache = { extensions, schema: getSchema(extensions) };
  }
  return schemaCache;
}

function markdownToJSON(markdown: string) {
  return generateJSON(markdownToTiptapHtml(normalizeMarkdown(markdown)), editorSchema().extensions);
}

/**
 * The editor's own serialization of a Markdown text. The round-trip is not always
 * byte-identical, so a document whose content equals this counts as unchanged.
 */
export function canonicalMarkdown(markdown: string): string {
  return pmDocToMarkdown(markdownToJSON(markdown) as any);
}

/** Initial Yjs state for a document, from its Markdown. */
function seedFromMarkdown(markdown: string): string {
  const ydoc = prosemirrorJSONToYDoc(editorSchema().schema, markdownToJSON(markdown), 'default');
  const seed = toBase64(Y.encodeStateAsUpdate(ydoc));
  ydoc.destroy();
  return seed;
}

/** Whether an editor transaction came from someone else's edit (not ours, nor our undo). */
export function isRemoteTransaction(tr: Transaction): boolean {
  const meta = tr.getMeta(ySyncPluginKey);
  return !!meta?.isChangeOrigin && !meta?.isUndoRedoOperation;
}

const stateId = (docId: string) => `collab-state~${docId}`;
const savedId = (docId: string) => `collab-saved~${docId}`;
const updateId = (docId: string) => `collab-up~${docId}~${randomId()}`;
const peerId = (docId: string, clientId: number) => `collab-peer~${docId}~${clientId}`;

// ─── Session ────────────────────────────────────────────────────────────────────

export interface CollabPeer {
  clientId: number;
  userId: string;
  name: string;
  color: string;
}

type Access = RecordStore;
type DocumentData = Record<string, any>;

/**
 * One open document, connected to its collaborative state. Created by
 * openCollabSession; DocView destroys it when the document closes.
 */
export class CollabSession {
  readonly ydoc = new Y.Doc();
  readonly awareness: Awareness;
  readonly docId: string;
  readonly epoch: string;
  readonly user: CollabUser;
  /** Hash of the Markdown last saved to the file (see hashMarkdown). */
  savedHash: string | null;

  private fx: Access;
  private lastSeed: string;
  private knownUpdates = new Set<string>();
  private pending: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private peerTimer: ReturnType<typeof setTimeout> | null = null;
  private compactTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubs: (() => void)[] = [];
  private listeners = new Set<() => void>();
  private resetListeners = new Set<() => void>();
  private destroyed = false;

  constructor(fx: Access, docId: string, state: DocumentData, savedHash: string | null, user: CollabUser) {
    this.fx = fx;
    this.docId = docId;
    this.epoch = state.epoch;
    this.lastSeed = state.seed;
    this.savedHash = savedHash;
    this.user = user;
    Y.applyUpdate(this.ydoc, fromBase64(state.seed), this);
    this.awareness = new Awareness(this.ydoc);
  }

  /** Subscribe to the shared state; resolves once the existing edits are applied. */
  async start(): Promise<void> {
    const fx = this.fx;

    this.ydoc.on('update', this.onLocalUpdate);
    this.awareness.on('update', this.onAwarenessUpdate);

    // Re-seeded under us (the file changed while nobody was editing): start over.
    this.unsubs.push(fx.watch(stateId(this.docId), (data) => {
      if (!data || data.epoch !== this.epoch) {
        this.resetListeners.forEach((fn) => fn());
        return;
      }
      if (typeof data.seed === 'string' && data.seed !== this.lastSeed) {
        this.lastSeed = data.seed;
        Y.applyUpdate(this.ydoc, fromBase64(data.seed), this);
      }
    }, (err) => console.warn('Collab state subscription error', err)));

    this.unsubs.push(fx.watch(savedId(this.docId), (data) => {
      if (data && data.epoch === this.epoch && typeof data.hash === 'string' && data.hash !== this.savedHash) {
        this.savedHash = data.hash;
        this.emit();
      }
    }, (err) => console.warn('Collab saved subscription error', err)));

    this.unsubs.push(fx.watchQuery('peerDoc', this.docId, (changes) => {
      const now = Date.now();
      changes.forEach((change) => {
        const data = change.data || {};
        const clientId = Number(data.clientId);
        if (!clientId || clientId === this.ydoc.clientID) return;
        if (change.type === 'removed') {
          removeAwarenessStates(this.awareness, [clientId], 'remote');
          return;
        }
        // A record that stopped renewing long ago is a tab that closed without cleanup.
        if (change.type === 'added' && !(Number(data.t) > now - PEER_ACTIVE_WINDOW)) return;
        try {
          applyAwarenessUpdate(this.awareness, fromBase64(String(data.a || '')), 'remote');
        } catch {
          /* malformed peer record */
        }
      });
    }, (err) => console.warn('Collab peers subscription error', err)));

    // Edits made since the seed. Waiting for the first snapshot means the editor
    // opens with the current shared content rather than filling in after.
    await new Promise<void>((resolve) => {
      let first = true;
      const stream = `${this.docId}:${this.epoch}`;
      this.unsubs.push(fx.watchQuery('stream', stream, (changes) => {
        const updates: Uint8Array[] = [];
        changes.forEach((change) => {
          if (change.type === 'removed') {
            this.knownUpdates.delete(change.id);
            return;
          }
          this.knownUpdates.add(change.id);
          const u = change.data?.u;
          if (typeof u === 'string') updates.push(fromBase64(u));
        });
        if (updates.length) {
          try {
            Y.applyUpdate(this.ydoc, Y.mergeUpdates(updates), this);
          } catch (err) {
            console.warn('Could not apply collaborative update', err);
          }
        }
        if (first) {
          first = false;
          resolve();
        }
        this.maybeCompact();
      }, (err) => {
        console.warn('Collab updates subscription error', err);
        if (first) {
          first = false;
          resolve();
        }
      }));
    });

    // Announce ourselves right away so others (and the documents view) see us.
    this.awareness.setLocalStateField('user', { name: this.user.name, color: this.user.color, userId: this.user.id });
    void this.writePeer();
  }

  /** Others currently in the document (one entry per editor session). */
  getPeers(): CollabPeer[] {
    const peers: CollabPeer[] = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId === this.ydoc.clientID || !state?.user) return;
      peers.push({ clientId, userId: state.user.userId, name: state.user.name, color: state.user.color });
    });
    return peers;
  }

  private hasPeers(): boolean {
    return this.awareness.getStates().size > 1;
  }

  /** Called on peer and saved-hash changes. Returns an unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Called when the shared state was re-seeded and the session must be reopened. */
  onReset(fn: () => void): () => void {
    this.resetListeners.add(fn);
    return () => this.resetListeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  /** Record that `markdown` is now what the file holds. */
  async markSaved(markdown: string): Promise<void> {
    const hash = hashMarkdown(markdown);
    this.savedHash = hash;
    this.emit();
    try {
      await this.fx.set(savedId(this.docId), {
        kind: SAVED_KIND,
        docId: this.docId,
        epoch: this.epoch,
        hash,
        by: this.user.id,
        at: Date.now(),
      });
    } catch (err) {
      console.warn('Could not record collaborative save', err);
    }
  }

  // ── Local edits → Firestore ─────────────────────────────────────────────────

  private onLocalUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.destroyed) return;
    this.pending.push(update);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => void this.flush(), this.hasPeers() ? FLUSH_DELAY_SHARED : FLUSH_DELAY_ALONE);
    }
  };

  /** Write pending local edits as one update record. */
  async flush(): Promise<void> {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.pending.length) return;
    const merged = Y.mergeUpdates(this.pending);
    this.pending = [];
    try {
      await this.fx.set(updateId(this.docId), {
        kind: UPDATE_KIND,
        updDoc: this.docId,
        stream: `${this.docId}:${this.epoch}`,
        u: toBase64(merged),
        at: Date.now(),
      });
    } catch (err) {
      console.warn('Could not send collaborative edit; retrying', err);
      if (this.destroyed) return;
      this.pending.unshift(merged);
      if (!this.flushTimer) this.flushTimer = setTimeout(() => void this.flush(), 3000);
    }
  }

  /** Fold the update records into the seed so joining stays cheap. */
  private maybeCompact() {
    if (this.compactTimer || this.knownUpdates.size < COMPACT_AT) return;
    // Spread out so concurrent editors rarely compact at once (harmless if they do).
    this.compactTimer = setTimeout(() => void this.compact(), 2000 + Math.random() * 6000);
  }

  private async compact() {
    this.compactTimer = null;
    if (this.destroyed || this.knownUpdates.size < COMPACT_AT) return;
    // Everything listed here has been applied to our doc, so the new seed covers it.
    const folded = Array.from(this.knownUpdates);
    const seed = toBase64(Y.encodeStateAsUpdate(this.ydoc));
    if (seed.length > MAX_SEED_LENGTH) return;
    try {
      const { ok } = await this.fx.transact(
        { id: stateId(this.docId), field: 'epoch', expect: this.epoch },
        [{ op: 'update', id: stateId(this.docId), data: { seed, at: Date.now() } }]
      );
      if (!ok) return;
      this.lastSeed = seed;
      await this.fx.removeMany(folded);
    } catch (err) {
      console.warn('Collaborative compaction skipped', err);
    }
  }

  // ── Presence (cursor, selection, who is here) ───────────────────────────────

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    if (this.destroyed) return;
    const me = this.ydoc.clientID;
    if (origin !== 'remote' && [...added, ...updated, ...removed].includes(me) && !this.peerTimer) {
      this.peerTimer = setTimeout(() => void this.writePeer(), this.hasPeers() ? PEER_DELAY_SHARED : PEER_DELAY_ALONE);
    }
    // Joins and leaves only; cursor moves are drawn by the editor itself.
    if (added.length || removed.length) this.emit();
  };

  /**
   * Presence writes, one after another: a backend reached over plain HTTP may get
   * parallel requests out of order, and a late write would re-create the record
   * after destroy() removed it (a ghost editor in the others' views).
   */
  private peerChain: Promise<void> = Promise.resolve();

  private writePeer(): Promise<void> {
    if (this.peerTimer) clearTimeout(this.peerTimer);
    this.peerTimer = null;
    if (this.destroyed) return this.peerChain;
    const clientId = this.ydoc.clientID;
    this.peerChain = this.peerChain.then(async () => {
      if (this.destroyed) return;
      try {
        await this.fx.set(peerId(this.docId, clientId), {
          kind: PEER_KIND,
          peerDoc: this.docId,
          clientId,
          userId: this.user.id,
          name: this.user.name,
          color: this.user.color,
          a: toBase64(encodeAwarenessUpdate(this.awareness, [clientId])),
          t: Date.now(),
        });
      } catch (err) {
        console.warn('Could not share cursor position', err);
      }
    });
    return this.peerChain;
  }

  /** TipTap extensions binding an editor to this session. */
  editorExtensions(): AnyExtension[] {
    return [
      Collaboration.configure({ document: this.ydoc, field: 'default' }),
      CollaborationCaret.configure({
        provider: { awareness: this.awareness },
        user: { name: this.user.name, color: this.user.color, userId: this.user.id },
        render: (user) => {
          const caret = document.createElement('span');
          caret.classList.add('collaboration-carets__caret');
          caret.style.borderColor = user.color;
          const label = document.createElement('div');
          label.classList.add('collaboration-carets__label');
          label.style.backgroundColor = user.color;
          label.textContent = user.name;
          caret.appendChild(label);
          return caret;
        },
        selectionRender: (user) => ({
          nodeName: 'span',
          class: 'collaboration-carets__selection',
          style: `background-color: ${user.color}33`,
        }),
      }),
    ];
  }

  /** Leave the document: send what is pending and remove our presence. */
  destroy() {
    if (this.destroyed) return;
    void this.flush();
    this.destroyed = true;
    if (this.peerTimer) clearTimeout(this.peerTimer);
    if (this.compactTimer) clearTimeout(this.compactTimer);
    this.unsubs.forEach((fn) => fn());
    this.unsubs = [];
    this.listeners.clear();
    this.resetListeners.clear();
    this.ydoc.off('update', this.onLocalUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);
    // After any presence write still on its way (see peerChain).
    const clientId = this.ydoc.clientID;
    this.peerChain.finally(() => this.fx.remove(peerId(this.docId, clientId)).catch(() => {}));
    this.awareness.destroy();
    // The doc itself is left to GC: the editor may still be unmounting with it.
  }
}

/**
 * Join (or start) the collaborative session of a document. `fileMarkdown` is the
 * document as currently saved. Returns null if collaboration isn't possible for it
 * (e.g. too large for a single cloud record); the caller then falls back to locks.
 */
export async function openCollabSession(
  adapter: CloudAdapterLike,
  docId: string,
  fileMarkdown: string,
  user: CollabUser
): Promise<CollabSession | null> {
  await adapter.ready();
  const fx = adapter.records();
  const fileHash = hashMarkdown(fileMarkdown);

  const [stateData, savedData, peers] = await Promise.all([
    fx.get(stateId(docId)),
    fx.get(savedId(docId)),
    fx.query('peerDoc', docId),
  ]);

  const now = Date.now();
  let othersActive = false;
  peers.forEach((d) => {
    const t = Number(d.data?.t);
    if (t > now - PEER_ACTIVE_WINDOW) othersActive = true;
    else if (!(t > now - PEER_GC_AGE)) fx.remove(d.id).catch(() => {});
  });

  let state: DocumentData | null = stateData;
  const saved: DocumentData | null = savedData;
  // The shared state is reused unless the file moved on without it (edited outside
  // a collaborative session). Someone still editing keeps it either way: their next
  // save brings the file up to date.
  const fileMovedOn = !saved || saved.epoch !== state?.epoch || saved.hash !== fileHash;
  if (!state || typeof state.seed !== 'string' || (fileMovedOn && !othersActive)) {
    const seed = seedFromMarkdown(fileMarkdown);
    if (seed.length > MAX_SEED_LENGTH) return null;
    const seenEpoch: string | null = state?.epoch ?? null;
    const next = { kind: STATE_KIND, docId, epoch: randomId(), seed, at: Date.now() };
    const res = await fx.transact({ id: stateId(docId), field: 'epoch', expect: seenEpoch }, [
      { op: 'set', id: stateId(docId), data: next },
      { op: 'set', id: savedId(docId), data: { kind: SAVED_KIND, docId, epoch: next.epoch, hash: fileHash, by: user.id, at: Date.now() } },
    ]);
    // Someone else (re)seeded it meanwhile: join theirs.
    state = res.ok ? next : res.current;
    if (!state || typeof state.seed !== 'string') return null;
    // Edits of the previous epoch are no longer reachable.
    if (seenEpoch) {
      const current = `${docId}:${state.epoch}`;
      fx.query('updDoc', docId)
        .then((items) => fx.removeMany(items.filter((d) => d.data?.stream !== current).map((d) => d.id)))
        .catch(() => {});
    }
  }

  const freshSaved = state.epoch === saved?.epoch ? String(saved?.hash ?? '') || null : fileHash;
  const session = new CollabSession(fx, docId, state, freshSaved, user);
  await session.start();
  return session;
}
