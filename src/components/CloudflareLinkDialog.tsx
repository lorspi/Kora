/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dialog to link a cloud project hosted on the team's own Cloudflare account.
 * Two paths: deploy the Kora backend with the one-click "Deploy to Cloudflare"
 * button and paste its address + password, or join with an invitation someone
 * on the team created (link or code).
 */

import React, { useState } from 'react';
import {
  Cloud, X, ArrowLeft, ArrowSquareOut as ExternalLink, Warning as AlertTriangle,
  SpinnerGap as Loader2, CaretDown as ChevronDown, RocketLaunch, Ticket,
} from '@phosphor-icons/react';
import { useProjectStore } from '../store';
import {
  CLOUDFLARE_DEPLOY_URL,
  decodeInvite,
  normalizeWorkerUrl,
  testCloudflareConnection,
} from '../lib/cloudflare';

interface Props {
  onClose: () => void;
}

type Mode = 'deploy' | 'invite';

const inputClass =
  'w-full bg-secondary border border-input rounded-xl px-3 py-2 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-50';

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="shrink-0 w-5 h-5 rounded-full bg-bento-blue-light text-bento-blue font-bold flex items-center justify-center text-[10px]">{n}</span>
      <span>{children}</span>
    </li>
  );
}

export default function CloudflareLinkDialog({ onClose }: Props) {
  const { registerCloudflareProject, loadProjectById, joinCloudflareInvite } = useProjectStore();

  const [mode, setMode] = useState<Mode>('deploy');
  const [projectName, setProjectName] = useState('');
  const [workerUrl, setWorkerUrl] = useState('');
  const [password, setPassword] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [inviteText, setInviteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setError(null);
    const name = projectName.trim();
    if (!name) {
      setError('Ponle un nombre a este proyecto en la nube.');
      return;
    }
    let url: string;
    try {
      url = normalizeWorkerUrl(workerUrl);
    } catch (e: any) {
      setError(e.message);
      return;
    }
    if (!password.trim()) {
      setError('Escribe la contraseña de administración que elegiste al desplegar.');
      return;
    }
    const space = spaceId.trim() || 'default';
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(space)) {
      setError('El espacio solo admite letras, números, guiones y guiones bajos.');
      return;
    }

    setBusy(true);
    try {
      const link = { url, token: password.trim(), spaceId: space };
      await testCloudflareConnection(link);
      const projId = registerCloudflareProject(name, link);
      await loadProjectById(projId);
      // On success the parent screen unmounts as the app moves into the project.
    } catch (e: any) {
      setError(e.message || 'No se pudo conectar con el backend.');
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    setError(null);
    const invite = decodeInvite(inviteText);
    if (!invite) {
      setError('No reconozco esa invitación. Pega el enlace completo o el código que te enviaron.');
      return;
    }
    setBusy(true);
    try {
      await joinCloudflareInvite(invite);
    } catch (e: any) {
      setError(e.message || 'No se pudo usar la invitación.');
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
            Proyecto en la nube (Cloudflare)
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode switch */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-secondary rounded-xl border border-border" role="tablist">
        {([
          { id: 'deploy' as const, label: 'Crear mi backend', icon: RocketLaunch },
          { id: 'invite' as const, label: 'Tengo una invitación', icon: Ticket },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={mode === id}
            onClick={() => { setMode(id); setError(null); }}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              mode === id ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {mode === 'deploy' ? (
        <>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Kora instala su backend en <strong>tu propia cuenta gratuita de Cloudflare</strong> con un clic. Tus
            datos viven en tu cuenta y se sincronizan en tiempo real con todo el equipo.
          </p>

          <div className="bg-secondary/50 border border-border rounded-2xl p-4 space-y-3">
            <ol className="space-y-2.5 text-xs text-muted-foreground leading-relaxed list-none">
              <Step n={1}>
                Pulsa el botón. Inicia sesión en Cloudflare (o crea una cuenta gratis) y conecta tu cuenta de GitHub
                cuando te lo pida: ahí se guarda una copia del backend.
                <a
                  href={CLOUDFLARE_DEPLOY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex w-fit items-center gap-2 px-3.5 py-2 rounded-xl bg-[#f38020] hover:opacity-90 text-white font-bold text-xs transition-opacity"
                >
                  <RocketLaunch className="w-4 h-4" />
                  Desplegar en Cloudflare
                  <ExternalLink className="w-3 h-3" />
                </a>
              </Step>
              <Step n={2}>
                En <strong>ADMIN_TOKEN</strong> reemplaza el texto de ejemplo por una contraseña tuya de al menos
                12 caracteres y <strong>guárdala</strong>: es la llave de administración de tu backend.
              </Step>
              <Step n={3}>
                Pulsa <strong>Crear y desplegar</strong>. Al terminar, copia la dirección del Worker (termina en{' '}
                <code className="font-mono text-[11px] bg-secondary px-1 py-0.5 rounded">.workers.dev</code>) y
                pégala abajo junto con tu contraseña.
              </Step>
            </ol>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-foreground block mb-1.5">Nombre del proyecto en la nube</label>
              <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Ej. Marketing 2026" disabled={busy} className={inputClass} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-foreground block mb-1.5">Dirección del backend</label>
              <input
                type="url"
                value={workerUrl}
                onChange={(e) => setWorkerUrl(e.target.value)}
                placeholder="https://kora-backend.tu-cuenta.workers.dev"
                disabled={busy}
                className={`${inputClass} font-mono`}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-foreground block mb-1.5">Contraseña de administración (ADMIN_TOKEN)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                className={inputClass}
                autoComplete="off"
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
              />
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Se guarda solo en este navegador. Para sumar a tu equipo no la compartas: crea enlaces de invitación
                desde el inicio del proyecto.
              </p>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                aria-expanded={showAdvanced}
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                Opciones avanzadas
              </button>
              {showAdvanced && (
                <div className="mt-2 animate-fade-in">
                  <label className="text-[11px] font-semibold text-foreground block mb-1.5">Espacio</label>
                  <input
                    type="text"
                    value={spaceId}
                    onChange={(e) => setSpaceId(e.target.value)}
                    placeholder="default"
                    disabled={busy}
                    className={`${inputClass} font-mono`}
                  />
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Un mismo backend puede guardar varios proyectos independientes: usa un nombre de espacio distinto
                    para cada uno. Déjalo vacío si solo tendrás uno.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Alguien de tu equipo te envió un <strong>enlace</strong> o un <strong>código de invitación</strong>.
            Pégalo aquí para unirte a su proyecto. Si recibiste un enlace, también puedes simplemente abrirlo.
          </p>
          <div>
            <label className="text-[11px] font-semibold text-foreground block mb-1.5">Enlace o código de invitación</label>
            <textarea
              value={inviteText}
              onChange={(e) => setInviteText(e.target.value)}
              disabled={busy}
              rows={4}
              placeholder="https://…/#/unirse?i=…  o  eyJ1Ijoi…"
              className={`${inputClass} font-mono text-[11px] resize-y`}
              spellCheck={false}
            />
          </div>
        </>
      )}

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
          onClick={mode === 'deploy' ? handleConnect : handleJoin}
          disabled={busy}
          className="px-4 py-2 text-xs font-bold rounded-xl bg-primary hover:opacity-90 text-primary-foreground transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center gap-2"
        >
          {busy ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Conectando...
            </>
          ) : mode === 'deploy' ? (
            <>
              <Cloud className="w-3.5 h-3.5" />
              Conectar
            </>
          ) : (
            <>
              <Ticket className="w-3.5 h-3.5" />
              Unirme
            </>
          )}
        </button>
      </div>
    </div>
  );
}
