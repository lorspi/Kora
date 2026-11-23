/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Small realtime record store used by collaborative editing (lib/collab) and doc
 * presence (lib/docPresence). Cloud adapters implement it on top of their backend:
 * Firestore documents (lib/firebase) or the records of the Cloudflare backend
 * (lib/cloudflare). Records are plain JSON objects keyed by id and live apart from
 * the project files, so file listings never see them.
 */

export interface RecordChange {
  type: 'added' | 'modified' | 'removed';
  id: string;
  data: any;
}

export interface RecordWrite {
  op: 'set' | 'update';
  id: string;
  data: Record<string, unknown>;
}

export interface RecordStore {
  get(id: string): Promise<any | null>;
  set(id: string, data: Record<string, unknown>): Promise<void>;
  remove(id: string): Promise<void>;
  removeMany(ids: string[]): Promise<void>;
  /** Records whose `field` equals `value`. */
  query(field: string, value: string | number | boolean): Promise<{ id: string; data: any }[]>;
  /** Follow one record (null while it doesn't exist). Returns an unsubscribe function. */
  watch(id: string, onData: (data: any | null) => void, onError?: (err: unknown) => void): () => void;
  /**
   * Follow the records whose `field` equals `value`. The first call lists the
   * current ones as 'added' (possibly none); later calls carry only what changed.
   */
  watchQuery(
    field: string,
    value: string | number | boolean,
    onChanges: (changes: RecordChange[]) => void,
    onError?: (err: unknown) => void
  ): () => void;
  /**
   * Atomically apply `writes` only if `check.field` of record `check.id` equals
   * `check.expect` (null: the record or the field doesn't exist). Returns whether
   * they were applied and the check record as it was.
   */
  transact(
    check: { id: string; field: string; expect: string | null },
    writes: RecordWrite[]
  ): Promise<{ ok: boolean; current: any | null }>;
}

/** A storage adapter of a cloud project: realtime, collaborative documents. */
export interface CloudAdapterLike {
  ready(): Promise<void>;
  records(): RecordStore;
}

export function isCloudAdapter(adapter: unknown): adapter is CloudAdapterLike {
  return !!adapter && typeof (adapter as any).records === 'function';
}
