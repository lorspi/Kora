/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared Mermaid rendering used by both the TipTap editor NodeView and any other
 * preview surface. Extracted verbatim from the legacy DocView so live diagram
 * rendering (theme-reactive, transparent background) behaves identically.
 */
import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

export function getMermaidThemeConfig(isDark: boolean) {
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
      },
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
    },
  };
}

export function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

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
        mermaid.initialize(getMermaidThemeConfig(isDark));
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
      <div ref={containerRef} className="flex justify-center py-4 overflow-x-auto mermaid" />
      {renderError && (
        <div className="text-[10px] text-destructive text-center pb-2 font-mono">⚠️ {renderError}</div>
      )}
    </div>
  );
}
