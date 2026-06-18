/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import mermaid from 'mermaid';
import { useUI } from '../lib/ui';
import { useProjectStore } from '../store';
import { 
  Save, 
  Trash2, 
  Bold, 
  Italic, 
  Underline,
  Strikethrough,
  Heading1, 
  Heading2, 
  Heading3,
  List, 
  ListOrdered,
  Quote,
  Code,
  Minus,
  CheckSquare,
  Type,
  Plus,
  GripVertical,
  Paperclip,
  ChevronDown,
  ChevronRight,
  ImageIcon,
  Film,
  FolderOpen,
  Check,
  Copy,
  Link,
  MoreVertical,
  FileCode,
  ShieldAlert,
  GitBranch,
  Table
} from 'lucide-react';

// ─── Block Types ────────────────────────────────────────────────────────────────

interface Block {
  id: string;
  type: 'paragraph' | 'h1' | 'h2' | 'h3' | 'bullet' | 'numbered' | 'quote' | 'code' | 'divider' | 'checklist' | 'mermaid' | 'table';
  content: string;
  checked?: boolean;
}

const SLASH_COMMANDS = [
  { type: 'paragraph', label: 'Texto', icon: Type, shortcut: '', description: 'Texto normal' },
  { type: 'h1', label: 'Encabezado 1', icon: Heading1, shortcut: '#', description: 'Título grande' },
  { type: 'h2', label: 'Encabezado 2', icon: Heading2, shortcut: '##', description: 'Título mediano' },
  { type: 'h3', label: 'Encabezado 3', icon: Heading3, shortcut: '###', description: 'Título pequeño' },
  { type: 'bullet', label: 'Lista con viñetas', icon: List, shortcut: '-', description: 'Lista no ordenada' },
  { type: 'numbered', label: 'Lista numerada', icon: ListOrdered, shortcut: '1.', description: 'Lista ordenada' },
  { type: 'checklist', label: 'Lista de tareas', icon: CheckSquare, shortcut: '- [ ]', description: 'Casillas de verificación' },
  { type: 'quote', label: 'Cita', icon: Quote, shortcut: '>', description: 'Bloque de cita' },
  { type: 'code', label: 'Código', icon: Code, shortcut: '```', description: 'Bloque de código' },
  { type: 'divider', label: 'Divisor', icon: Minus, shortcut: '---', description: 'Línea horizontal' },
  { type: 'mermaid', label: 'Diagrama Mermaid', icon: GitBranch, shortcut: '```mermaid', description: 'Diagrama de flujo, secuencia, Gantt...' },
  { type: 'table', label: 'Tabla', icon: Table, shortcut: '|', description: 'Tabla de columnas y filas' },
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// Returns the display number for a numbered block based on consecutive numbered blocks
function getNumberedDisplayIndex(blocks: Block[], idx: number): number {
  let count = 1;
  for (let i = idx - 1; i >= 0; i--) {
    if (blocks[i].type === 'numbered') {
      count++;
    } else {
      break;
    }
  }
  return count;
}

function markdownToBlocks(markdown: string): Block[] {
  if (!markdown.trim()) return [{ id: generateId(), type: 'paragraph', content: '' }];
  
  const lines = markdown.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    
    if (line.startsWith('### ')) {
      blocks.push({ id: generateId(), type: 'h3', content: line.slice(4) });
    } else if (line.startsWith('## ')) {
      blocks.push({ id: generateId(), type: 'h2', content: line.slice(3) });
    } else if (line.startsWith('# ')) {
      blocks.push({ id: generateId(), type: 'h1', content: line.slice(2) });
    } else if (line.startsWith('> ')) {
      blocks.push({ id: generateId(), type: 'quote', content: line.slice(2) });
    } else if (line.startsWith('- [x] ') || line.startsWith('- [X] ')) {
      blocks.push({ id: generateId(), type: 'checklist', content: line.slice(6), checked: true });
    } else if (line.startsWith('- [ ] ')) {
      blocks.push({ id: generateId(), type: 'checklist', content: line.slice(6), checked: false });
    } else if (line.startsWith('- ')) {
      blocks.push({ id: generateId(), type: 'bullet', content: line.slice(2) });
    } else if (/^\d+\.\s/.test(line)) {
      blocks.push({ id: generateId(), type: 'numbered', content: line.replace(/^\d+\.\s/, '') });
    } else if (line.startsWith('```mermaid')) {
      // Collect mermaid diagram lines
      const mermaidLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        mermaidLines.push(lines[i]);
        i++;
      }
      blocks.push({ id: generateId(), type: 'mermaid', content: mermaidLines.join('\n') });
    } else if (line.startsWith('```')) {
      // Collect code block lines
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ id: generateId(), type: 'code', content: codeLines.join('\n') });
    } else if (line.trim() === '---' || line.trim() === '***') {
      blocks.push({ id: generateId(), type: 'divider', content: '' });
    } else if (line.startsWith('|') && i + 1 < lines.length && /^\|[-:| +]+\|$/.test(lines[i + 1])) {
      // Table block: collect consecutive | lines
      const tableLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push({ id: generateId(), type: 'table', content: tableLines.join('\n') });
    } else {
      blocks.push({ id: generateId(), type: 'paragraph', content: line });
    }
    i++;
  }

  return blocks.length > 0 ? blocks : [{ id: generateId(), type: 'paragraph', content: '' }];
}

function blocksToMarkdown(blocks: Block[]): string {
  return blocks.map((block, idx) => {
    switch (block.type) {
      case 'h1': return `# ${block.content}`;
      case 'h2': return `## ${block.content}`;
      case 'h3': return `### ${block.content}`;
      case 'bullet': return `- ${block.content}`;
      case 'numbered': return `${getNumberedDisplayIndex(blocks, idx)}. ${block.content}`;
      case 'quote': return `> ${block.content}`;
      case 'table': return block.content;
      case 'mermaid': return `\`\`\`mermaid\n${block.content}\n\`\`\``;
      case 'code': return `\`\`\`\n${block.content}\n\`\`\``;
      case 'divider': return '---';
      case 'checklist': return `- [${block.checked ? 'x' : ' '}] ${block.content}`;
      default: return block.content;
    }
  }).join('\n');
}

// Render inline markdown (bold, italic, code, links, images) as HTML string
function inlineMarkdownToHtml(text: string): string {
  if (!text) return '';
  let html = text;
  // Escape HTML entities first to prevent XSS, then selectively allow our formatting
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic (single asterisk, but not inside bold)
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');
  // Inline code
  html = html.replace(/`(.+?)`/g, '<code class="bg-secondary text-bento-orange font-mono px-1 py-0.5 rounded text-[0.85em]">$1</code>');
  // Links [text](url)
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-bento-blue underline" target="_blank" rel="noopener noreferrer">$1</a>');
  // Underline <u>text</u> (escaped version)
  html = html.replace(/&lt;u&gt;(.+?)&lt;\/u&gt;/g, '<u>$1</u>');
  return html;
}

// Check if content has inline formatting
function hasInlineFormatting(text: string): boolean {
  return /\*\*.+?\*\*|\*.+?\*|~~.+?~~|`.+?`|\[.+?\]\(.+?\)|<u>.+?<\/u>/.test(text);
}

