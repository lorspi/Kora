/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dialog to link a team's own Firebase project as a realtime cloud backend.
 * Walks the user through creating the project in the Firebase console, then
 * lets them paste the public config object. No Kora-owned backend is involved.
 */

import React, { useState } from 'react';
import {
  Cloud, X, ArrowLeft, Copy, Check, ArrowSquareOut as ExternalLink,
  Warning as AlertTriangle, SpinnerGap as Loader2, ShieldCheck, CaretDown as ChevronDown,
} from '@phosphor-icons/react';
import { useProjectStore } from '../store';
import {
  parseFirebaseConfig,
  testFirebaseConnection,
  FIRESTORE_RULES_TEMPLATE,
} from '../lib/firebase';

interface Props {
  onClose: () => void;
}

export default function FirebaseLinkDialog({ onClose }: Props) {
  const { registerFirebaseProject, loadProjectById } = useProjectStore();

  const [projectName, setProjectName] = useState('');
  const [configText, setConfigText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedRules, setCopiedRules] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const handleCopyRules = async () => {
    try {
      await navigator.clipboard.writeText(FIRESTORE_RULES_TEMPLATE);
      setCopiedRules(true);
      setTimeout(() => setCopiedRules(false), 2000);
    } catch {
      /* clipboard may be blocked; user can copy manually */
    }
  };

  const handleConnect = async () => {
    setError(null);

    const name = projectName.trim();
    if (!name) {
      setError('Ponle un nombre a este proyecto en la nube.');
      return;
    }

    let config;
    try {
      config = parseFirebaseConfig(configText);
    } catch (e: any) {
      setError(e.message || 'Configuración inválida.');
      return;
    }

    setBusy(true);
    try {
      // Validate the config actually reaches Firestore (auth + rules) before saving.
      await testFirebaseConnection(config, 'default');

      const projId = registerFirebaseProject(name, config, 'default');
      await loadProjectById(projId);
      // On success the parent screen (ProjectBrowser) will unmount as the app
      // transitions into the loaded project / onboarding / auth flow.
    } catch (e: any) {
      setError(e.message || 'No se pudo conectar con Firebase.');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="p-1.5 -ml-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label="Volver"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg font-bold text-foreground font-heading flex items-center gap-2">
            <Cloud className="w-5 h-5 text-bento-orange" />
            Proyecto en la nube (Firebase)
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Conecta tu propio proyecto de Firebase para sincronizar en tiempo real con
        todo tu equipo, sin depender de la velocidad de Drive o Mega. Tú controlas
        los datos: viven en el proyecto de Firebase de tu equipo.
      </p>

      {/* Collapsible setup instructions — returning users can skip straight to pasting the config */}
      <div className="border border-border rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowInstructions(v => !v)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer text-left"
          aria-expanded={showInstructions}
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-xs font-bold text-foreground font-heading uppercase tracking-wide">
              Cómo crear y configurar tu proyecto de Firebase
            </span>
            <span className="text-[11px] text-muted-foreground font-normal normal-case">
              Ábrelo si es tu primera vez. Si ya tienes tu proyecto listo, solo pega la configuración abajo.
            </span>
          </span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${showInstructions ? 'rotate-180' : ''}`} />
        </button>

        {showInstructions && (
          <div className="border-t border-border p-4 space-y-4 animate-fade-in">
      {/* Step-by-step instructions */}
      <div className="bg-secondary/50 border border-border rounded-2xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-foreground font-heading uppercase tracking-wide">
          Cómo obtener tu configuración
        </h3>
        <ol className="space-y-2.5 text-xs text-muted-foreground leading-relaxed list-none">
          <li className="flex gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-bento-blue-light text-bento-blue font-bold flex items-center justify-center text-[10px]">1</span>
            <span>
              Entra a la{' '}
              <a
                href="https://console.firebase.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-bento-blue font-semibold hover:underline inline-flex items-center gap-0.5"
              >
                consola de Firebase <ExternalLink className="w-3 h-3" />
              </a>{' '}
              y crea un proyecto nuevo (o usa uno existente).
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-bento-blue-light text-bento-blue font-bold flex items-center justify-center text-[10px]">2</span>
            <span>
              En el buscador (arriba a la izquierda) escribe <strong>Firestore</strong> y
              selecciónalo en los resultados. Ahí pulsa <strong>Crear base de datos</strong>.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-bento-blue-light text-bento-blue font-bold flex items-center justify-center text-[10px]">3</span>
            <span>
              En el asistente de creación: elige <strong>Edición Standard</strong>, deja el
              {' '}<strong>ID de la base de datos</strong> en{' '}
              <code className="font-mono text-[11px] bg-secondary px-1 py-0.5 rounded">(default)</code>,
              {' '}escoge la <strong>Ubicación</strong> más cercana a tu equipo (no se puede
              cambiar después) y pulsa <strong>Siguiente</strong>. Cuando pregunte por las
              reglas, deja el <strong>modo producción</strong> y finaliza.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-bento-blue-light text-bento-blue font-bold flex items-center justify-center text-[10px]">4</span>
            <span>
              Vuelve al buscador (arriba a la izquierda), escribe <strong>Authentication</strong>
              {' '}y selecciónalo. Pulsa <strong>Comenzar</strong>, abre la pestaña
              {' '}<strong>Sign-in method</strong> y habilita el proveedor <strong>Anónimo</strong>.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-bento-blue-light text-bento-blue font-bold flex items-center justify-center text-[10px]">5</span>
            <span>
              En la barra izquierda pulsa el engranaje <strong>Configuración</strong> →
              {' '}<strong>General</strong>. Baja hasta <strong>Tus apps</strong>, agrega una
              app <strong>Web</strong> (el icono <code className="font-mono text-[11px] bg-secondary px-1 py-0.5 rounded">&lt;/&gt;</code>),
              ponle un apodo y pulsa <strong>Registrar app</strong>.
              {' '}<strong>No marques</strong> la casilla de <strong>Firebase Hosting</strong>:
              no hace falta. En la pantalla siguiente (<em>Agrega el SDK de Firebase</em>)
              {' '}<strong>ignora</strong> los comandos de npm. Dentro de ese mismo bloque de
              código está el objeto
              {' '}<code className="font-mono text-[11px] bg-secondary px-1 py-0.5 rounded">const firebaseConfig = &#123; ... &#125;</code>:
              {' '}cópialo (o usa el icono de copiar del bloque) y pégalo abajo. Kora ya trae el
              SDK integrado, así que no necesitas nada más de esa pantalla.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-bento-blue-light text-bento-blue font-bold flex items-center justify-center text-[10px]">6</span>
            <span>
              En <strong>Firestore → Reglas</strong>, pega la plantilla de seguridad
              de abajo y publica. Luego pega aquí tu configuración.
            </span>
          </li>
        </ol>
      </div>

      {/* Security rules template */}
      <div className="border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/50 border-b border-border">
          <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-bento-green" />
            Reglas de seguridad recomendadas
          </span>
          <button
            onClick={handleCopyRules}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-card border border-border text-[11px] font-semibold text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            {copiedRules ? <Check className="w-3 h-3 text-bento-green" /> : <Copy className="w-3 h-3" />}
            {copiedRules ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <pre className="p-3 text-[10px] font-mono text-muted-foreground overflow-x-auto leading-relaxed whitespace-pre">
{FIRESTORE_RULES_TEMPLATE}
        </pre>
      </div>
          </div>
        )}
      </div>

      {/* Inputs */}
      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-semibold text-foreground block mb-1.5">
            Nombre del proyecto en la nube
          </label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Ej. Marketing 2026"
            disabled={busy}
            className="w-full bg-secondary border border-input rounded-xl px-3 py-2 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-foreground block mb-1.5">
            Objeto de configuración de Firebase
          </label>
          <textarea
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
            disabled={busy}
            rows={8}
            placeholder={`const firebaseConfig = {\n  apiKey: "AIza...",\n  authDomain: "tu-proyecto.firebaseapp.com",\n  projectId: "tu-proyecto",\n  storageBucket: "tu-proyecto.appspot.com",\n  messagingSenderId: "1234567890",\n  appId: "1:1234:web:abcd..."\n};`}
            className="w-full bg-secondary border border-input rounded-xl px-3 py-2 text-[11px] font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring resize-y disabled:opacity-50"
          />
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Puedes pegar el bloque completo o solo el objeto JSON. Esta configuración
            es pública por diseño; la seguridad la dan las reglas + el inicio de sesión.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-bento-orange-light border border-border rounded-xl flex items-start gap-2.5 text-bento-orange text-xs leading-relaxed">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-1">
        <button
          onClick={onClose}
          disabled={busy}
          className="px-4 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-accent border border-border text-foreground transition-colors cursor-pointer disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleConnect}
          disabled={busy}
          className="px-4 py-2 text-xs font-bold rounded-xl bg-primary hover:opacity-90 text-primary-foreground transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center gap-2"
        >
          {busy ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Conectando...
            </>
          ) : (
            <>
              <Cloud className="w-3.5 h-3.5" />
              Conectar equipo
            </>
          )}
        </button>
      </div>
    </div>
  );
}
