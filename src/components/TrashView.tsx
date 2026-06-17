/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useUI } from '../lib/ui';
import { useProjectStore } from '../store';
import { TrashItem } from '../types';
import {
  Trash2,
  RotateCcw,
  Trash as TrashIcon,
  AlertTriangle,
  FileText,
  CheckSquare,
  ImageIcon,
  X,
  Search
} from 'lucide-react';

type TrashFilter = 'all' | 'task' | 'document' | 'media';

const FILTER_OPTIONS: { value: TrashFilter; label: string; icon: React.ElementType }[] = [
  { value: 'all', label: 'Todos', icon: Trash2 },
  { value: 'task', label: 'Tareas', icon: CheckSquare },
  { value: 'document', label: 'Documentos', icon: FileText },
  { value: 'media', label: 'Medios', icon: ImageIcon },
];

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Ahora mismo';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getTypeIcon(type: TrashItem['type']) {
  switch (type) {
    case 'task': return CheckSquare;
    case 'document': return FileText;
    case 'media': return ImageIcon;
  }
}

function getTypeLabel(type: TrashItem['type']) {
  switch (type) {
    case 'task': return 'Tarea';
    case 'document': return 'Documento';
    case 'media': return 'Medio';
  }
}

function getTypeColor(type: TrashItem['type']) {
  switch (type) {
    case 'task': return 'text-bento-blue bg-bento-blue-light border-bento-blue/30';
    case 'document': return 'text-bento-orange bg-bento-orange-light border-bento-orange/30';
    case 'media': return 'text-bento-purple bg-bento-purple-light border-bento-purple/30';
  }
}

export default function TrashView() {
  const {
    trashItems,
    restoreFromTrash,
    permanentDeleteItem,
    emptyTrash,
    setShowTrash
  } = useProjectStore();
  const { toast, confirm } = useUI();

  const [filter, setFilter] = useState<TrashFilter>('all');
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const [isEmptying, setIsEmptying] = useState(false);

  const filteredItems = trashItems.filter(item => {
    if (filter === 'all') return true;
    return item.type === filter;
  });

  const countByType = (type: TrashItem['type']) => trashItems.filter(i => i.type === type).length;
  const totalCount = trashItems.length;

  const handleRestore = async (id: string) => {
    try {
      await restoreFromTrash(id);
      toast('Elemento restaurado correctamente', 'success');
    } catch (e) {
      toast('Error al restaurar el elemento', 'error');
    }
  };

  const handlePermanentDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Eliminar permanentemente',
      message: '¿Eliminar este elemento de forma permanente? Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      variant: 'danger'
    });
    if (!ok) return;
    try {
      await permanentDeleteItem(id);
      toast('Elemento eliminado permanentemente', 'success');
    } catch (e) {
      toast('Error al eliminar el elemento', 'error');
    }
  };

  const handleEmptyTrash = async () => {
    setIsEmptying(true);
    try {
      await emptyTrash();
      setShowEmptyConfirm(false);
      toast('Papelera vaciada correctamente', 'success');
    } catch (e) {
      toast('Error al vaciar la papelera', 'error');
    } finally {
      setIsEmptying(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background animate-fade-in">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-foreground font-heading flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive shrink-0" />
              Papelera de Reciclaje
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Los elementos eliminados se mueven aquí. Puedes restaurarlos o eliminarlos permanentemente.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {totalCount > 0 && (
              <button
                onClick={() => setShowEmptyConfirm(true)}
                className="px-3 py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                Vaciar papelera
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {FILTER_OPTIONS.map(({ value, label, icon: Icon }) => {
            const count = value === 'all' ? totalCount : countByType(value as TrashItem['type']);
            return (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer border flex items-center gap-1.5 ${
                  filter === value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary text-muted-foreground border-border hover:bg-accent hover:text-foreground'
                }`}
              >
                <Icon className="w-3 h-3" />
                {label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6">
        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Trash2 className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm font-semibold">La papelera está vacía</p>
            <p className="text-xs mt-1">Los elementos que elimines aparecerán aquí.</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Search className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm font-semibold">No hay elementos de este tipo</p>
            <p className="text-xs mt-1">Prueba con otro filtro.</p>
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl mx-auto">
            {filteredItems.map(item => {
              const Icon = getTypeIcon(item.type);
              return (
                <div
                  key={item.id}
                  className="bg-card border border-border rounded-xl p-4 shadow-card hover:shadow-card-hover transition-all group"
                >
                  <div className="flex items-start gap-3">
                    {/* Type icon */}
                    <div className={`p-2 rounded-lg border ${getTypeColor(item.type)} shrink-0`}>
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${getTypeColor(item.type)}`}>
                          {getTypeLabel(item.type)}
                        </span>
                        {item.metadata?.taskCode && (
                          <span className="text-[9px] font-mono font-bold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded border border-border">
                            {item.metadata.taskCode}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-semibold text-foreground truncate">
                        {item.label}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <span>Eliminado {formatDate(item.deletedAt)}</span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                        <span>por <strong className="text-foreground font-semibold">{item.deletedByName}</strong></span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleRestore(item.id)}
                        className="p-1.5 rounded-lg hover:bg-accent text-bento-green hover:text-bento-green transition-colors cursor-pointer"
                        title="Restaurar"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(item.id)}
                        className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                        title="Eliminar permanentemente"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Mobile actions - always visible (sm only) */}
                    <div className="flex items-center gap-1 shrink-0 sm:hidden">
                      <button
                        onClick={() => handleRestore(item.id)}
                        className="p-1.5 rounded-lg hover:bg-accent text-bento-green transition-colors cursor-pointer"
                        title="Restaurar"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(item.id)}
                        className="p-1.5 rounded-lg hover:bg-accent text-destructive transition-colors cursor-pointer"
                        title="Eliminar permanentemente"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Empty Trash Confirmation Modal */}
      {showEmptyConfirm && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-foreground/20 backdrop-blur-[2px] animate-fade-in"
          onClick={() => setShowEmptyConfirm(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl shadow-card-hover w-full max-w-md mx-4 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                <h2 className="text-sm font-bold text-foreground font-heading">Vaciar papelera</h2>
              </div>
              <button
                onClick={() => setShowEmptyConfirm(false)}
                className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 pb-4 space-y-3">
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3">
                <p className="text-xs text-destructive font-semibold leading-relaxed">
                  ⚠️ Esta acción eliminará permanentemente todos los {totalCount} elemento(s) de la papelera. Esta operación no se puede deshacer.
                </p>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Antes de continuar, asegúrate de que no necesitas recuperar ninguno de estos elementos.
              </p>
            </div>

            <div className="flex gap-2 px-5 pb-5 justify-end">
              <button
                onClick={() => setShowEmptyConfirm(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-accent border border-border text-foreground transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleEmptyTrash}
                disabled={isEmptying}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-destructive hover:opacity-90 text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isEmptying ? (
                  <>
                    <div className="w-3 h-3 border-b-2 border-white rounded-full animate-spin"></div>
                    Vaciando...
                  </>
                ) : (
                  <>
                    <TrashIcon className="w-3.5 h-3.5" />
                    Vaciar papelera
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