// Render inline markdown (bold, italic, code, links, images)
function renderInlineMarkdown(text: string, resolvedUrls: Record<string, string> = {}): React.ReactNode[] {
  if (!text) return [];
  
  const parts: React.ReactNode[] = [];
  // Match inline patterns
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))|(!\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Push text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Bold
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3]) {
      // Italic
      parts.push(<em key={match.index}>{match[4]}</em>);
    } else if (match[5]) {
      // Inline code
      parts.push(<code key={match.index} className="bg-secondary text-bento-orange font-mono px-1.5 py-0.5 rounded text-[0.85em]">{match[6]}</code>);
    } else if (match[10]) {
      // Image
      const alt = match[11];
      const src = match[12];
      const resolvedSrc = resolvedUrls[src] || src;
      parts.push(<img key={match.index} src={resolvedSrc} alt={alt} className="inline-block max-h-64 rounded-lg border border-border my-1" />);
    } else if (match[7]) {
      // Link
      parts.push(<a key={match.index} href={match[9]} className="text-bento-blue hover:underline" target="_blank" rel="noopener noreferrer">{match[8]}</a>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

// ─── Viewport Boundary Helper ───────────────────────────────────────────────────

function useViewportBoundary(menuRef: React.RefObject<HTMLDivElement | null>, position: { top: number; left: number }) {
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let adjustedLeft = position.left;
    let adjustedTop = position.top;

    // Right edge overflow
    if (rect.right > vw - 8) {
      adjustedLeft = vw - rect.width - 8;
    }
    // Left edge overflow
    if (adjustedLeft < 8) {
      adjustedLeft = 8;
    }
    // Bottom edge overflow
    if (rect.bottom > vh - 8) {
      adjustedTop = position.top - rect.height - 8;
    }
    // Top edge overflow
    if (adjustedTop < 8) {
      adjustedTop = 8;
    }

    if (adjustedLeft !== position.left || adjustedTop !== position.top) {
      el.style.left = `${adjustedLeft}px`;
      el.style.top = `${adjustedTop}px`;
    }
  });
}

// ─── Slash Command Menu ─────────────────────────────────────────────────────────

