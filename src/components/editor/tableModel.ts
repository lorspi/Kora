/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Editable model of a GFM (Markdown) table, for the table editor of the document
 * editor (customNodes SourceTable). Tables stay stored as their Markdown source;
 * the editor parses it into this model, edits cells, rows and columns, and writes
 * it back with serializeTable.
 */

export type ColumnAlign = 'left' | 'center' | 'right' | null;

export interface TableModel {
  headers: string[];
  aligns: ColumnAlign[];
  rows: string[][];
}

/** Split one table line into cells, honoring escaped pipes (\|). */
function splitRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === '|') {
      cur += '\\|';
      i++;
    } else if (ch === '|') {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function parseAlign(cell: string): ColumnAlign {
  const c = cell.trim();
  const left = c.startsWith(':');
  const right = c.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

const SEPARATOR_RE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** Parse a GFM table. Null if the source isn't a table (no header + separator). */
export function parseTable(source: string): TableModel | null {
  const lines = source.split('\n').filter((l) => l.trim());
  if (lines.length < 2 || !SEPARATOR_RE.test(lines[1])) return null;
  const headers = splitRow(lines[0]);
  const width = headers.length;
  const aligns = splitRow(lines[1]).map(parseAlign);
  const fit = <T,>(cells: T[], empty: T): T[] => {
    const out = cells.slice(0, width);
    while (out.length < width) out.push(empty);
    return out;
  };
  return {
    headers,
    aligns: fit<ColumnAlign>(aligns, null),
    rows: lines.slice(2).map((l) => fit(splitRow(l), '')),
  };
}

/** Escape what would break a cell: pipes and line breaks. */
export function sanitizeCell(text: string): string {
  return cellForEditing(text).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

/** A cell as the person edits it: escaped pipes shown as plain pipes. */
export function cellForEditing(text: string): string {
  return text.replace(/\\\|/g, '|');
}

function separatorCell(align: ColumnAlign, width: number): string {
  const dashes = '-'.repeat(Math.max(3, width - (align === 'center' ? 2 : align ? 1 : 0)));
  if (align === 'center') return `:${dashes}:`;
  if (align === 'left') return `:${dashes}`;
  if (align === 'right') return `${dashes}:`;
  return dashes;
}

/** Write a table as aligned (padded) GFM source. */
export function serializeTable(model: TableModel): string {
  const cols = model.headers.length;
  const widths = Array.from({ length: cols }, (_, c) =>
    Math.max(3, [model.headers[c], ...model.rows.map((r) => r[c] ?? '')].reduce((m, t) => Math.max(m, [...(t ?? '')].length), 0))
  );
  const pad = (text: string, c: number) => {
    const t = text ?? '';
    const gap = widths[c] - [...t].length;
    if (gap <= 0) return t;
    if (model.aligns[c] === 'right') return ' '.repeat(gap) + t;
    if (model.aligns[c] === 'center') return ' '.repeat(Math.floor(gap / 2)) + t + ' '.repeat(Math.ceil(gap / 2));
    return t + ' '.repeat(gap);
  };
  const line = (cells: string[]) => `| ${cells.map((t, c) => pad(t, c)).join(' | ')} |`;
  return [
    line(model.headers),
    `| ${model.aligns.map((a, c) => separatorCell(a, widths[c])).join(' | ')} |`,
    ...model.rows.map(line),
  ].join('\n');
}

// ─── Edits (each returns a new model) ─────────────────────────────────────────────

/** Row index -1 is the header row. */
export function setCell(m: TableModel, row: number, col: number, text: string): TableModel {
  const value = sanitizeCell(text);
  if (row < 0) return { ...m, headers: m.headers.map((h, c) => (c === col ? value : h)) };
  return { ...m, rows: m.rows.map((r, ri) => (ri === row ? r.map((t, c) => (c === col ? value : t)) : r)) };
}

export function insertRow(m: TableModel, at: number): TableModel {
  const rows = [...m.rows];
  rows.splice(Math.max(0, Math.min(at, rows.length)), 0, m.headers.map(() => ''));
  return { ...m, rows };
}

export function deleteRow(m: TableModel, row: number): TableModel {
  if (row < 0) return m;
  return { ...m, rows: m.rows.filter((_, i) => i !== row) };
}

export function insertColumn(m: TableModel, at: number): TableModel {
  const i = Math.max(0, Math.min(at, m.headers.length));
  const ins = <T,>(arr: T[], v: T) => [...arr.slice(0, i), v, ...arr.slice(i)];
  return {
    headers: ins(m.headers, `Columna ${m.headers.length + 1}`),
    aligns: ins(m.aligns, null as ColumnAlign),
    rows: m.rows.map((r) => ins(r, '')),
  };
}

export function deleteColumn(m: TableModel, col: number): TableModel {
  if (m.headers.length <= 1) return m;
  const del = <T,>(arr: T[]) => arr.filter((_, c) => c !== col);
  return { headers: del(m.headers), aligns: del(m.aligns), rows: m.rows.map(del) };
}

export function setAlign(m: TableModel, col: number, align: ColumnAlign): TableModel {
  return { ...m, aligns: m.aligns.map((a, c) => (c === col ? align : a)) };
}

export function moveRow(m: TableModel, row: number, delta: number): TableModel {
  const to = row + delta;
  if (row < 0 || to < 0 || to >= m.rows.length) return m;
  const rows = [...m.rows];
  [rows[row], rows[to]] = [rows[to], rows[row]];
  return { ...m, rows };
}

export function moveColumn(m: TableModel, col: number, delta: number): TableModel {
  const to = col + delta;
  if (to < 0 || to >= m.headers.length) return m;
  const swap = <T,>(arr: T[]) => {
    const a = [...arr];
    [a[col], a[to]] = [a[to], a[col]];
    return a;
  };
  return { headers: swap(m.headers), aligns: swap(m.aligns), rows: m.rows.map(swap) };
}

// ─── Display ──────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Inline Markdown of a cell (bold, italic, strike, code, links) as safe HTML. */
export function cellToHtml(text: string): string {
  const codes: string[] = [];
  let html = escapeHtml(text.replace(/\\\|/g, '|')).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  html = html
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      const safe = /^(https?:|mailto:|#)/i.test(href) ? href : `https://${href}`;
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer" class="text-bento-blue underline">${label}</a>`;
    });
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code class="bg-secondary text-bento-orange font-mono px-1 rounded text-[0.9em]">${codes[Number(i)]}</code>`);
}
