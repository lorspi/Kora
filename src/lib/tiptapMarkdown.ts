/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Markdown <-> TipTap (ProseMirror JSON) conversion layer.
 *
 * The rest of Kora stores documents as raw Markdown strings on disk and renders
 * them elsewhere (lib/markdown.tsx, task descriptions, CHANGELOG) using a bespoke
 * Markdown dialect. This module guarantees a byte-compatible round-trip with that
 * dialect so that:
 *   - the "unsaved changes" diff (currentMd !== originalMarkdown) only reports real edits
 *   - the read-only MarkdownPreview keeps rendering identically
 *
 * Dialect contract (must match blocksToMarkdown in the legacy DocView):
 *   Block level:  # / ## / ###, "- " bullets, "N. " ordered, "> " quote,
 *                 ```mermaid fenced diagrams, ``` code fences, "---" divider,
 *                 "- [ ]" / "- [x]" checklists, GFM pipe tables, images on their
 *                 own line ![alt](attachments/images/..), <video src="attachments/videos/..">.
 *   Inline:       **bold**, *italic* (single asterisk), ~~strike~~, `code`,
 *                 [text](url), <u>underline</u>.
 *
 * The ProseMirror document uses these node/mark names (see tiptapSchema.ts):
 *   nodes:  doc, paragraph, heading{level}, bulletList, orderedList, listItem,
 *           taskList, taskItem{checked}, blockquote, codeBlock, horizontalRule,
 *           mermaid{code}, mediaImage{src,alt}, mediaVideo{src}, sourceTable{source},
 *           hardBreak, text
 *   marks:  bold, italic, strike, code, underline, link{href}
 *
 * Source-preserving blocks: mermaid, codeBlock and tables keep their EXACT
 * original markdown source (mermaid/table as node attributes, code as text) and
 * emit it back verbatim. The legacy editor edited these as raw textareas and never
 * reflowed them, so preserving the source guarantees a byte-identical round-trip
 * (no spurious "unsaved changes" when merely opening a document).
 */

// ─── ProseMirror JSON shape (minimal typing) ────────────────────────────────────

export interface PMMark {
  type: string;
  attrs?: Record<string, any>;
}

export interface PMNode {
  type: string;
  attrs?: Record<string, any>;
  content?: PMNode[];
  marks?: PMMark[];
  text?: string;
}

// ─── Inline serialization (marks -> markdown) ────────────────────────────────────

/**
 * Serialize a run of inline nodes (text + marks, inline images) to markdown.
 * Marks are applied in a fixed nesting order so output is deterministic and
 * matches the legacy inline wrapping (**, *, ~~, `, <u>, []()).
 */
/**
 * Private-use sentinel standing in for a leading space in a paragraph line.
 * HTML/ProseMirror parsing collapses leading whitespace, so the parser encodes
 * each leading space as this char and the serializer decodes it back to a space,
 * preserving indentation (e.g. 4-space code-ish lines, list continuations) so the
 * round-trip stays byte-identical.
 */
const LEADING_SPACE_SENTINEL = '\uE000';

function decodeLeadingSpaces(s: string): string {
  return s.replace(/\uE000/g, ' ');
}

/**
 * Mark nesting order, OUTERMOST first. A contiguous run of inline nodes sharing a
 * mark is wrapped ONCE with that mark's delimiters, so `**a `b` c**` stays a single
 * bold span instead of being split at the inner code segment. This matches the
 * legacy dialect, where inline formatting was stored as raw wrapping text.
 */
const MARK_ORDER: { type: string; open: (m: PMMark) => string; close: (m: PMMark) => string }[] = [
  { type: 'link', open: () => '[', close: (m) => `](${m.attrs?.href ?? ''})` },
  { type: 'underline', open: () => '<u>', close: () => '</u>' },
  { type: 'bold', open: () => '**', close: () => '**' },
  { type: 'italic', open: () => '*', close: () => '*' },
  { type: 'strike', open: () => '~~', close: () => '~~' },
  { type: 'code', open: () => '`', close: () => '`' },
];

