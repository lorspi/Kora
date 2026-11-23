/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Highlights the fragments of a document that have comments (see DocView and the
 * comment threads in the store).
 *
 * Comments live apart from the Markdown, so each thread keeps an anchor: the
 * commented text plus a little context before and after. When the editor gets the
 * threads it finds each anchor in the document; from then on the highlighted
 * range follows the edits through the transaction mapping, and DocView writes the
 * anchors back when the text under them changes. Realtime collaboration applies
 * remote edits by replacing the whole document, which no mapping survives: then
 * each range is found again by the text it held just before (and threads not
 * found yet are retried). A thread whose text was deleted has no range: it is
 * shown as detached.
 *
 * The extension adds no schema, so it doesn't affect the Markdown round-trip.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { DocCommentAnchor } from '../../types';

export interface HighlightThread {
  id: string;
  anchor: DocCommentAnchor;
}

type Range = { from: number; to: number };

interface HighlightState {
  ranges: Map<string, Range>;
  /** Stored anchors of the threads, to retry the ones not found yet. */
  anchors: Map<string, DocCommentAnchor>;
  active: string | null;
  deco: DecorationSet;
}

type TextIndex = { text: string; pos: number[] };

type Meta =
  | { type: 'set'; threads: HighlightThread[] }
  | { type: 'active'; id: string | null }
  | { type: 'add'; id: string; from: number; to: number }
  | { type: 'remove'; id: string }
  | { type: 'rename'; from: string; to: string };

export const commentHighlightsKey = new PluginKey<HighlightState>('koraCommentHighlights');

/** Ranges whose id starts with this are local (the draft of a new comment). */
export const DRAFT_COMMENT_ID = '__draft__';

/** Characters of context kept before and after the commented text. */
const CONTEXT = 32;

/** The document's text with blocks separated by "\n", and each char's position. */
function textIndex(doc: PMNode): TextIndex {
  let text = '';
  const pos: number[] = [];
  doc.descendants((node, p) => {
    if (node.isText) {
      const t = node.text ?? '';
      for (let i = 0; i < t.length; i++) pos.push(p + i);
      text += t;
      return false;
    }
    if (node.isBlock && text.length && text[text.length - 1] !== '\n') {
      text += '\n';
      pos.push(-1);
    }
    return true;
  });
  return { text, pos };
}

/** Anchor of a selected range (null if it holds no text). */
export function anchorAt(doc: PMNode, from: number, to: number): DocCommentAnchor | null {
  return anchorIn(textIndex(doc), from, to);
}

function anchorIn({ text, pos }: TextIndex, from: number, to: number): DocCommentAnchor | null {
  let start = -1;
  let end = -1;
  for (let i = 0; i < pos.length; i++) {
    if (pos[i] < 0) continue;
    if (pos[i] >= from && pos[i] < to) {
      if (start < 0) start = i;
      end = i;
    }
  }
  if (start < 0) return null;
  const quote = text.slice(start, end + 1);
  if (!quote.trim()) return null;
  return { quote, prefix: text.slice(Math.max(0, start - CONTEXT), start), suffix: text.slice(end + 1, end + 1 + CONTEXT) };
}

function commonSuffixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** Find an anchor in a document: the occurrence of its text whose context fits best. */
export function findAnchor(doc: PMNode, anchor: DocCommentAnchor): Range | null {
  return findIn(textIndex(doc), anchor);
}

