/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * "Acceso al proyecto en la nube" (Cloudflare projects): shows the backend the
 * project lives on and lets backend admins invite people with a link or a code,
 * and revoke those invitations.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Cloud, Copy, Check, Link as LinkIcon, Trash as Trash2, SpinnerGap as Loader2,
  UserPlus, Crown, User,
} from '@phosphor-icons/react';
import { useProjectStore } from '../store';
import { useUI } from '../lib/ui';
import type { CloudflareAdapter, CloudflareInviteInfo, CloudflareRole } from '../lib/cloudflare';
import { buildInviteLink, encodeInvite } from '../lib/cloudflare';
import CustomSelect from './CustomSelect';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard blocked: the text is visible to copy by hand */
        }
      }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card border border-border text-[11px] font-semibold text-foreground hover:bg-accent transition-colors cursor-pointer shrink-0"
    >
      {copied ? <Check className="w-3 h-3 text-bento-green" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copiado' : label}
    </button>
  );
}

export default function CloudAccessCard() {
  const { adapter, projectMeta } = useProjectStore();
  const { toast, confirm } = useUI();
  const cf = adapter && adapter.getMode() === 'CLOUDFLARE' ? (adapter as CloudflareAdapter) : null;
  const isAdmin = cf?.getRole() === 'admin';

  const [invites, setInvites] = useState<CloudflareInviteInfo[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<CloudflareRole>('member');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ name: string; link: string; code: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!cf || !isAdmin) return;
    setLoadingInvites(true);
    try {
      setInvites(await cf.listInvites());
    } catch (e: any) {
      toast(e?.message || 'No se pudieron cargar las invitaciones', 'error');
    } finally {
      setLoadingInvites(false);
    }
  }, [cf, isAdmin]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!cf) return null;
  const link = cf.getLink();
  let host = link.url;
  try {
    host = new URL(link.url).host;
  } catch { /* keep */ }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const who = name.trim();
    if (!who) {
      toast('Escribe para quién es la invitación', 'error');
      return;
    }
    setCreating(true);
    try {
      const inv = await cf.createInvite(who, role);
      const invite = { url: link.url, token: inv.token, spaceId: link.spaceId, name: projectMeta?.name };
      setCreated({ name: who, link: buildInviteLink(invite), code: encodeInvite(invite) });
      setName('');
      await refresh();
    } catch (err: any) {
      toast(err?.message || 'No se pudo crear la invitación', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (inv: CloudflareInviteInfo) => {
    const ok = await confirm({
      title: 'Revocar invitación',
      message: `"${inv.name}" dejará de tener acceso al proyecto desde ya, en todos sus dispositivos. Podrás enviarle una invitación nueva cuando quieras.`,
      confirmLabel: 'Revocar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await cf.revokeInvite(inv.id);
      setInvites((list) => list.filter((x) => x.id !== inv.id));
      toast('Invitación revocada', 'success');
    } catch (err: any) {
      toast(err?.message || 'No se pudo revocar la invitación', 'error');
    }
  };

  return (
    <section className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
            <Cloud className="w-4 h-4 text-bento-orange" />
            Acceso al proyecto en la nube
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Backend de Cloudflare: <span className="font-mono text-foreground">{host}</span>
            {link.spaceId !== 'default' && <> · espacio <span className="font-mono text-foreground">{link.spaceId}</span></>}
          </p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border border-border flex items-center gap-1 ${isAdmin ? 'bg-bento-yellow-light text-bento-yellow' : 'bg-secondary text-muted-foreground'}`}>
          {isAdmin ? <Crown className="w-3 h-3" /> : <User className="w-3 h-3" />}
          {isAdmin ? 'Administras el backend' : 'Acceso de miembro'}
        </span>
      </div>

      {!isAdmin ? (
        <p className="text-xs text-muted-foreground">
          Para sumar a más personas, pide a quien administra el backend que les cree un enlace de invitación.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Invita a tu equipo con un enlace: al abrirlo, el proyecto se agrega a su Kora y luego entra o crea su
            usuario como siempre. Cada invitación es personal y se puede revocar en cualquier momento.
          </p>

          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Para quién es (ej. Ana)"
              disabled={creating}
              className="flex-1 min-w-0 bg-secondary border border-input rounded-xl px-3 py-2 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-50"
            />
            <CustomSelect
              className="sm:w-40"
              value={role}
              onChange={(v) => setRole(v as CloudflareRole)}
              options={[
                { value: 'member', label: 'Miembro' },
                { value: 'admin', label: 'Administrador' },
              ]}
            />
            <button
              type="submit"
              disabled={creating}
              className="bg-primary hover:opacity-90 text-primary-foreground font-bold px-4 py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              Crear invitación
            </button>
          </form>

          {created && (
            <div className="border border-bento-green/40 bg-bento-green-light rounded-xl p-3 space-y-2.5 animate-fade-in">
              <p className="text-xs font-semibold text-foreground">Invitación para {created.name} lista. Envíale el enlace:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate font-mono text-[11px] bg-card border border-border rounded-lg px-2 py-1.5 text-muted-foreground">{created.link}</code>
                <CopyButton text={created.link} label="Copiar enlace" />
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate font-mono text-[11px] bg-card border border-border rounded-lg px-2 py-1.5 text-muted-foreground">{created.code}</code>
                <CopyButton text={created.code} label="Copiar código" />
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                El enlace abre esta misma dirección de Kora. Si tu compañero usa Kora en otra dirección (por ejemplo,
                en su propio equipo), que pegue el código en <strong>Nuevo proyecto → Nube con Cloudflare → Tengo una
                invitación</strong>. Trátalo como una contraseña: quien lo tenga puede entrar al proyecto.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <LinkIcon className="w-3 h-3" /> Invitaciones activas
              {loadingInvites && <Loader2 className="w-3 h-3 animate-spin" />}
            </span>
            {invites.length === 0 && !loadingInvites && (
              <p className="text-[11px] text-muted-foreground italic">Todavía no has invitado a nadie.</p>
            )}
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary border border-border">
                {inv.role === 'admin' ? <Crown className="w-3.5 h-3.5 text-bento-yellow shrink-0" /> : <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                <span className="text-xs font-semibold text-foreground truncate">{inv.name}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {inv.role === 'admin' ? 'Administrador' : 'Miembro'} · {new Date(inv.createdAt).toLocaleDateString()}
                </span>
                <button
                  onClick={() => handleRevoke(inv)}
                  className="ml-auto p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer shrink-0"
                  data-tooltip="Revocar acceso"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