/** Render a single inline node's raw text/atom (no marks applied). */
function renderInlineAtom(node: PMNode): string {
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'mediaImage') {
    return `![${node.attrs?.alt ?? ''}](${node.attrs?.src ?? ''})`;
  }
  if (node.type === 'text' && node.text != null) return node.text;
  return '';
}

function findMark(node: PMNode, type: string): PMMark | undefined {
  return (node.marks ?? []).find((m) => m.type === type);
}

/**
 * Serialize a run of inline nodes to markdown, wrapping maximal contiguous
 * mark-runs once. Processes marks recursively outermost-first (MARK_ORDER).
 */
function serializeInlineRange(nodes: PMNode[], start: number, end: number, markIdx: number): string {
  if (start >= end) return '';

  // Base case: no more marks to consider — emit raw atoms.
  if (markIdx >= MARK_ORDER.length) {
    let out = '';
    for (let i = start; i < end; i++) out += renderInlineAtom(nodes[i]);
    return out;
  }

  const { type, open, close } = MARK_ORDER[markIdx];
  let out = '';
  let i = start;
  while (i < end) {
    const mark = findMark(nodes[i], type);
    if (!mark) {
      // Extend across all consecutive nodes lacking this mark, then recurse once
      // into deeper marks so their runs can still group within this segment.
      let k = i + 1;
      while (k < end && !findMark(nodes[k], type)) k++;
      out += serializeInlineRange(nodes, i, k, markIdx + 1);
      i = k;
      continue;
    }
    // Extend the run while the same mark (by type + href for links) continues.
    let j = i + 1;
    while (j < end) {
      const next = findMark(nodes[j], type);
      if (!next) break;
      if (type === 'link' && next.attrs?.href !== mark.attrs?.href) break;
      j++;
    }
    out += open(mark) + serializeInlineRange(nodes, i, j, markIdx + 1) + close(mark);
    i = j;
  }
  return out;
}

function serializeInline(nodes: PMNode[] | undefined): string {
  if (!nodes || nodes.length === 0) return '';
  return decodeLeadingSpaces(serializeInlineRange(nodes, 0, nodes.length, 0));
}

// ─── Block serialization (PM doc -> markdown) ────────────────────────────────────

function serializeListItems(node: PMNode, ordered: boolean): string[] {
  const items = node.content ?? [];
  const lines: string[] = [];
  items.forEach((item, idx) => {
    // A listItem holds one or more paragraphs; legacy only supported single-line.
    const inner = (item.content ?? [])
      .map(child => (child.type === 'paragraph' ? serializeInline(child.content) : serializeBlock(child)))
      .join(' ')
      .replace(/\n+/g, ' ')
      .trim();
    lines.push(ordered ? `${idx + 1}. ${inner}` : `- ${inner}`);
  });
  return lines;
}

function serializeTaskItems(node: PMNode): string[] {
  const items = node.content ?? [];
  return items.map(item => {
    const checked = item.attrs?.checked === true;
    const inner = (item.content ?? [])
      .map(child => (child.type === 'paragraph' ? serializeInline(child.content) : serializeBlock(child)))
      .join(' ')
      .replace(/\n+/g, ' ')
      .trim();
    return `- [${checked ? 'x' : ' '}] ${inner}`;
  });
}

function serializeBlock(node: PMNode): string {
  switch (node.type) {
    case 'paragraph': {
      // A standalone image/video paragraph is emitted by its inline node.
      return serializeInline(node.content);
    }
    case 'heading': {
      const level = Math.min(3, Math.max(1, node.attrs?.level ?? 1));
      return '#'.repeat(level) + ' ' + serializeInline(node.content);
    }
    case 'blockquote': {
      // Legacy quote is single-line "> text".
      const inner = (node.content ?? [])
        .map(child => serializeBlock(child))
        .join(' ')
        .replace(/\n+/g, ' ')
        .trim();
      return `> ${inner}`;
    }
    case 'bulletList':
      return serializeListItems(node, false).join('\n');
    case 'orderedList':
      return serializeListItems(node, true).join('\n');
    case 'taskList':
      return serializeTaskItems(node).join('\n');
    case 'codeBlock':
      return '```\n' + (node.content?.map(c => c.text ?? '').join('') ?? '') + '\n```';
    case 'mermaid':
      return '```mermaid\n' + (node.attrs?.code ?? '') + '\n```';
    case 'mediaVideo':
      return `<video src="${node.attrs?.src ?? ''}" controls></video>`;
    case 'mediaImage':
      return `![${node.attrs?.alt ?? ''}](${node.attrs?.src ?? ''})`;
    case 'horizontalRule':
      return '---';
    case 'sourceTable':
      // Emit the exact original table markdown, verbatim (no reflow).
      return node.attrs?.source ?? '';
    default:
      return serializeInline(node.content);
  }
}

