/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The single source of truth for the document editor's TipTap schema.
 * Used by both the live editor (TipTapDocEditor) and the round-trip verification
 * harness so the schema they exercise is identical.
 */
import StarterKit from '@tiptap/starter-kit';
import { Code } from '@tiptap/extension-code';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { MermaidNode, SourceTable, MediaVideo, MediaImage } from './customNodes';

/**
 * By default ProseMirror's `code` mark excludes all other marks, so bold/italic
 * are stripped inside inline code. The legacy Kora dialect stored formatting as
 * raw wrapping text, allowing e.g. **texto `code` texto** with bold spanning the
 * code. Overriding `excludes: ''` lets code coexist with other marks, preserving
 * a byte-identical round-trip for those spans.
 */
const CoexistingCode = Code.extend({ excludes: '' });

export function buildExtensions(options?: { placeholder?: string }) {
  return [
    StarterKit.configure({
      // We supply our own link handling, code mark and source-preserving blocks.
      link: false,
      code: false,
      // StarterKit's codeBlock stays (plain ``` fences). Its horizontalRule,
      // headings, lists, blockquote, bold/italic/strike/underline are used.
    }),
    CoexistingCode,
    Link.configure({
      openOnClick: false,
      autolink: false,
      HTMLAttributes: { class: 'text-bento-blue underline', rel: 'noopener noreferrer', target: '_blank' },
    }),
    TaskList,
    TaskItem.configure({ nested: false }),
    Placeholder.configure({
      // Show the hint ONLY on the block that currently holds the cursor, so the
      // hint follows focus instead of persisting on every empty line.
      // (includeChildren must stay false: with it true, TipTap decorates every
      // empty descendant regardless of the selection anchor.)
      showOnlyCurrent: true,
      includeChildren: false,
      emptyNodeClass: 'is-empty',
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') return 'Encabezado';
        return options?.placeholder ?? "Escribe '/' para insertar un bloque o comienza a escribir";
      },
    }),
    MermaidNode,
    SourceTable,
    MediaVideo,
    MediaImage,
  ];
}
