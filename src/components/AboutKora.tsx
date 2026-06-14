/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useVersion } from '../hooks/useVersion';
import { 
  Info, 
  Github, 
  Coffee, 
  Scale, 
  Globe, 
  Heart,
  Code2,
  Cpu
} from 'lucide-react';

export default function AboutKora() {
  const version = useVersion();

  const techStack = [
    'React 19',
    'TypeScript',
    'Vite',
    'Tailwind CSS',
    'Zustand',
    'Lucide React',
    'JSZip'
  ];

  return (
    <div className="flex-1 overflow-auto p-6 font-body">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div className="text-center space-y-3 pb-4">
          <img src="/icon.svg" alt="Kora" className="w-16 h-16 mx-auto" />
          <div>
            <h1 className="text-2xl font-bold text-foreground font-heading">Kora</h1>
            <p className="text-xs text-muted-foreground font-mono mt-1">versión {version}</p>
          </div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            El lugar donde los proyectos encuentran un hogar permanente. Gestión de proyectos offline-first, sin servidores externos ni suscripciones.
          </p>
        </div>

        {/* Filosofía */}
        <section className="bg-card border border-border rounded-2xl p-5 space-y-3 shadow-card">
          <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
            <Heart className="w-4 h-4 text-bento-orange" />
            Filosofía
          </h2>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-bento-blue mt-0.5">•</span>
              El trabajo y los datos pertenecen a quienes los crean.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-bento-blue mt-0.5">•</span>
              No depende de servidores externos ni de suscripciones para existir.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-bento-blue mt-0.5">•</span>
              La simplicidad es una característica, no una limitación.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-bento-blue mt-0.5">•</span>
              El formato de almacenamiento es legible por humanos.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-bento-blue mt-0.5">•</span>
              Cada nueva funcionalidad debe justificar su existencia.
            </li>
          </ul>
        </section>

        {/* Info General */}
        <section className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-card">
          <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
            <Info className="w-4 h-4 text-bento-blue" />
            Información
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-secondary rounded-xl p-3 border border-border">
              <span className="text-muted-foreground block mb-0.5 font-semibold">Autor</span>
              <span className="text-foreground font-bold">Juan Pablo Pérez</span>
            </div>
            <div className="bg-secondary rounded-xl p-3 border border-border">
              <span className="text-muted-foreground block mb-0.5 font-semibold">Licencia</span>
              <span className="text-foreground font-bold">Apache 2.0</span>
            </div>
            <div className="bg-secondary rounded-xl p-3 border border-border">
              <span className="text-muted-foreground block mb-0.5 font-semibold">Versión</span>
              <span className="text-foreground font-mono font-bold">{version}</span>
            </div>
            <div className="bg-secondary rounded-xl p-3 border border-border">
              <span className="text-muted-foreground block mb-0.5 font-semibold">Plataforma</span>
              <span className="text-foreground font-bold">Web (Offline-first)</span>
            </div>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="bg-card border border-border rounded-2xl p-5 space-y-3 shadow-card">
          <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
            <Code2 className="w-4 h-4 text-bento-purple" />
            Stack Tecnológico
          </h2>
          <div className="flex flex-wrap gap-2">
            {techStack.map(tech => (
              <span
                key={tech}
                className="text-[11px] font-semibold bg-secondary border border-border text-muted-foreground px-2.5 py-1 rounded-lg"
              >
                {tech}
              </span>
            ))}
          </div>
        </section>

        {/* Links */}
        <section className="bg-card border border-border rounded-2xl p-5 space-y-3 shadow-card">
          <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
            <Globe className="w-4 h-4 text-bento-green" />
            Enlaces
          </h2>

          <div className="flex flex-col gap-2">
            <a
              href="https://github.com/lorspi/Kora"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 bg-secondary hover:bg-accent border border-border rounded-xl px-4 py-2.5 text-xs font-semibold text-foreground transition-colors"
            >
              <Github className="w-4 h-4 text-muted-foreground" />
              Repositorio en GitHub
            </a>

            <a
              href="https://ko-fi.com/lorspi"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 bg-secondary hover:bg-accent border border-border rounded-xl px-4 py-2.5 text-xs font-semibold text-foreground transition-colors"
            >
              <Coffee className="w-4 h-4 text-bento-orange" />
              Apoya al creador en Ko-fi
            </a>
          </div>
        </section>

        {/* License Notice */}
        <section className="bg-card border border-border rounded-2xl p-5 space-y-3 shadow-card">
          <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
            <Scale className="w-4 h-4 text-muted-foreground" />
            Licencia
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Kora se distribuye bajo la Licencia Apache 2.0. Puedes usar, modificar y distribuir este software libremente siempre que se mantenga la atribución original y la nota de licencia. Esta licencia no proporciona garantía alguna sobre el software.
          </p>
        </section>

        {/* Footer */}
        <p className="text-center text-[10px] text-muted-foreground pb-4">
          Hecho con cariño por lorspi · {new Date().getFullYear()}
        </p>

      </div>
    </div>
  );
}