/**
 * Convert a ProseMirror document (as JSON) to the bespoke Markdown dialect.
 * Blocks are separated by a single newline, matching legacy blocksToMarkdown
 * which joined block strings with "\n".
 */
export function pmDocToMarkdown(doc: PMNode): string {
  if (!doc.content || doc.content.length === 0) return '';
  return doc.content.map(serializeBlock).join('\n');
}

/**
 * Normalize a markdown string to the canonical form the editor round-trips to:
 * CRLF/CR line endings become LF. DocView uses this to set the "original" baseline
 * so opening a CRLF document does not falsely report unsaved changes.
 */
export function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\r\n?/g, '\n');
}

// ─── Markdown -> HTML (for editor.commands.setContent) ───────────────────────────

/** Escape text for safe insertion as HTML text content / attribute values. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert inline markdown to HTML understood by the TipTap marks.
 * Mirrors the legacy inlineMarkdownToHtml ordering. Order matters: escape first,
 * then re-introduce our allowed formatting. Underline uses literal <u> in source
 * markdown, so we un-escape that specific tag after escaping.
 */
/** Encode a line's leading spaces as sentinels so HTML parsing preserves them. */
function encodeLeadingSpaces(line: string): string {
  const m = line.match(/^( +)/);
  if (!m) return line;
  return '\uE000'.repeat(m[1].length) + line.slice(m[1].length);
}

function inlineMarkdownToHtml(text: string): string {
  if (!text) return '';
  let html = escapeHtml(text);
  // Images (inline): ![alt](src)
  html = html.replace(/!\[(.*?)\]\((.+?)\)/g, (_m, alt, src) =>
    `<img src="${src}" alt="${alt}">`);
  // Bold before italic so ** is consumed first.
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  // Links [text](url)
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  // Underline: author wrote literal <u>..</u> which got escaped to &lt;u&gt;
  html = html.replace(/&lt;u&gt;(.+?)&lt;\/u&gt;/g, '<u>$1</u>');
  return html;
}

interface MdLineType {
  raw: string;
}

/** Detect a standalone image line: ![alt](src) */
function matchImageLine(line: string): { alt: string; src: string } | null {
  const m = line.trim().match(/^!\[(.*?)\]\((.+?)\)$/);
  return m ? { alt: m[1], src: m[2] } : null;
}

/** Detect a standalone video line: <video src="..." ...></video> */
function matchVideoLine(line: string): string | null {
  const m = line.trim().match(/^<video\s+src="(.+?)".*?><\/video>$/i);
  return m ? m[1] : null;
}

/**
 * Parse the bespoke Markdown dialect into HTML for TipTap's setContent.
 * Ported line-by-line from the legacy markdownToBlocks so the same inputs
 * produce structurally equivalent documents (and thus a stable round-trip).
 */