function SlashMenu({ position, filter, onSelect, onClose }: {
  position: { top: number; left: number };
  filter: string;
  onSelect: (type: string) => void;
  onClose: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useViewportBoundary(menuRef, position);

  const filtered = useMemo(() => {
    if (!filter) return SLASH_COMMANDS;
    const lower = filter.toLowerCase();
    return SLASH_COMMANDS.filter(cmd => 
      cmd.label.toLowerCase().includes(lower) || 
      cmd.description.toLowerCase().includes(lower) ||
      cmd.shortcut.includes(lower)
    );
  }, [filter]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex].type);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex, onSelect, onClose]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-card border border-border rounded-xl shadow-card-hover py-1.5 min-w-[220px] max-h-[300px] overflow-y-auto animate-fade-in"
      style={{ top: position.top, left: position.left }}
    >
      <div className="px-3 py-1.5">
        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Bloques básicos</span>
      </div>
      {filtered.map((cmd, idx) => {
        const Icon = cmd.icon;
        return (
          <button
            key={cmd.type}
            onClick={() => onSelect(cmd.type)}
            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer ${
              idx === selectedIndex ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium block">{cmd.label}</span>
            </div>
            {cmd.shortcut && (
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">{cmd.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Floating Format Toolbar ────────────────────────────────────────────────────

function FloatingToolbar({ position, onFormat, onClose, onLinkModeChange }: {
  position: { top: number; left: number };
  onFormat: (type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'link', url?: string) => void;
  onClose: () => void;
  onLinkModeChange: (active: boolean, selectionData?: { blockId: string; startIdx: number; endIdx: number; text: string }) => void;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);
  const savedSelectionRef = useRef<{ blockId: string; startIdx: number; endIdx: number; text: string } | null>(null);

  useViewportBoundary(toolbarRef, position);

  useEffect(() => {
    if (showLinkInput && linkInputRef.current) {
      linkInputRef.current.focus();
    }
    onLinkModeChange(showLinkInput, savedSelectionRef.current || undefined);
  }, [showLinkInput, onLinkModeChange]);

  const saveCurrentSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const selectedText = range.toString();
    if (!selectedText) return;

    const editableEl = (range.commonAncestorContainer.nodeType === 3
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer as HTMLElement)?.closest('[contenteditable]') as HTMLElement | null;
    if (!editableEl) return;

    const blockEl = editableEl.closest('[data-block-id]');
    if (!blockEl) return;
    const blockId = blockEl.getAttribute('data-block-id');
    if (!blockId) return;

    const beforeRange = document.createRange();
    beforeRange.setStart(editableEl, 0);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const startIdx = beforeRange.toString().length;
    const endIdx = startIdx + selectedText.length;

    savedSelectionRef.current = { blockId, startIdx, endIdx, text: selectedText };
  };

  const buttons: { type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'link'; icon: React.ElementType; label: string }[] = [
    { type: 'bold', icon: Bold, label: 'Negrita' },
    { type: 'italic', icon: Italic, label: 'Cursiva' },
    { type: 'underline', icon: Underline, label: 'Subrayado' },
    { type: 'strikethrough', icon: Strikethrough, label: 'Tachado' },
    { type: 'code', icon: Code, label: 'Código' },
    { type: 'link', icon: Link, label: 'Enlace' },
  ];

  const handleLinkSubmit = () => {
    if (linkUrl.trim() && savedSelectionRef.current) {
      onFormat('link', linkUrl.trim());
      setShowLinkInput(false);
      setLinkUrl('');
      savedSelectionRef.current = null;
    }
  };

  const handleLinkCancel = () => {
    setShowLinkInput(false);
    setLinkUrl('');
    savedSelectionRef.current = null;
  };

  return (
    <div
      ref={toolbarRef}
      className="fixed z-[9999] bg-card border border-border rounded-xl shadow-card-hover px-1 py-1 flex items-center gap-0.5 animate-fade-in"
      style={{ top: position.top, left: position.left, transform: 'translateX(-50%)' }}
    >
      {!showLinkInput ? (
        <>
          {buttons.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent losing selection
                if (type === 'link') {
                  saveCurrentSelection();
                  setShowLinkInput(true);
                } else {
                  onFormat(type);
                }
              }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              title={label}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </>
      ) : (
        <div className="flex items-center gap-1 px-1">
          <input
            ref={linkInputRef}
            type="text"
            className="bg-secondary border border-input rounded-lg px-2 py-1 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-48"
            placeholder="https://..."
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleLinkSubmit(); }
              if (e.key === 'Escape') { handleLinkCancel(); }
            }}
          />
          <button
            onMouseDown={(e) => { e.preventDefault(); handleLinkSubmit(); }}
            className="p-1.5 rounded-lg text-bento-green hover:bg-accent transition-colors cursor-pointer"
            title="Aplicar enlace"
          >
            <Check className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Block Context Menu ─────────────────────────────────────────────────────────

function BlockContextMenu({ position, onDelete, onDuplicate, onConvert, onClose }: {
  position: { top: number; left: number };
  onDelete: () => void;
  onDuplicate: () => void;
  onConvert?: (type: string) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showConvertSub, setShowConvertSub] = useState(false);

  useViewportBoundary(menuRef, position);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-card border border-border rounded-xl shadow-card-hover py-1 min-w-[180px] animate-fade-in"
      style={{ top: position.top, left: position.left }}
    >
      <button
        onClick={() => { onDelete(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Borrar
      </button>
      <button
        onClick={() => { onDuplicate(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
      >
        <Copy className="w-3.5 h-3.5" />
        Duplicar
      </button>
      {onConvert && (
      <div className="relative">
        <button
          onClick={() => setShowConvertSub(!showConvertSub)}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
        >
          <ListOrdered className="w-3.5 h-3.5" />
          <span className="flex-1">Convertir en</span>
          <ChevronRight className="w-3 h-3" />
        </button>
        {showConvertSub && (
          <div className="absolute left-full top-0 ml-1 bg-card border border-border rounded-xl shadow-card-hover py-1 min-w-[180px] max-h-[260px] overflow-y-auto">
            {SLASH_COMMANDS.map(cmd => {
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.type}
                  onClick={() => { onConvert(cmd.type); onClose(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1">{cmd.label}</span>
                  {cmd.shortcut && <span className="text-[9px] font-mono text-muted-foreground/60">{cmd.shortcut}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

// ─── Mermaid Diagram Renderer ────────────────────────────────────────────────────

/** Return sober/subdued theme variables for Mermaid based on dark/light mode */
function getMermaidThemeConfig(isDark: boolean) {
  if (isDark) {
    return {
      startOnLoad: false,
      theme: 'base' as const,
      themeVariables: {
        background: 'transparent',
        primaryColor: '#334155',
        primaryTextColor: '#e2e8f0',
        primaryBorderColor: '#475569',
        secondaryColor: '#1e293b',
        secondaryTextColor: '#cbd5e1',
        secondaryBorderColor: '#334155',
        tertiaryColor: '#0f172a',
        lineColor: '#475569',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '12px',
        edgeLabelBackground: '#1e293b',
        nodeBorder: '#334155',
      }
    };
  }
  return {
    startOnLoad: false,
    theme: 'base' as const,
    themeVariables: {
      background: 'transparent',
      primaryColor: '#64748b',
      primaryTextColor: '#1e293b',
      primaryBorderColor: '#94a3b8',
      secondaryColor: '#f1f5f9',
      secondaryTextColor: '#334155',
      secondaryBorderColor: '#cbd5e1',
      tertiaryColor: '#f8fafc',
      lineColor: '#94a3b8',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '12px',
      edgeLabelBackground: '#ffffff',
      nodeBorder: '#cbd5e1',
    }
  };
}

function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  // Listen for theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const renderDiagram = async () => {
      const el = containerRef.current;
      if (!el || !chart.trim()) return;
      
      setRenderError(null);
      el.innerHTML = '';
      
      try {
        // Re-initialize mermaid with current theme before each render
        mermaid.initialize(getMermaidThemeConfig(isDark));
        // Use a unique ID for mermaid to render into
        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        el.innerHTML = svg;
      } catch (err: any) {
        console.warn('Mermaid render error:', err);
        setRenderError(err?.message || 'Error al renderizar diagrama');
      }
    };

    renderDiagram();
  }, [chart, isDark]);

  if (!chart.trim()) {
    return <div className="py-4 text-center text-[10px] text-muted-foreground italic">Escribe código Mermaid para generar el diagrama</div>;
  }

  return (
    <div className="relative">
      <div 
        ref={containerRef}
        className="flex justify-center py-4 overflow-x-auto mermaid"
      />
      {renderError && (
        <div className="text-[10px] text-destructive text-center pb-2 font-mono">
          ⚠️ {renderError}
        </div>
      )}
    </div>
  );
}

// ─── Block Editor Component ─────────────────────────────────────────────────────

// Check if content is an image markdown syntax
function isImageBlock(content: string): boolean {
  return /^!\[.*?\]\(.+?\)$/.test(content.trim());
}

// Check if content is a video tag
function isVideoBlock(content: string): boolean {
  return /^<video\s+src=".+?".*?>.*?<\/video>$/i.test(content.trim());
}

// Parse image markdown to get alt and src
function parseImage(content: string): { alt: string; src: string } | null {
  const match = content.trim().match(/^!\[(.*?)\]\((.+?)\)$/);
  if (!match) return null;
  return { alt: match[1], src: match[2] };
}

// Parse video tag to get src
function parseVideo(content: string): string | null {
  const match = content.trim().match(/^<video\s+src="(.+?)".*?>.*?<\/video>$/i);
  if (!match) return null;
  return match[1];
}

function BlockEditor({ block, index, numberedIndex, focused, totalBlocks, onUpdate, onFocus, onKeyDown, onAddBelow, onDelete, onDuplicate, onConvertType, onMoveBlock, resolvedUrls, readOnly }: {
  block: Block;
  index: number;
  numberedIndex: number;
  focused: boolean;
  totalBlocks: number;
  onUpdate: (id: string, updates: Partial<Block>) => void;
  onFocus: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent, blockId: string) => void;
  onAddBelow: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onConvertType: (id: string, type: string) => void;
  onMoveBlock: (id: string, direction: 'up' | 'down') => void;
  resolvedUrls: Record<string, string>;
  readOnly?: boolean;
}) {
  const inputRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef(block.content);
  const [contextMenu, setContextMenu] = useState<{ top: number; left: number } | null>(null);
  const [mermaidCodeExpanded, setMermaidCodeExpanded] = useState(false);
  const [tableCodeExpanded, setTableCodeExpanded] = useState(false);

  // Auto-focus mermaid/table textarea when expanded
  useEffect(() => {
    if (block.type === 'mermaid' && mermaidCodeExpanded && codeRef.current) {
      codeRef.current.focus();
    }
  }, [mermaidCodeExpanded, block.type]);

  useEffect(() => {
    if (block.type === 'table' && tableCodeExpanded && codeRef.current) {
      codeRef.current.focus();
    }
  }, [tableCodeExpanded, block.type]);

  // Drag state
  const dragRef = useRef<{ isDragging: boolean; startY: number; blockId: string } | null>(null);

  // Handle grip mousedown for drag
  const handleGripMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    let moved = false;

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = Math.abs(ev.clientY - startY);
      if (delta > 8) {
        moved = true;
        // Move block up or down based on drag direction
        if (ev.clientY < startY - 30) {
          onMoveBlock(block.id, 'up');
          // Reset start position
          cleanup();
        } else if (ev.clientY > startY + 30) {
          onMoveBlock(block.id, 'down');
          cleanup();
        }
      }
    };

    const handleMouseUp = (ev: MouseEvent) => {
      cleanup();
      if (!moved) {
        // Single click — show context menu
        setContextMenu({ top: ev.clientY, left: ev.clientX });
      }
    };

    const cleanup = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const renderGripHandle = () => (
    <button
      onMouseDown={handleGripMouseDown}
      className="p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-grab active:cursor-grabbing transition-colors"
      title="Arrastrar para mover · Clic para opciones"
    >
      <GripVertical className="w-3.5 h-3.5" />
    </button>
  );

  // Keep content ref in sync
  contentRef.current = block.content;

  // Only sync DOM when content changes externally (not from user typing)
  const lastSetContent = useRef(block.content);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // Only update DOM if the content changed from outside (not from user input)
    if (block.content !== lastSetContent.current) {
      // Don't update if element is focused (user is typing)
      if (document.activeElement !== el) {
        el.innerHTML = hasInlineFormatting(block.content) ? inlineMarkdownToHtml(block.content) : (block.content || '');
      }
      lastSetContent.current = block.content;
    }
  }, [block.content]);

  // Set initial content on mount (rendered)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.innerHTML = hasInlineFormatting(block.content) ? inlineMarkdownToHtml(block.content) : (block.content || '');
    lastSetContent.current = block.content;
  }, [block.id]);

  useEffect(() => {
    if (focused) {
      if (block.type === 'code') {
        codeRef.current?.focus();
      } else if (block.type !== 'divider' && block.type !== 'table' && !isImageBlock(block.content) && !isVideoBlock(block.content)) {
        const el = inputRef.current;
        if (el && document.activeElement !== el) {
          // Switch to raw text mode for editing
          el.textContent = block.content;
          isFocusedRef.current = true;
          el.focus();
          // Place cursor at end
          const range = document.createRange();
          const sel = window.getSelection();
          if (el.childNodes.length > 0) {
            range.selectNodeContents(el);
            range.collapse(false);
          } else {
            range.setStart(el, 0);
            range.collapse(true);
          }
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }
    }
  }, [focused, block.id]);

  const handleInput = () => {
    if (inputRef.current) {
      const text = inputRef.current.textContent || '';
      lastSetContent.current = text;
      onUpdate(block.id, { content: text });
    }
  };

  const handleFocus = () => {
    isFocusedRef.current = true;
    const el = inputRef.current;
    if (el) {
      // Switch to raw markdown for editing
      el.textContent = block.content;
      // Place cursor at end
      const range = document.createRange();
      const sel = window.getSelection();
      if (el.childNodes.length > 0) {
        range.selectNodeContents(el);
        range.collapse(false);
      } else {
        range.setStart(el, 0);
        range.collapse(true);
      }
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    onFocus(block.id);
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    const el = inputRef.current;
    if (el) {
      // Switch back to rendered HTML
      const content = el.textContent || '';
      lastSetContent.current = content;
      el.innerHTML = hasInlineFormatting(content) ? inlineMarkdownToHtml(content) : (content || '');
    }
  };

  const handleKeyDownInner = (e: React.KeyboardEvent) => {
    onKeyDown(e, block.id);
  };

  const placeholderText = "Escribe '/' para insertar un bloque o comienza a escribir";

  if (block.type === 'divider') {
    return (
      <div className="group flex items-center gap-2 py-2" onClick={() => onFocus(block.id)}>
        {!readOnly && (
        <div className="hidden sm:flex opacity-0 group-hover:opacity-100 items-center gap-0.5 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onAddBelow(block.id); }}
            className="p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {renderGripHandle()}
        </div>
        )}
        <hr className="flex-1 border-border" />
        {contextMenu && (
          <BlockContextMenu
            position={contextMenu}
            onDelete={() => onDelete(block.id)}
            onDuplicate={() => onDuplicate(block.id)}
            onConvert={(type) => onConvertType(block.id, type)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  }

  // Render image blocks
  if (isImageBlock(block.content)) {
    const img = parseImage(block.content);
    if (img) {
      const resolvedSrc = resolvedUrls[img.src] || img.src;
      return (
        <div className="group flex items-start gap-2 py-1">
          {!readOnly && (
          <div className="hidden sm:flex opacity-0 group-hover:opacity-100 items-center gap-0.5 transition-opacity pt-2 shrink-0">
            <button
              onClick={() => onAddBelow(block.id)}
              className="p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {renderGripHandle()}
          </div>
          )}
          <div className="flex-1 min-w-0 my-2">
            <img 
              src={resolvedSrc} 
              alt={img.alt} 
              className="rounded-xl max-h-96 max-w-full border border-border shadow-card" 
              referrerPolicy="no-referrer"
            />
            {img.alt && <span className="block text-[10px] text-muted-foreground mt-1 font-mono">{img.alt}</span>}
          </div>
          {contextMenu && (
            <BlockContextMenu
              position={contextMenu}
              onDelete={() => onDelete(block.id)}
              onDuplicate={() => onDuplicate(block.id)}
              onClose={() => setContextMenu(null)}
            />
          )}
        </div>
      );
    }
  }

  // Render video blocks
  if (isVideoBlock(block.content)) {
    const videoSrc = parseVideo(block.content);
    if (videoSrc) {
      const resolvedSrc = resolvedUrls[videoSrc] || videoSrc;
      return (
        <div className="group flex items-start gap-2 py-1">
          {!readOnly && (
          <div className="hidden sm:flex opacity-0 group-hover:opacity-100 items-center gap-0.5 transition-opacity pt-2 shrink-0">
            <button
              onClick={() => onAddBelow(block.id)}
              className="p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {renderGripHandle()}
          </div>
          )}
          <div className="flex-1 min-w-0 my-2">
            <video 
              src={resolvedSrc} 
              controls 
              className="max-w-full rounded-xl border border-border shadow-card"
            />
          </div>
          {contextMenu && (
            <BlockContextMenu
              position={contextMenu}
              onDelete={() => onDelete(block.id)}
              onDuplicate={() => onDuplicate(block.id)}
              onClose={() => setContextMenu(null)}
            />
          )}
        </div>
      );
    }
  }

  if (block.type === 'mermaid') {
    const isExpanded = block.content.trim() ? mermaidCodeExpanded : true;
    const lineCount = block.content.split('\n').length;
    
    return (
      <div className="group flex flex-col gap-2 py-2">
        <div className="flex items-start gap-2">
          {!readOnly && (
          <div className="hidden sm:flex opacity-0 group-hover:opacity-100 items-center gap-0.5 transition-opacity pt-2 shrink-0">
            <button
              onClick={() => onAddBelow(block.id)}
              className="p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {renderGripHandle()}
          </div>
          )}
          {/* Diagram preview */}
          <div className="flex-1 min-w-0">
            <div className="bg-card border border-border rounded-lg p-3">
              <div className="flex items-center justify-end mb-2">
                {!readOnly && (
                  <button
                    onClick={() => setMermaidCodeExpanded(!mermaidCodeExpanded)}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title={isExpanded ? 'Colapsar código' : 'Editar código'}
                  >
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              <MermaidDiagram chart={block.content} />
            </div>
            {/* Collapsible code editor */}
            {!readOnly && (
              <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                <div className="bg-secondary border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-accent border-b border-border">
                    <span className="text-[10px] font-mono font-bold text-muted-foreground">Código fuente</span>
                    <span className="text-[9px] font-mono text-muted-foreground">{lineCount} línea{lineCount !== 1 ? 's' : ''}</span>
                  </div>
                  <textarea
                    ref={codeRef}
                    className="w-full bg-transparent p-3 text-xs font-mono text-foreground focus:outline-none resize-none"
                    value={block.content}
                    onChange={(e) => onUpdate(block.id, { content: e.target.value })}
                    onFocus={() => onFocus(block.id)}
                    onKeyDown={handleKeyDownInner}
                    placeholder="graph TD\n  A[Inicio] --> B[Fin]"
                    rows={Math.max(3, Math.min(10, lineCount))}
                    style={{ fontFamily: 'JetBrains Mono, Fira Code, monospace' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        {contextMenu && (
          <BlockContextMenu
            position={contextMenu}
            onDelete={() => onDelete(block.id)}
            onDuplicate={() => onDuplicate(block.id)}
            onConvert={(type) => onConvertType(block.id, type)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  }

  // Render table blocks with collapsible code editor (like mermaid)
  if (block.type === 'table') {
    const lines = block.content.split('\n');
    const isExpanded = block.content.trim() ? tableCodeExpanded : true;
    const lineCount = lines.length;

    return (
      <div className="group flex flex-col gap-2 py-2">
        <div className="flex items-start gap-2">
          {!readOnly && (
          <div className="hidden sm:flex opacity-0 group-hover:opacity-100 items-center gap-0.5 transition-opacity pt-2 shrink-0">
            <button
              onClick={() => onAddBelow(block.id)}
              className="p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {renderGripHandle()}
          </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="bg-card border border-border rounded-lg p-3">
              <div className="flex items-center justify-end mb-2">
                {!readOnly && (
                  <button
                    onClick={() => setTableCodeExpanded(!tableCodeExpanded)}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title={isExpanded ? 'Colapsar código' : 'Editar código'}
                  >
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              {/* Rendered table */}
              {lines.length >= 2 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse bg-card text-xs">
                    <thead>
                      <tr>
                        {lines[0].split('|').slice(1, -1).map((h, i) => (
                          <th key={i} className="border-b border-border bg-secondary px-3 py-2 font-bold uppercase tracking-wider text-foreground text-left whitespace-nowrap">{h.trim()}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.slice(2).map((row, ri) => (
                        <tr key={ri} className={ri % 2 === 0 ? 'bg-card' : 'bg-secondary/30'}>
                          {row.split('|').slice(1, -1).map((cell, ci) => (
                            <td key={ci} className="px-3 py-2 text-muted-foreground border-b border-border whitespace-nowrap">{cell.trim()}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-6 text-[10px] text-muted-foreground italic">
                  Escribe código de tabla Markdown para visualizarla
                </div>
              )}
            </div>
            {/* Collapsible code editor */}
            {!readOnly && (
              <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                <div className="bg-secondary border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-accent border-b border-border">
                    <span className="text-[10px] font-mono font-bold text-muted-foreground">Código fuente</span>
                    <span className="text-[9px] font-mono text-muted-foreground">{lineCount} línea{lineCount !== 1 ? 's' : ''}</span>
                  </div>
                  <textarea
                    ref={codeRef}
                    className="w-full bg-transparent p-3 text-xs font-mono text-foreground focus:outline-none resize-none"
                    value={block.content}
                    onChange={(e) => onUpdate(block.id, { content: e.target.value })}
                    onFocus={() => onFocus(block.id)}
                    onKeyDown={handleKeyDownInner}
                    placeholder={`| Col 1 | Col 2 | Col 3 |\n|---|---|---|\n| A | B | C |`}
                    rows={Math.max(3, Math.min(10, lineCount))}
                    style={{ fontFamily: 'JetBrains Mono, Fira Code, monospace' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        {contextMenu && (
          <BlockContextMenu
            position={contextMenu}
            onDelete={() => onDelete(block.id)}
            onDuplicate={() => onDuplicate(block.id)}
            onConvert={(type) => onConvertType(block.id, type)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  }

  if (block.type === 'code') {
    return (
      <div className="group flex items-start gap-2 py-1">
        {!readOnly && (
        <div className="hidden sm:flex opacity-0 group-hover:opacity-100 items-center gap-0.5 transition-opacity pt-2 shrink-0">
          <button
            onClick={() => onAddBelow(block.id)}
            className="p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {renderGripHandle()}
        </div>
        )}
        <div className="flex-1 min-w-0">
          <textarea
            ref={codeRef}
            className="w-full bg-secondary border border-border rounded-lg p-3 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none min-h-[60px]"
            value={block.content}
            onChange={(e) => onUpdate(block.id, { content: e.target.value })}
            onFocus={() => onFocus(block.id)}
            onKeyDown={handleKeyDownInner}
            placeholder="// Escribe código aquí..."
            rows={Math.max(3, block.content.split('\n').length)}
          />
        </div>
        {contextMenu && (
          <BlockContextMenu
            position={contextMenu}
            onDelete={() => onDelete(block.id)}
            onDuplicate={() => onDuplicate(block.id)}
            onConvert={(type) => onConvertType(block.id, type)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  }

  // Determine element styling
  let elClassName = 'text-xs text-foreground leading-relaxed';
  
  switch (block.type) {
    case 'h1':
      elClassName = 'text-2xl font-black text-foreground leading-tight';
      break;
    case 'h2':
      elClassName = 'text-lg font-bold text-foreground leading-tight';
      break;
    case 'h3':
      elClassName = 'text-sm font-bold text-foreground leading-snug';
      break;
    case 'bullet':
    case 'numbered':
    case 'checklist':
      elClassName = 'text-xs text-foreground leading-relaxed';
      break;
    case 'quote':
      elClassName = 'text-xs text-foreground leading-relaxed italic';
      break;
  }

  const wrapperClasses: Record<string, string> = {
    bullet: 'pl-2',
    numbered: 'pl-2',
    quote: 'pl-4 border-l-4 border-bento-blue bg-bento-blue/5 rounded-r-lg py-1',
    checklist: 'pl-1',
  };

  return (
    <div className="group flex items-start gap-2 py-0.5">
      {!readOnly && (
      <div className="hidden sm:flex opacity-0 group-hover:opacity-100 items-center gap-0.5 transition-opacity pt-0.5 shrink-0">
        <button
          onClick={() => onAddBelow(block.id)}
          className="p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer"
          title="Añadir bloque debajo"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        {renderGripHandle()}
      </div>
      )}
      <div className={`flex-1 min-w-0 ${wrapperClasses[block.type] || ''}`}>
        <div className="flex items-start gap-2">
          {block.type === 'checklist' && (
            <button
              onClick={() => onUpdate(block.id, { checked: !block.checked })}
              className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center cursor-pointer transition-colors ${
                block.checked 
                  ? 'bg-bento-green border-bento-green text-white' 
                  : 'border-border hover:border-bento-green/50'
              }`}
            >
              {block.checked && <Check className="w-3 h-3" />}
            </button>
          )}
          {block.type === 'bullet' && (
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-muted-foreground shrink-0" />
          )}
          {block.type === 'numbered' && (
            <span className="text-[10px] font-mono text-muted-foreground mt-0.5 shrink-0 w-4 text-right">{numberedIndex}.</span>
          )}
          <div
            ref={inputRef}
            contentEditable={!readOnly}
            suppressContentEditableWarning
            className={`flex-1 min-w-0 outline-none ${elClassName} ${block.checked ? 'line-through text-muted-foreground' : ''}`}
            onInput={handleInput}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDownInner}
            data-placeholder={placeholderText}
          />
        </div>
      </div>
      {contextMenu && (
        <BlockContextMenu
          position={contextMenu}
          onDelete={() => onDelete(block.id)}
          onDuplicate={() => onDuplicate(block.id)}
          onConvert={(type) => onConvertType(block.id, type)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// ─── Main DocView Component ─────────────────────────────────────────────────────

export default function DocView() {
  const { 
    docs, 
    selectedDocId, 
    getDocContent, 
    saveDocContent, 
    deleteDoc, 
    uploadAttachment, 
    resolveAttachmentUrl,
    adapter,
    activeUser,
    locks,
    lockDoc,
    unlockDoc,
    setDocHasUnsavedChanges,
    pendingNavigationAction,
    confirmPendingNavigation,
    cancelPendingNavigation
  } = useProjectStore();
  const { toast, confirm } = useUI();

  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [lockingUser, setLockingUser] = useState<string | null>(null);
  const heartbeatTimer = useRef<any>(null);
  const locksRef = useRef(locks);
  locksRef.current = locks;

  const docMeta = docs.find(d => d.id === selectedDocId);
  
  const [title, setTitle] = useState('');
  const [blocks, setBlocksRaw] = useState<Block[]>([{ id: generateId(), type: 'paragraph', content: '' }]);
  const [originalMarkdown, setOriginalMarkdown] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});

  // Undo/Redo history
  const historyRef = useRef<{ past: Block[][]; future: Block[][] }>({ past: [], future: [] });
  const skipHistoryRef = useRef(false);

  const setBlocks = useCallback((updater: Block[] | ((prev: Block[]) => Block[])) => {
    setBlocksRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return prev;
      if (!skipHistoryRef.current) {
        historyRef.current.past.push(prev);
        // Limit history to 50 entries
        if (historyRef.current.past.length > 50) historyRef.current.past.shift();
        historyRef.current.future = [];
      }
      skipHistoryRef.current = false;
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setBlocksRaw(prev => {
      const { past, future } = historyRef.current;
      if (past.length === 0) return prev;
      const previous = past.pop()!;
      future.push(prev);
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    setBlocksRaw(prev => {
      const { past, future } = historyRef.current;
      if (future.length === 0) return prev;
      const next = future.pop()!;
      past.push(prev);
      return next;
    });
  }, []);
  // Slash command menu state
  const [slashMenu, setSlashMenu] = useState<{ blockId: string; position: { top: number; left: number }; filter: string } | null>(null);

  // Floating format toolbar state
  const [formatToolbar, setFormatToolbar] = useState<{ top: number; left: number } | null>(null);
  const formatToolbarLockRef = useRef(false);
  const savedSelectionForLinkRef = useRef<{ blockId: string; startIdx: number; endIdx: number; text: string } | null>(null);

  // Attachment menu
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<{ name: string; path: string; type: 'image' | 'video' }[]>([]);

  // Doc menu and code mode
  const [showDocMenu, setShowDocMenu] = useState(false);
  const [codeMode, setCodeMode] = useState(false);
  const docMenuRef = useRef<HTMLDivElement>(null);
  const codeTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [mediaThumbs, setMediaThumbs] = useState<Record<string, string>>({});
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load document
  useEffect(() => {
    if (!selectedDocId) return;
    setLoading(true);
    getDocContent(selectedDocId).then(text => {
      const parsedBlocks = markdownToBlocks(text);
      skipHistoryRef.current = true;
      historyRef.current = { past: [], future: [] };
      setBlocks(parsedBlocks);
      setOriginalMarkdown(text);
      setTitle(docMeta?.title || 'Sin Título');
      setHasChanges(false);
      setLoading(false);
    });
  }, [selectedDocId, docMeta?.id]);

  // Update locked-by-other status reactively when locks change
  useEffect(() => {
    if (!selectedDocId || !activeUser) return;
    const activeLock = locks[selectedDocId];
    const now = Date.now();
    if (activeLock && activeLock.userId !== activeUser.id && activeLock.expiresAt > now) {
      setIsLockedByOther(true);
      setLockingUser(activeLock.username);
    } else {
      setIsLockedByOther(false);
      setLockingUser(null);
    }
  }, [selectedDocId, activeUser?.id, locks]);

  // Acquire lock and set up heartbeat interval
  useEffect(() => {
    if (!selectedDocId || !activeUser) return;
    const acquireLock = async () => {
      const activeLock = locksRef.current[selectedDocId];
      const now = Date.now();
      if (!activeLock || activeLock.userId === activeUser.id || activeLock.expiresAt <= now) {
        await lockDoc(selectedDocId);
      }
    };
    acquireLock();
    heartbeatTimer.current = setInterval(acquireLock, 14000);
    return () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      unlockDoc(selectedDocId);
    };
  }, [selectedDocId, activeUser?.id]);

  // Track changes and sync to store for navigation interception
  useEffect(() => {
    const currentMd = blocksToMarkdown(blocks);
    const changed = currentMd !== originalMarkdown || title !== (docMeta?.title || '');
    setHasChanges(changed);
    setDocHasUnsavedChanges(changed);
  }, [blocks, title, originalMarkdown, docMeta?.title, setDocHasUnsavedChanges]);

  // Watch for pending navigation (user tried to leave while having unsaved changes)
  const isHandlingRef = useRef(false);

  useEffect(() => {
    if (!pendingNavigationAction || isHandlingRef.current) return;
    isHandlingRef.current = true;

    const handlePendingNavigation = async () => {
      const shouldSave = await confirm({
        title: 'Cambios sin guardar',
        message: 'Tienes cambios sin guardar en este documento. ¿Quieres guardarlos antes de salir?',
        confirmLabel: 'Guardar',
        cancelLabel: 'Cancelar',
      });

      if (shouldSave) {
        const saved = await handleSave();
        if (saved) {
          confirmPendingNavigation();
        } else {
          cancelPendingNavigation();
        }
      } else {
        cancelPendingNavigation();
      }
      isHandlingRef.current = false;
    };

    handlePendingNavigation();
  }, [pendingNavigationAction]);

  // Resolve attachment URLs
  useEffect(() => {
    const allContent = blocks.map(b => b.content).join('\n');
    if (!allContent) return;
    const regex = /(?:attachments\/images\/[a-zA-Z0-9_\-\.]+|attachments\/videos\/[a-zA-Z0-9_\-\.]+)/g;
    const matches = allContent.match(regex) || [];
    const uniqueMatches = Array.from(new Set(matches));
    uniqueMatches.forEach(async (filePath: string) => {
      if (resolvedUrls[filePath]) return;
      const resolved = await resolveAttachmentUrl('/' + filePath);
      if (resolved) setResolvedUrls(prev => ({ ...prev, [filePath]: resolved }));
    });
  }, [blocks]);

  if (!docMeta) return null;

  const handleSave = async (): Promise<boolean> => {
    if (!selectedDocId) return false;
    setLoading(true);
    try {
      const markdown = blocksToMarkdown(blocks);
      await saveDocContent(selectedDocId, title, markdown);
      setOriginalMarkdown(markdown);
      setHasChanges(false);
      return true;
    } catch (e) {
      toast('Error al guardar documento', 'error');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const updateBlock = useCallback((id: string, updates: Partial<Block>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  const addBlockBelow = useCallback((afterId: string, type: Block['type'] = 'paragraph', content: string = '') => {
    const newBlock: Block = { id: generateId(), type, content, checked: type === 'checklist' ? false : undefined };
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === afterId);
      const newBlocks = [...prev];
      newBlocks.splice(idx + 1, 0, newBlock);
      return newBlocks;
    });
    setTimeout(() => setFocusedBlockId(newBlock.id), 10);
    return newBlock.id;
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setBlocks(prev => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex(b => b.id === id);
      const newBlocks = prev.filter(b => b.id !== id);
      // Focus previous block
      const focusIdx = Math.max(0, idx - 1);
      setTimeout(() => setFocusedBlockId(newBlocks[focusIdx]?.id || null), 10);
      return newBlocks;
    });
  }, []);

  const duplicateBlock = useCallback((id: string) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx === -1) return prev;
      const original = prev[idx];
      const duplicate: Block = { ...original, id: generateId() };
      const newBlocks = [...prev];
      newBlocks.splice(idx + 1, 0, duplicate);
      setTimeout(() => setFocusedBlockId(duplicate.id), 10);
      return newBlocks;
    });
  }, []);

  const moveBlock = useCallback((id: string, direction: 'up' | 'down') => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx === -1) return prev;
      if (direction === 'up' && idx === 0) return prev;
      if (direction === 'down' && idx === prev.length - 1) return prev;
      const newBlocks = [...prev];
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      [newBlocks[idx], newBlocks[targetIdx]] = [newBlocks[targetIdx], newBlocks[idx]];
      return newBlocks;
    });
  }, []);

  const convertBlockType = useCallback((id: string, newType: string) => {
    setBlocks(prev => prev.map(b => {
      if (b.id !== id) return b;
      return { ...b, type: newType as Block['type'], checked: newType === 'checklist' ? false : undefined };
    }));
    setTimeout(() => setFocusedBlockId(id), 10);
  }, []);

  const handleBlockKeyDown = useCallback((e: React.KeyboardEvent, blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      if (block.type === 'code' || block.type === 'mermaid' || block.type === 'table') return; // Allow newlines in code/mermaid/table blocks
      e.preventDefault();
      // If slash menu is open, let it handle Enter
      if (slashMenu) return;
      addBlockBelow(blockId, block.type === 'bullet' || block.type === 'numbered' || block.type === 'checklist' ? block.type : 'paragraph');
    } else if (e.key === 'Backspace' && !block.content && block.type === 'paragraph') {
      e.preventDefault();
      deleteBlock(blockId);
    } else if (e.key === 'Backspace' && !block.content && block.type !== 'paragraph') {
      e.preventDefault();
      updateBlock(blockId, { type: 'paragraph' });
    } else if (e.key === 'ArrowUp' && e.metaKey) {
      e.preventDefault();
      const idx = blocks.findIndex(b => b.id === blockId);
      if (idx > 0) setFocusedBlockId(blocks[idx - 1].id);
    } else if (e.key === 'ArrowDown' && e.metaKey) {
      e.preventDefault();
      const idx = blocks.findIndex(b => b.id === blockId);
      if (idx < blocks.length - 1) setFocusedBlockId(blocks[idx + 1].id);
    }
  }, [blocks, slashMenu, addBlockBelow, deleteBlock, updateBlock]);

  // Handle slash command detection
  const handleBlockUpdate = useCallback((id: string, updates: Partial<Block>) => {
    if (updates.content !== undefined) {
      const content = updates.content;
      
      // Check if user typed "/" at the start
      if (content === '/') {
        // Show slash menu
        const blockEl = document.querySelector(`[data-block-id="${id}"]`);
        if (blockEl) {
          const rect = blockEl.getBoundingClientRect();
          setSlashMenu({ blockId: id, position: { top: rect.bottom + 4, left: rect.left }, filter: '' });
        }
        updateBlock(id, updates);
        return;
      }
      
      // If slash menu is open and content starts with /
      if (slashMenu && slashMenu.blockId === id && content.startsWith('/')) {
        setSlashMenu(prev => prev ? { ...prev, filter: content.slice(1) } : null);
        updateBlock(id, updates);
        return;
      }

      // If content no longer starts with /, close the menu
      if (slashMenu && slashMenu.blockId === id && !content.startsWith('/')) {
        setSlashMenu(null);
      }

      // Auto-detect markdown syntax shortcuts
      const block = blocks.find(b => b.id === id);
      if (block && block.type === 'paragraph') {
        if (content.startsWith('# ')) {
          updateBlock(id, { type: 'h1', content: content.slice(2) });
          return;
        } else if (content.startsWith('## ')) {
          updateBlock(id, { type: 'h2', content: content.slice(3) });
          return;
        } else if (content.startsWith('### ')) {
          updateBlock(id, { type: 'h3', content: content.slice(4) });
          return;
        } else if (content.startsWith('- ')) {
          updateBlock(id, { type: 'bullet', content: content.slice(2) });
          return;
        } else if (/^\d+\.\s/.test(content)) {
          updateBlock(id, { type: 'numbered', content: content.replace(/^\d+\.\s/, '') });
          return;
        } else if (content.startsWith('> ')) {
          updateBlock(id, { type: 'quote', content: content.slice(2) });
          return;
        } else if (content === '---') {
          updateBlock(id, { type: 'divider', content: '' });
          addBlockBelow(id);
          return;
        } else if (content.startsWith('- [ ] ') || content.startsWith('- [x] ')) {
          updateBlock(id, { type: 'checklist', content: content.slice(6), checked: content.startsWith('- [x]') });
          return;
        }
      }
    }
    
    updateBlock(id, updates);
  }, [blocks, slashMenu, updateBlock, addBlockBelow]);

  const handleSlashSelect = useCallback((type: string) => {
    if (!slashMenu) return;
    const { blockId } = slashMenu;
    const defaultContent = type === 'table'
      ? '| Columna 1 | Columna 2 | Columna 3 |\n|----------|----------|----------|\n| Celda 1   | Celda 2   | Celda 3   |\n| Celda 4   | Celda 5   | Celda 6   |'
      : '';
    updateBlock(blockId, { type: type as Block['type'], content: defaultContent });
    setSlashMenu(null);
    if (type === 'divider') {
      addBlockBelow(blockId);
    } else {
      // Force re-focus even if same block: clear then set
      setFocusedBlockId(null);
      setTimeout(() => setFocusedBlockId(blockId), 20);
    }
  }, [slashMenu, updateBlock, addBlockBelow]);

  const handleSlashClose = useCallback(() => {
    setSlashMenu(null);
  }, []);

  // Attachment handling
  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { path } = await uploadAttachment(file);
      const relativePath = path.startsWith('/') ? path.substring(1) : path;
      const isVideo = file.type.startsWith('video/');
      const focusBlock = blocks.find(b => b.id === focusedBlockId);
      const insertAfterId = focusedBlockId || blocks[blocks.length - 1].id;
      
      if (isVideo) {
        addBlockBelow(insertAfterId, 'paragraph', `<video src="${relativePath}" controls></video>`);
      } else {
        addBlockBelow(insertAfterId, 'paragraph', `![${file.name}](${relativePath})`);
      }
    } catch (err: any) {
      toast('No se pudo adjuntar el archivo: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleOpenMediaPicker = async () => {
    setShowAttachMenu(false);
    if (!adapter) return;
    try {
      const images = await adapter.listFiles('/attachments/images');
      const videos = await adapter.listFiles('/attachments/videos');
      const files = [
        ...images.map(name => ({ name, path: `/attachments/images/${name}`, type: 'image' as const })),
        ...videos.map(name => ({ name, path: `/attachments/videos/${name}`, type: 'video' as const }))
      ];
      setMediaFiles(files);
      setShowMediaPicker(true);
    } catch {
      setMediaFiles([]);
      setShowMediaPicker(true);
    }
  };

  const handleInsertFromLibrary = (file: { name: string; path: string; type: 'image' | 'video' }) => {
    const relativePath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
    const insertAfterId = focusedBlockId || blocks[blocks.length - 1].id;
    if (file.type === 'video') {
      addBlockBelow(insertAfterId, 'paragraph', `<video src="${relativePath}" controls></video>`);
    } else {
      addBlockBelow(insertAfterId, 'paragraph', `![${file.name}](${relativePath})`);
    }
    setShowMediaPicker(false);
  };

  // Close attach menu on outside click
  useEffect(() => {
    if (!showAttachMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAttachMenu]);

  // Close doc menu on outside click
  useEffect(() => {
    if (!showDocMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (docMenuRef.current && !docMenuRef.current.contains(e.target as Node)) {
        setShowDocMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDocMenu]);

  // Load thumbnails when media picker opens
  useEffect(() => {
    if (!showMediaPicker || !adapter || mediaFiles.length === 0) return;
    let cancelled = false;
    const loadThumbs = async () => {
      const thumbs: Record<string, string> = {};
      for (const file of mediaFiles) {
        if (cancelled) break;
        try {
          const blob = await adapter.readBinaryFile(file.path);
          thumbs[file.path] = URL.createObjectURL(blob);
        } catch { /* skip */ }
      }
      if (!cancelled) setMediaThumbs(thumbs);
    };
    loadThumbs();
    return () => {
      cancelled = true;
      Object.values(mediaThumbs).forEach((url: string) => URL.revokeObjectURL(url));
    };
  }, [showMediaPicker, mediaFiles]);

  // Keyboard shortcuts: save, undo, redo
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges) handleSave();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [hasChanges, undo, redo]);

  // Selection change listener for floating format toolbar
  useEffect(() => {
    const handleSelectionChange = () => {
      // Don't close the toolbar if link input is active
      if (formatToolbarLockRef.current) return;

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setFormatToolbar(null);
        return;
      }
      // Check if selection is inside our editor
      const range = sel.getRangeAt(0);
      const container = document.getElementById('doc-view-container');
      if (!container || !container.contains(range.commonAncestorContainer)) {
        setFormatToolbar(null);
        return;
      }
      // Check if the selection is inside a contenteditable
      const ancestor = range.commonAncestorContainer;
      const editableEl = (ancestor.nodeType === 3 ? ancestor.parentElement : ancestor as HTMLElement)?.closest('[contenteditable]');
      if (!editableEl) {
        setFormatToolbar(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setFormatToolbar({ top: rect.top - 44, left: rect.left + rect.width / 2 });
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  // Apply inline format to selection
  const applyFormat = useCallback((type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'link', url?: string) => {
    const sel = window.getSelection();
    
    // For link type, selection might be gone (focus was on URL input)
    // Use saved selection data if available
    if (type === 'link' && url && savedSelectionForLinkRef.current) {
      const { blockId, startIdx, endIdx, text: selectedText } = savedSelectionForLinkRef.current;
      const block = blocks.find(b => b.id === blockId);
      if (block) {
        const wrapped = `[${selectedText}](${url})`;
        const newContent = block.content.substring(0, startIdx) + wrapped + block.content.substring(endIdx);
        updateBlock(blockId, { content: newContent });
        // Update DOM
        const blockEl = document.querySelector(`[data-block-id="${blockId}"] [contenteditable]`) as HTMLElement | null;
        if (blockEl) blockEl.textContent = newContent;
      }
      savedSelectionForLinkRef.current = null;
      setFormatToolbar(null);
      return;
    }

    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    
    const range = sel.getRangeAt(0);
    const selectedText = range.toString();
    if (!selectedText) return;

    let wrapped: string;
    switch (type) {
      case 'bold': wrapped = `**${selectedText}**`; break;
      case 'italic': wrapped = `*${selectedText}*`; break;
      case 'underline': wrapped = `<u>${selectedText}</u>`; break;
      case 'strikethrough': wrapped = `~~${selectedText}~~`; break;
      case 'code': wrapped = `\`${selectedText}\``; break;
      case 'link': wrapped = `[${selectedText}](${url || 'url'})`; break;
      default: return;
    }

    // Find which block this is in
    const editableEl = (range.commonAncestorContainer.nodeType === 3 
      ? range.commonAncestorContainer.parentElement 
      : range.commonAncestorContainer as HTMLElement)?.closest('[contenteditable]') as HTMLElement | null;
    
    if (!editableEl) return;

    const blockEl = editableEl.closest('[data-block-id]');
    if (!blockEl) return;
    const blockId = blockEl.getAttribute('data-block-id');
    if (!blockId) return;

    // Get text content and find selection position
    const fullText = editableEl.textContent || '';
    const beforeRange = document.createRange();
    beforeRange.setStart(editableEl, 0);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const startIdx = beforeRange.toString().length;
    const endIdx = startIdx + selectedText.length;

    const newContent = fullText.substring(0, startIdx) + wrapped + fullText.substring(endIdx);
    
    // Update the block
    updateBlock(blockId, { content: newContent });
    editableEl.textContent = newContent;
    
    // Reposition cursor after the wrapped text
    setTimeout(() => {
      const newSel = window.getSelection();
      if (!newSel) return;
      const textNode = editableEl.firstChild;
      if (textNode) {
        const cursorPos = startIdx + wrapped.length;
        const newRange = document.createRange();
        newRange.setStart(textNode, Math.min(cursorPos, textNode.textContent?.length || 0));
        newRange.collapse(true);
        newSel.removeAllRanges();
        newSel.addRange(newRange);
      }
      setFormatToolbar(null);
    }, 10);
  }, [updateBlock, blocks]);

  return (
    <div id="doc-view-container" className="flex-1 flex flex-col h-full bg-background font-body overflow-hidden">

      {isLockedByOther && (
        <div className="bg-bento-yellow-light border-b border-border p-3 flex items-center gap-2.5 text-bento-yellow text-xs shrink-0 select-none">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <div className="flex-1 font-semibold">
            Documento de solo lectura: @{lockingUser} está editando este archivo desde otra terminal ahora mismo.
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="bg-card border-b border-border px-3 sm:px-6 py-3 sm:py-4 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <input 
            type="text"
            disabled={isLockedByOther}
            className="w-full bg-transparent border-0 text-base sm:text-lg font-bold text-foreground hover:bg-accent focus:bg-card px-2 py-1 rounded-xl focus:outline-none transition-colors focus:ring-1 focus:ring-ring font-heading disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="text-[10px] text-muted-foreground font-mono px-2 mt-0.5 flex items-center gap-1 truncate">
            <span>Formato: Markdown legible. Archivo:</span>
            <span className="text-foreground font-semibold truncate">/docs/{docMeta.filename}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Attachment button */}
          <div className="relative" ref={attachMenuRef}>
            <button
              onClick={() => !isLockedByOther && setShowAttachMenu(!showAttachMenu)}
              disabled={isLockedByOther}
              className="p-2 bg-card border border-border text-muted-foreground hover:text-foreground rounded-xl hover:bg-accent transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Adjuntar imagen o video"
            >
              <Paperclip className="w-3.5 h-3.5" />
              <ChevronDown className="w-3 h-3" />
            </button>
            {showAttachMenu && (
              <div className="absolute top-full mt-1 left-0 sm:right-0 sm:left-auto bg-card border border-border rounded-xl shadow-card-hover py-1 z-50 min-w-[200px]">
                <label className="flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent cursor-pointer transition-colors">
                  <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
                  Desde archivo
                  <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={(e) => { handleAttachmentUpload(e); setShowAttachMenu(false); }} className="hidden" />
                </label>
                <button
                  onClick={handleOpenMediaPicker}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent cursor-pointer transition-colors text-left"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  Desde biblioteca de medios
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={!hasChanges || loading || isLockedByOther}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all outline-none border cursor-pointer ${
              hasChanges 
                ? 'bg-primary hover:opacity-90 text-primary-foreground border-primary shadow-card' 
                : 'bg-secondary text-muted-foreground border-border cursor-not-allowed'
            }`}
          >
            {loading ? (
              <div className="w-3.5 h-3.5 border-b-2 border-primary rounded-full animate-spin"></div>
            ) : hasChanges ? (
              <Save className="w-3.5 h-3.5" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Guardar
          </button>

          <div className="relative" ref={docMenuRef}>
            <button
              onClick={() => setShowDocMenu(!showDocMenu)}
              disabled={isLockedByOther}
              className="p-2 bg-card border border-border text-muted-foreground hover:text-foreground rounded-xl hover:bg-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Opciones del documento"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {showDocMenu && (
              <div className="absolute top-full right-0 mt-1 bg-card border border-border rounded-xl shadow-card-hover py-1 z-50 min-w-[180px]">
                <button
                  onClick={() => {
                    setCodeMode(!codeMode);
                    setShowDocMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-colors text-left"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  {codeMode ? 'Modo bloques' : 'Modo código'}
                </button>
                <button
                  disabled={isLockedByOther}
                  onClick={async () => {
                    setShowDocMenu(false);
                    const ok = await confirm({ title: 'Eliminar documento', message: '¿Eliminar de forma permanente este archivo Markdown? Esta acción no se puede deshacer.', confirmLabel: 'Eliminar', variant: 'danger' });
                    if (ok) deleteDoc(docMeta.id);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-destructive cursor-pointer transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar documento
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Block Editor Body */}
      {!codeMode ? (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
            {blocks.map((block, idx) => {
              const numberedIndex = block.type === 'numbered' ? getNumberedDisplayIndex(blocks, idx) : 0;
              return (
              <div key={block.id} data-block-id={block.id}>
                <BlockEditor
                  block={block}
                  index={idx}
                  numberedIndex={numberedIndex}
                  focused={focusedBlockId === block.id}
                  totalBlocks={blocks.length}
                  onUpdate={handleBlockUpdate}
                  onFocus={setFocusedBlockId}
                  onKeyDown={handleBlockKeyDown}
                  onAddBelow={addBlockBelow}
                  onDelete={deleteBlock}
                  onDuplicate={duplicateBlock}
                  onConvertType={convertBlockType}
                  onMoveBlock={moveBlock}
                  resolvedUrls={resolvedUrls}
                  readOnly={isLockedByOther}
                />
              </div>
            );
          })}
            
            {/* Empty area click to add block at end */}
            <div 
              className={`min-h-[200px] ${isLockedByOther ? 'cursor-default' : 'cursor-text'}`}
              onClick={() => {
                if (isLockedByOther) return;
                const lastBlock = blocks[blocks.length - 1];
                if (lastBlock && lastBlock.content === '') {
                  setFocusedBlockId(lastBlock.id);
                } else {
                  addBlockBelow(blocks[blocks.length - 1].id);
                }
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col">
          <textarea
            ref={codeTextareaRef}
            disabled={isLockedByOther}
            className="flex-1 w-full bg-card text-foreground p-6 text-xs font-mono focus:outline-none resize-none leading-relaxed disabled:opacity-60"
            style={{ tabSize: 2 }}
            value={blocksToMarkdown(blocks)}
            onChange={(e) => {
              const newBlocks = markdownToBlocks(e.target.value);
              skipHistoryRef.current = true;
              setBlocks(newBlocks);
            }}
            placeholder="# Escribe en Markdown..."
          />
        </div>
      )}

      {/* Slash Command Menu */}
      {slashMenu && (
        <SlashMenu
          position={slashMenu.position}
          filter={slashMenu.filter}
          onSelect={handleSlashSelect}
          onClose={handleSlashClose}
        />
      )}

      {/* Floating Format Toolbar */}
      {formatToolbar && !slashMenu && (
        <FloatingToolbar
          position={formatToolbar}
          onFormat={applyFormat}
          onClose={() => setFormatToolbar(null)}
          onLinkModeChange={(active, selectionData) => { 
            formatToolbarLockRef.current = active;
            if (active && selectionData) {
              savedSelectionForLinkRef.current = selectionData;
            }
          }}
        />
      )}

      {/* Media Library Picker Modal */}
      {showMediaPicker && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-foreground/20 backdrop-blur-[2px] animate-fade-in" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-card-hover w-full max-w-lg mx-4 max-h-[75vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
              <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-bento-blue" />
                Biblioteca de Medios
              </h2>
              <button onClick={() => setShowMediaPicker(false)} className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                ✕
              </button>
            </div>
            <p className="px-5 pt-3 text-[10px] text-muted-foreground">Haz clic en un archivo para insertarlo en el documento.</p>
            <div className="flex-1 overflow-y-auto p-4">
              {mediaFiles.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No hay archivos en la biblioteca de medios.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {mediaFiles.map(file => (
                    <button
                      key={file.path}
                      onClick={() => handleInsertFromLibrary(file)}
                      className="group relative flex flex-col items-center rounded-xl border border-border hover:border-bento-blue/50 bg-secondary hover:bg-accent overflow-hidden transition-all cursor-pointer"
                      title={file.name}
                    >
                      <div className="w-full aspect-square flex items-center justify-center overflow-hidden bg-secondary">
                        {mediaThumbs[file.path] ? (
                          file.type === 'video' ? (
                            <video src={mediaThumbs[file.path]} className="w-full h-full object-cover" muted />
                          ) : (
                            <img src={mediaThumbs[file.path]} alt={file.name} className="w-full h-full object-cover" />
                          )
                        ) : (
                          <div className="text-muted-foreground/30">
                            {file.type === 'video' ? <Film className="w-8 h-8" /> : <ImageIcon className="w-8 h-8" />}
                          </div>
                        )}
                      </div>
                      <div className="w-full px-2 py-1.5">
                        <span className="text-[9px] font-mono text-muted-foreground group-hover:text-foreground truncate block">{file.name}</span>
                      </div>
                      <span className={`absolute top-1.5 right-1.5 text-[7px] font-bold uppercase px-1 py-0.5 rounded ${
                        file.type === 'video' ? 'bg-bento-purple-light text-bento-purple' : 'bg-bento-blue-light text-bento-blue'
                      }`}>
                        {file.type === 'video' ? 'VID' : 'IMG'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
