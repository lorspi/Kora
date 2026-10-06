/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Who is editing which document right now, in cloud projects. Reads the presence
 * records that collaborative editing sessions keep (see lib/collab), without
 * loading the editing machinery itself.
 */
import { onSnapshot, query, where } from 'firebase/firestore';
import type { FirebaseAdapter } from './firebase';

/** `kind` of the presence record of one collaborative editing session. */
export const PEER_KIND = 'kora-collab-peer';
/**
 * A peer counts as present if it renewed within this window. Awareness renews
 * every 15 s, but background tabs only run timers about once a minute.
 */
export const PEER_ACTIVE_WINDOW = 90_000;

export interface DocEditor {
  userId: string;
  name: string;
  color: string;
}

/**
 * Follow which documents are open in a collaborative session right now, and by
 * whom. Liveness is judged on our own clock: a record is live while it keeps
 * changing, whatever the writer's clock says.
 */
export function subscribeDocEditors(
  adapter: FirebaseAdapter,
  onChange: (byDoc: Record<string, DocEditor[]>) => void
): () => void {
  const fx = adapter.collabAccess();
  const entries = new Map<string, DocEditor & { docId: string; seenAt: number }>();

  const emit = () => {
    const now = Date.now();
    const byDoc: Record<string, DocEditor[]> = {};
    entries.forEach((e) => {
      if (now - e.seenAt > PEER_ACTIVE_WINDOW) return;
      const list = (byDoc[e.docId] ||= []);
      if (!list.some((x) => x.userId === e.userId)) list.push({ userId: e.userId, name: e.name, color: e.color });
    });
    onChange(byDoc);
  };

  let unsub: () => void = () => {};
  let closed = false;
  adapter.ready().then(() => {
    if (closed) return;
    unsub = onSnapshot(query(fx.collection, where('kind', '==', PEER_KIND)), (snap) => {
      const now = Date.now();
      snap.docChanges().forEach((change) => {
        if (change.type === 'removed') {
          entries.delete(change.doc.id);
          return;
        }
        const d = change.doc.data();
        // A renewal we just watched happen is fresh; a record found already there
        // is as old as its own timestamp says (capped to the window).
        const age = change.type === 'added' ? Math.min(Math.max(now - Number(d.t || 0), 0), PEER_ACTIVE_WINDOW + 1) : 0;
        entries.set(change.doc.id, {
          docId: String(d.peerDoc),
          userId: String(d.userId),
          name: String(d.name || ''),
          color: String(d.color || '#64748b'),
          seenAt: now - age,
        });
      });
      emit();
    }, (err) => console.warn('Doc presence subscription error', err));
  }).catch(() => {});

  const timer = setInterval(emit, 15000);
  return () => {
    closed = true;
    unsub();
    clearInterval(timer);
  };
}