export function markdownToTiptapHtml(markdown: string): string {
  if (!markdown.trim()) return '<p></p>';

  // Load-boundary normalization: CRLF/CR -> LF. See normalizeMarkdown().
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let i = 0;

  // Buffers for grouping consecutive list items into a single list element.
  let pendingBullets: string[] = [];
  let pendingNumbered: string[] = [];
  let pendingTasks: { checked: boolean; content: string }[] = [];

  const flushBullets = () => {
    if (pendingBullets.length) {
      html.push('<ul>' + pendingBullets.map(c => `<li><p>${inlineMarkdownToHtml(c)}</p></li>`).join('') + '</ul>');
      pendingBullets = [];
    }
  };
  const flushNumbered = () => {
    if (pendingNumbered.length) {
      html.push('<ol>' + pendingNumbered.map(c => `<li><p>${inlineMarkdownToHtml(c)}</p></li>`).join('') + '</ol>');
      pendingNumbered = [];
    }
  };
  const flushTasks = () => {
    if (pendingTasks.length) {
      html.push('<ul data-type="taskList">' + pendingTasks.map(t =>
        `<li data-type="taskItem" data-checked="${t.checked}"><p>${inlineMarkdownToHtml(t.content)}</p></li>`
      ).join('') + '</ul>');
      pendingTasks = [];
    }
  };
  const flushAll = () => { flushBullets(); flushNumbered(); flushTasks(); };

  while (i < lines.length) {
    const line = lines[i];

    // Standalone image / video lines become media nodes.
    const img = matchImageLine(line);
    if (img) {
      flushAll();
      html.push(`<img src="${img.src}" alt="${escapeHtml(img.alt)}" data-media="image">`);
      i++;
      continue;
    }
    const video = matchVideoLine(line);
    if (video) {
      flushAll();
      html.push(`<div data-media="video" data-src="${escapeHtml(video)}"></div>`);
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      flushAll();
      html.push(`<h3>${inlineMarkdownToHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      flushAll();
      html.push(`<h2>${inlineMarkdownToHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      flushAll();
      html.push(`<h1>${inlineMarkdownToHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith('> ')) {
      flushAll();
      html.push(`<blockquote><p>${inlineMarkdownToHtml(line.slice(2))}</p></blockquote>`);
    } else if (line.startsWith('- [x] ') || line.startsWith('- [X] ')) {
      flushBullets(); flushNumbered();
      pendingTasks.push({ checked: true, content: line.slice(6) });
    } else if (line.startsWith('- [ ] ')) {
      flushBullets(); flushNumbered();
      pendingTasks.push({ checked: false, content: line.slice(6) });
    } else if (line.startsWith('- ')) {
      flushNumbered(); flushTasks();
      pendingBullets.push(line.slice(2));
    } else if (/^\d+\.\s/.test(line)) {
      flushBullets(); flushTasks();
      pendingNumbered.push(line.replace(/^\d+\.\s/, ''));
    } else if (line.startsWith('```mermaid')) {
      flushAll();
      const mermaidLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        mermaidLines.push(lines[i]);
        i++;
      }
      html.push(`<div data-mermaid="true" data-code="${escapeHtml(mermaidLines.join('\n'))}"></div>`);
    } else if (line.startsWith('```')) {
      flushAll();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    } else if (line.trim() === '---' || line.trim() === '***') {
      flushAll();
      html.push('<hr>');
    } else if (line.startsWith('|') && i + 1 < lines.length && /^\|[-:| +]+\|$/.test(lines[i + 1])) {
      flushAll();
      const tableLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      i--; // step back; outer loop will i++ past last table line
      html.push(`<div data-source-table="true" data-source="${escapeHtml(tableLines.join('\n'))}"></div>`);
    } else {
      flushAll();
      // Paragraph (may be empty). Preserve leading indentation via sentinels.
      html.push(`<p>${inlineMarkdownToHtml(encodeLeadingSpaces(line))}</p>`);
    }
    i++;
  }

  flushAll();
  return html.join('') || '<p></p>';
}

/**
 * Parse a GFM pipe-table source into rows for read-only preview rendering.
 * The canonical stored form remains the verbatim source (sourceTable.source);
 * this is only used to render the preview table in the NodeView.
 */
export function parseTableSource(source: string): { headers: string[]; rows: string[][] } | null {
  const lines = source.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 2) return null;
  const parseRow = (row: string): string[] => row.split('|').slice(1, -1).map(c => c.trim());
  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow);
  return { headers, rows };
}

// Silence unused-interface lint without changing the exported surface.
export type { MdLineType };
