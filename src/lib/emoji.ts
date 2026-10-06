/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Names that start with an emoji ("🔧 Herramientas") use it as their icon: the
 * emoji replaces the default icon and is dropped from the name shown next to it.
 */

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[#*0-9]️?⃣)/u;

/** The leading emoji of `name` and the rest of the name, or no icon when it doesn't start with one. */
export function splitLeadingEmoji(name: string): { icon: string | null; label: string } {
  const trimmed = name.trimStart();
  const first = segmenter
    ? segmenter.segment(trimmed)[Symbol.iterator]().next().value?.segment
    : trimmed.match(/^\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic}️?)*/u)?.[0];
  if (!first || !EMOJI.test(first)) return { icon: null, label: name };
  const label = trimmed.slice(first.length).trim();
  // A name that is only an emoji keeps it as its name, with the default icon
  return label ? { icon: first, label } : { icon: null, label: name };
}