function findIn({ text, pos }: TextIndex, anchor: DocCommentAnchor): Range | null {
  if (!anchor.quote) return null;
  let best = -1;
  let bestScore = -1;
  for (let i = text.indexOf(anchor.quote); i >= 0; i = text.indexOf(anchor.quote, i + 1)) {
    const score =
      commonSuffixLength(text.slice(Math.max(0, i - CONTEXT), i), anchor.prefix) +
      commonPrefixLength(text.slice(i + anchor.quote.length, i + anchor.quote.length + CONTEXT), anchor.suffix);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  if (best < 0) return null;
  let a = best;
  let b = best + anchor.quote.length - 1;
  while (a <= b && pos[a] < 0) a++;
  while (b >= a && pos[b] < 0) b--;
  if (a > b) return null;
  return { from: pos[a], to: pos[b] + 1 };
}

function buildDecorations(doc: PMNode, ranges: Map<string, Range>, active: string | null): DecorationSet {
  const decos: Decoration[] = [];
  ranges.forEach((r, id) => {
    if (r.to <= r.from || r.to > doc.content.size) return;
    const draft = id.startsWith(DRAFT_COMMENT_ID);
    decos.push(
      Decoration.inline(r.from, r.to, {
        class: `kora-comment${id === active || draft ? ' kora-comment-active' : ''}`,
        ...(draft ? {} : { 'data-comment-id': id }),
      })
    );
  });
  return DecorationSet.create(doc, decos);
}

export const CommentHighlights = Extension.create<{ onClick?: (id: string) => void }>({
  name: 'koraCommentHighlights',

  addOptions() {
    return { onClick: undefined };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin<HighlightState>({
        key: commentHighlightsKey,
        state: {
          init: () => ({ ranges: new Map(), anchors: new Map(), active: null, deco: DecorationSet.empty }),
          apply(tr, prev, oldState, newState) {
            let ranges = prev.ranges;
            let anchors = prev.anchors;
            let active = prev.active;
            let changed = false;

            if (tr.docChanged) {
              const oldSize = oldState.doc.content.size;
              // A step that replaces (nearly) the whole document: realtime sync.
              const wholesale = tr.steps.some((st) => {
                const { from, to } = st as unknown as { from?: number; to?: number };
                return from === 0 && typeof to === 'number' && to >= oldSize;
              });
              const mapped = new Map<string, Range>();
              const lost: [string, DocCommentAnchor | null][] = [];
              let oldIndex: TextIndex | null = null;
              ranges.forEach((r, id) => {
                const from = tr.mapping.map(r.from, 1);
                const to = tr.mapping.map(r.to, -1);
                if (to > from && !wholesale) {
                  mapped.set(id, { from, to });
                } else {
                  // Find it again by the text it held just before this change.
                  oldIndex ??= textIndex(oldState.doc);
                  lost.push([id, anchorIn(oldIndex, r.from, r.to)]);
                }
              });
              if (lost.length || wholesale) {
                const newIndex = textIndex(newState.doc);
                for (const [id, before] of lost) {
                  // A deleted fragment stays deleted; only a re-rendered one is found again.
                  const found = before && wholesale ? findIn(newIndex, before) : null;
                  if (found) mapped.set(id, found);
                }
                if (wholesale) {
                  // Threads that weren't found before (e.g. the content arrived after them).
                  anchors.forEach((anchor, id) => {
                    if (mapped.has(id)) return;
                    const found = findIn(newIndex, anchor);
                    if (found) mapped.set(id, found);
                  });
                }
              }
              ranges = mapped;
              changed = true;
            }

            const meta = tr.getMeta(commentHighlightsKey) as Meta | undefined;
            if (meta) {
              changed = true;
              if (meta.type === 'set') {
                const next = new Map<string, Range>();
                ranges.forEach((r, id) => {
                  if (id.startsWith(DRAFT_COMMENT_ID)) next.set(id, r);
                });
                let index: TextIndex | null = null;
                for (const t of meta.threads) {
                  const known = ranges.get(t.id);
                  if (known) {
                    next.set(t.id, known);
                    continue;
                  }
                  index ??= textIndex(newState.doc);
                  const found = findIn(index, t.anchor);
                  if (found) next.set(t.id, found);
                }
                ranges = next;
                anchors = new Map(meta.threads.map((t) => [t.id, t.anchor]));
              } else if (meta.type === 'active') {
                active = meta.id;
              } else if (meta.type === 'add') {
                ranges = new Map(ranges).set(meta.id, { from: meta.from, to: meta.to });
              } else if (meta.type === 'remove') {
                ranges = new Map(ranges);
                ranges.delete(meta.id);
              } else if (meta.type === 'rename') {
                const r = ranges.get(meta.from);
                ranges = new Map(ranges);
                ranges.delete(meta.from);
                if (r) ranges.set(meta.to, r);
              }
            }

            if (!changed) return prev;
            return { ranges, anchors, active, deco: buildDecorations(newState.doc, ranges, active) };
          },
        },
        props: {
          decorations(state) {
            return commentHighlightsKey.getState(state)?.deco ?? DecorationSet.empty;
          },
          handleClick(_view, _pos, event) {
            const el = (event.target as HTMLElement | null)?.closest?.('[data-comment-id]');
            const id = el?.getAttribute('data-comment-id');
            if (id) options.onClick?.(id);
            return false;
          },
        },
      }),
    ];
  },
});

/** Current ranges of the highlighted threads. */
export function commentRanges(state: Parameters<typeof commentHighlightsKey.getState>[0]): Map<string, Range> {
  return commentHighlightsKey.getState(state)?.ranges ?? new Map();
}
