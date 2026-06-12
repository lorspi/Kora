/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export function markdownToHtml(
  content: string,
  resolvedUrls: Record<string, string> = {}
): string {
  if (!content.trim()) return '';

  let html = content;

  html = html.replace(/!\[(.*?)\]\((attachments\/images\/.*?)\)/g, (match, alt, filePath) => {
    const resolved = resolvedUrls[filePath];
    if (!resolved) return match;
    return `<div class="my-4"><img src="${resolved}" alt="${alt}" class="rounded-xl max-h-96 mx-auto border border-border shadow-card" referrerPolicy="no-referrer" /><span class="block text-center text-[10px] text-muted-foreground mt-1 font-mono">${alt}</span></div>`;
  });

  html = html.replace(/<video src="(attachments\/videos\/.*?)"(.*?)><\/video>/g, (match, filePath, attrs) => {
    const resolved = resolvedUrls[filePath];
    if (!resolved) return match;
    return `<video src="${resolved}" class="max-w-full rounded-xl border border-border shadow-card mx-auto my-4" controls ${attrs}></video>`;
  });

  html = html.replace(/^# (.*?)$/gm, '<h1 class="text-2xl font-black text-foreground border-b border-border mt-6 mb-3 pb-2">$1</h1>');
  html = html.replace(/^## (.*?)$/gm, '<h2 class="text-lg font-bold text-foreground mt-5 mb-2">$1</h2>');
  html = html.replace(/^### (.*?)$/gm, '<h3 class="text-sm font-bold text-foreground mt-4 mb-2">$1</h3>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.*?)`/g, '<code class="bg-secondary text-bento-orange font-mono px-1.5 py-0.5 rounded text-[11px]">$1</code>');
  html = html.replace(/^> (.*?)$/gm, '<blockquote class="border-l-4 border-bento-blue bg-bento-blue-light pl-4 py-2 text-foreground rounded-r-lg my-3 font-medium">$1</blockquote>');
  html = html.replace(/^- (.*?)$/gm, '<li class="list-disc ml-5 text-muted-foreground py-0.5">$1</li>');

  const lines = html.split('\n');
  return lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '<div class="h-3"></div>';
    if (trimmed.startsWith('<h') || trimmed.startsWith('<div') || trimmed.startsWith('<li') || trimmed.startsWith('<blockquote') || trimmed.startsWith('<video')) return line;
    return `<p class="py-1 text-muted-foreground leading-relaxed text-xs">${line}</p>`;
  }).join('\n');
}

interface MarkdownPreviewProps {
  content: string;
  resolvedUrls?: Record<string, string>;
  className?: string;
  emptyMessage?: string;
}

export function MarkdownPreview({ content, resolvedUrls, className = '', emptyMessage }: MarkdownPreviewProps) {
  if (!content.trim()) {
    return <span className="text-muted-foreground italic text-xs">{emptyMessage ?? 'Sin contenido.'}</span>;
  }

  return (
    <div
      className={`prose max-w-full font-body select-text ${className}`}
      dangerouslySetInnerHTML={{ __html: markdownToHtml(content, resolvedUrls) }}
    />
  );
}
