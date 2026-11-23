/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shown when Kora is opened through an invitation link (#/unirse?i=...): asks
 * for confirmation and joins the team's cloud project on its Cloudflare backend.
 */

import React, { useState } from 'react';
import { Ticket, Warning as AlertTriangle, SpinnerGap as Loader2 } from '@phosphor-icons/react';
import { useProjectStore } from '../store';
import ThemeToggle from './ThemeToggle';

export default function InviteJoinScreen() {
  const { pendingInvite, setPendingInvite, joinCloudflareInvite } = useProjectStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!pendingInvite) return null;

  let host = pendingInvite.url;
  try {
    host = new URL(pendingInvite.url).host;
  } catch { /* keep as is */ }

  const handleJoin = async () => {
    setError(null);
    setBusy(true);
    try {
      await joinCloudflareInvite(pendingInvite);
    } catch (e: any) {
      setError(e?.message || 'No se pudo usar la invitación.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-background text-foreground flex items-center justify-center px-4 py-6 font-body">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="max-w-md w-full bg-card rounded-2xl p-6 sm:p-8 border border-border shadow-card-hover space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="Kora" className="w-10 h-10" />
          <div>
            <p className="text-[11px] uppercase tracking-wide font-bold text-muted-foreground">Invitación</p>
            <h1 className="text-lg font-bold font-heading leading-tight">
              {pendingInvite.name ? `Únete a "${pendingInvite.name}"` : 'Únete a un proyecto en la nube'}
            </h1>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Te invitaron a un proyecto de Kora que vive en el backend de Cloudflare de tu equipo
          (<span className="font-mono text-foreground">{host}</span>). Al unirte, el proyecto se agrega a tu lista
          en este navegador; dentro de él entrarás o crearás tu usuario de Kora como siempre.
        </p>

        {error && (
          <div className="p-3 bg-bento-orange-light border border-border rounded-xl flex items-start gap-2.5 text-bento-orange text-xs leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setPendingInvite(null)}
            disabled={busy}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-accent border border-border text-foreground transition-colors cursor-pointer disabled:opacity-50"
          >
            Ahora no
          </button>
          <button
            onClick={handleJoin}
            disabled={busy}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-primary hover:opacity-90 text-primary-foreground transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center gap-2"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ticket className="w-3.5 h-3.5" />}
            {busy ? 'Uniéndome...' : 'Unirme al proyecto'}
          </button>
        </div>
      </div>
    </div>
  );
}
