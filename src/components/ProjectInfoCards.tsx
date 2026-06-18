/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../store';
import { useUI } from '../lib/ui';
import { SystemUser } from '../types';
import JSZip from 'jszip';
import {
  Save,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  User,
  Pencil,
  X,
  Crown,
  FileArchive,
  Plus
} from 'lucide-react';

const PRESET_COLORS = [
  '#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#22c55e', '#eab308', '#f97316',
  '#ef4444', '#ec4899', '#d946ef', '#b8860b', '#6b7280', '#374151'
];

function UserColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const customInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const isPreset = PRESET_COLORS.includes(value.toLowerCase());

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-7 h-7 rounded-full border-2 border-border cursor-pointer shrink-0 hover:scale-110 transition-all"
        style={{ backgroundColor: value }}
        title="Cambiar color"
      />
      {open && (
        <div className="absolute z-50 top-9 left-0 bg-card border border-border rounded-xl p-2.5 shadow-xl min-w-[180px]">
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESET_COLORS.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => { onChange(color); setOpen(false); }}
                className={`w-5 h-5 rounded-full border-2 transition-all cursor-pointer shrink-0 hover:scale-110 ${
                  value.toLowerCase() === color ? 'border-foreground ring-2 ring-ring ring-offset-1 ring-offset-background scale-110' : 'border-transparent hover:border-muted-foreground/50'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
            <div className="relative">
              <button
                type="button"
                onClick={() => customInputRef.current?.click()}
                className={`w-5 h-5 rounded-full border-2 border-dashed transition-all cursor-pointer shrink-0 hover:scale-110 flex items-center justify-center ${
                  !isPreset ? 'border-foreground ring-2 ring-ring ring-offset-1 ring-offset-background scale-110' : 'border-muted-foreground/50 hover:border-muted-foreground'
                }`}
                style={!isPreset ? { backgroundColor: value } : undefined}
                title="Color personalizado"
              >
                {isPreset && <Plus className="w-2.5 h-2.5 text-muted-foreground" />}
              </button>
              <input
                ref={customInputRef}
                type="color"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectInfoCards() {
  const {
    projectMeta,
    activeUser,
    users,
    updateProjectMeta,
    updateUser,
    deleteUser,
    adapter
  } = useProjectStore();
  const { toast, confirm } = useUI();

  const isSuperAdmin = activeUser?.isSuperAdmin === true;

  // Project fields
  const [projName, setProjName] = useState(projectMeta?.name || '');
  const [projDesc, setProjDesc] = useState(projectMeta?.description || '');
  const [projDirty, setProjDirty] = useState(false);

  // User editing
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  useEffect(() => {
    setProjName(projectMeta?.name || '');
    setProjDesc(projectMeta?.description || '');
    setProjDirty(false);
  }, [projectMeta]);

  const handleSaveProject = async () => {
    if (!projName.trim()) {
      toast('El nombre del proyecto no puede estar vacío', 'warning');
      return;
    }
    try {
      await updateProjectMeta(projName.trim(), projDesc.trim());
      setProjDirty(false);
      toast('Datos del proyecto actualizados', 'success');
    } catch (e: any) {
      toast('Error al guardar: ' + e.message, 'error');
    }
  };

  const handleStartEditUser = (user: SystemUser) => {
    setEditingUserId(user.id);
    setEditName(user.name);
    setEditColor(user.avatarColor);
  };

  const handleSaveUserName = async (userId: string) => {
    if (!editName.trim()) return;
    try {
      await updateUser(userId, { name: editName.trim(), avatarColor: editColor });
      setEditingUserId(null);
      toast('Usuario actualizado', 'success');
    } catch (e: any) {
      toast('Error: ' + e.message, 'error');
    }
  };

  const handleToggleSuperAdmin = async (user: SystemUser) => {
    const newValue = !user.isSuperAdmin;
    if (newValue) {
      const ok = await confirm({
        title: 'Otorgar control total',
        message: `¿Estás seguro de que deseas hacer a "${user.name}" superadministrador? Tendrá control total del proyecto: podrá editar datos del proyecto, administrar usuarios y eliminar cuentas.`,
        confirmLabel: 'Sí, otorgar',
        variant: 'danger'
      });
      if (!ok) return;
    } else {
      if (user.id === activeUser?.id) {
        toast('No puedes quitarte el rol de superadmin a ti mismo', 'warning');
        return;
      }
      const ok = await confirm({
        title: 'Revocar permisos',
        message: `¿Quitar el rol de superadministrador a "${user.name}"?`,
        confirmLabel: 'Revocar',
        variant: 'danger'
      });
      if (!ok) return;
    }
    try {
      await updateUser(user.id, { isSuperAdmin: newValue });
      toast(newValue ? `${user.name} ahora es superadmin` : `Se revocó el rol de superadmin a ${user.name}`, 'success');
    } catch (e: any) {
      toast('Error: ' + e.message, 'error');
    }
  };

  const handleDeleteUser = async (user: SystemUser) => {
    if (user.id === activeUser?.id) {
      toast('No puedes eliminar tu propio usuario', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'Eliminar usuario',
      message: `¿Estás seguro de eliminar a "${user.name}" (@${user.username})? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      variant: 'danger'
    });
    if (!ok) return;
    try {
      await deleteUser(user.id);
      toast(`Usuario "${user.name}" eliminado`, 'success');
    } catch (e: any) {
      toast('Error: ' + e.message, 'error');
    }
  };

  const handleExportZip = async () => {
    try {
      const zip = new JSZip();
      const state = useProjectStore.getState();
      if (!state.adapter) return;
      const fileAdapter = state.adapter;

      // Read project files directly from the file system
      // (always FSA_API mode since Virtual mode was removed)
      zip.file('config.json', JSON.stringify({ projectId: state.projectMeta?.id, projectName: state.projectMeta?.name, lastOpenedBy: state.activeUser?.id, lastModified: Date.now() }, null, 2));
        zip.file('project.json', JSON.stringify(state.projectMeta, null, 2));
        zip.file('users/users.json', JSON.stringify(state.users, null, 2));
        zip.file('activity/logs.json', JSON.stringify(state.logs, null, 2));
        zip.file('activity/locks.json', JSON.stringify({}, null, 2));
        for (const list of state.lists) {
          zip.file(`lists/${list.id}.json`, JSON.stringify(list, null, 2));
        }
        for (const task of state.tasks) {
          zip.file(`tasks/task-${task.id}.json`, JSON.stringify(task, null, 2));
        }
        zip.file('docs/info.json', JSON.stringify(state.docs, null, 2));
        for (const doc of state.docs) {
          try {
            const md = await fileAdapter.readTextFile(`/docs/${doc.filename}`);
            zip.file(`docs/${doc.filename}`, md);
          } catch (e) {}
        }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectMeta?.name?.replace(/[^\w\u00C0-\u024F\s-]/g, '').replace(/\s+/g, '_') || 'Kora_Offline'}_workspace.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast('Respaldo ZIP generado exitosamente', 'success');
    } catch (err: any) {
      toast('No se pudo generar el ZIP: ' + err.message, 'error');
    }
  };

  return (
    <>
      {/* Project Info */}
      <section className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-card">
        <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
          <Pencil className="w-4 h-4 text-bento-blue" />
          Datos del Proyecto
        </h2>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Nombre</label>
            {isSuperAdmin ? (
              <input
                type="text"
                value={projName}
                onChange={e => { setProjName(e.target.value); setProjDirty(true); }}
                className="w-full bg-secondary border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="Nombre del proyecto"
              />
            ) : (
              <p className="text-xs text-foreground bg-secondary rounded-xl px-3 py-2 border border-input">{projName || '—'}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Descripción</label>
            {isSuperAdmin ? (
              <textarea
                value={projDesc}
                onChange={e => { setProjDesc(e.target.value); setProjDirty(true); }}
                rows={3}
                className="w-full bg-secondary border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring resize-none"
                placeholder="Descripción del proyecto"
              />
            ) : (
              <p className="text-xs text-foreground bg-secondary rounded-xl px-3 py-2 border border-input min-h-[60px]">{projDesc || '—'}</p>
            )}
          </div>

          {isSuperAdmin && projDirty && (
            <button
              onClick={handleSaveProject}
              className="bg-primary hover:opacity-90 text-primary-foreground font-bold px-4 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              Guardar cambios
            </button>
          )}
        </div>
      </section>

      {/* Users Management */}
      <section className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-card">
        <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
          <User className="w-4 h-4 text-bento-green" />
          Usuarios del Proyecto
          <span className="text-[10px] text-muted-foreground font-normal ml-1">({users.length})</span>
        </h2>

        <div className="space-y-2">
          {users.map(user => (
            <div
              key={user.id}
              className="flex items-center gap-3 bg-secondary rounded-xl p-3 border border-border"
            >
              {/* Avatar */}
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 uppercase"
                style={{ backgroundColor: user.avatarColor }}
              >
                {user.name.charAt(0)}
              </span>

              {/* Info */}
              <div className="flex-1 min-w-0">
                {editingUserId === user.id && (isSuperAdmin || user.id === activeUser?.id) ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="flex-1 bg-card border border-input rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveUserName(user.id);
                          if (e.key === 'Escape') setEditingUserId(null);
                        }}
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveUserName(user.id)}
                        className="p-1 rounded hover:bg-accent text-bento-green transition-colors"
                        title="Guardar"
                      >
                        <Save className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingUserId(null)}
                        className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors"
                        title="Cancelar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground font-semibold">Color:</span>
                      <UserColorPicker value={editColor} onChange={setEditColor} />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground truncate">{user.name}</span>
                      {user.isSuperAdmin && (
                        <Crown className="w-3 h-3 text-bento-yellow shrink-0" title="Superadmin" />
                      )}
                      {user.id === activeUser?.id && (
                        <span className="text-[9px] bg-bento-blue-light text-bento-blue px-1.5 py-0.5 rounded-full font-bold">Tú</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">@{user.username}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              {editingUserId !== user.id && (isSuperAdmin || user.id === activeUser?.id) && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleStartEditUser(user)}
                    className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {isSuperAdmin && (
                    <>
                      <button
                        onClick={() => handleToggleSuperAdmin(user)}
                        className={`p-1.5 rounded-lg hover:bg-accent transition-colors ${
                          user.isSuperAdmin ? 'text-bento-yellow hover:text-bento-orange' : 'text-muted-foreground hover:text-bento-yellow'
                        }`}
                        title={user.isSuperAdmin ? 'Revocar superadmin' : 'Hacer superadmin'}
                      >
                        {user.isSuperAdmin ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                      </button>
                      {user.id !== activeUser?.id && (
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Eliminar usuario"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Backup */}
      <section className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-card">
        <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
          <FileArchive className="w-4 h-4 text-bento-blue" />
          Respaldo
        </h2>
        <p className="text-xs text-muted-foreground">
          Genera una copia completa del proyecto en formato ZIP. Incluye todas las listas, tareas, documentos y configuración.
        </p>
        <button
          onClick={handleExportZip}
          className="bg-primary hover:opacity-90 text-primary-foreground font-bold px-4 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5"
        >
          <FileArchive className="w-3.5 h-3.5" />
          Respaldar como ZIP
        </button>
      </section>
    </>
  );
}
