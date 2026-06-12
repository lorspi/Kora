/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useUI } from '../lib/ui';
import { useProjectStore } from '../store';
import { 
  Image, 
  Video, 
  Trash2, 
  RefreshCw, 
  Link2, 
  Unlink, 
  Eye,
  X,
  Film,
  ImageIcon
} from 'lucide-react';

interface MediaItem {
  path: string;
  name: string;
  type: 'image' | 'video';
  linkedTo: string[]; // list of task codes or doc titles referencing this attachment
  isOrphan: boolean;
}

export default function MediaExplorer() {
  const { adapter, logs, tasks, docs, lists } = useProjectStore();
  const { toast, confirm } = useUI();

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [filter, setFilter] = useState<'all' | 'linked' | 'orphan'>('all');
  const [deleting, setDeleting] = useState<string | null>(null);

  const scanMedia = useCallback(async () => {
    if (!adapter) return;
    setLoading(true);

    try {
      // Get all attachment file paths referenced in activity logs
      const referencedPaths = new Set<string>();
      const pathToReferences = new Map<string, string[]>();

      // Scan activity logs for attachment references
      logs.forEach(log => {
        if (log.comment?.attachments) {
          log.comment.attachments.forEach(attPath => {
            referencedPaths.add(attPath);
            const task = tasks.find(t => t.id === log.taskId);
            const taskList = task ? lists.find(l => l.id === task.listId) : null;
            const label = task ? `${task.taskCode} - ${task.title}` : log.taskId;
            const existing = pathToReferences.get(attPath) || [];
            if (!existing.includes(label)) {
              existing.push(label);
              pathToReferences.set(attPath, existing);
            }
          });
        }
      });

      // List actual files in attachments directories
      const imageFiles = await adapter.listFiles('/attachments/images');
      const videoFiles = await adapter.listFiles('/attachments/videos');

      const items: MediaItem[] = [];

      for (const fileName of imageFiles) {
        const fullPath = `/attachments/images/${fileName}`;
        const refs = pathToReferences.get(fullPath) || [];
        items.push({
          path: fullPath,
          name: fileName,
          type: 'image',
          linkedTo: refs,
          isOrphan: refs.length === 0
        });
      }

      for (const fileName of videoFiles) {
        const fullPath = `/attachments/videos/${fileName}`;
        const refs = pathToReferences.get(fullPath) || [];
        items.push({
          path: fullPath,
          name: fileName,
          type: 'video',
          linkedTo: refs,
          isOrphan: refs.length === 0
        });
      }

      // Sort: orphans first, then by name
      items.sort((a, b) => {
        if (a.isOrphan !== b.isOrphan) return a.isOrphan ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      setMediaItems(items);
    } catch (err) {
      console.error('Error scanning media:', err);
    } finally {
      setLoading(false);
    }
  }, [adapter, logs, tasks, lists]);

  useEffect(() => {
    scanMedia();
  }, [scanMedia]);

  const handlePreview = async (item: MediaItem) => {
    if (!adapter) return;
    try {
      const blob = await adapter.readBinaryFile(item.path);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewItem(item);
    } catch (e) {
      console.warn('Could not preview file:', e);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewItem(null);
  };

  const handleDelete = async (item: MediaItem) => {
    if (!item.isOrphan) return;
    const ok = await confirm({
      title: 'Eliminar archivo',
      message: `¿Eliminar definitivamente "${item.name}"? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      variant: 'danger'
    });
    if (!ok) return;
    
    setDeleting(item.path);
    try {
      await adapter!.deleteFile(item.path);
      setMediaItems(prev => prev.filter(m => m.path !== item.path));
    } catch (e) {
      toast('Error al eliminar el archivo.', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const filteredItems = mediaItems.filter(item => {
    if (filter === 'linked') return !item.isOrphan;
    if (filter === 'orphan') return item.isOrphan;
    return true;
  });

  const totalCount = mediaItems.length;
  const orphanCount = mediaItems.filter(m => m.isOrphan).length;
  const linkedCount = totalCount - orphanCount;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background animate-fade-in">
      
      {/* Header */}
      <div className="p-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground font-heading flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-bento-blue" />
              Explorador de Medios
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Administra los archivos adjuntos de tu workspace. Solo los medios huérfanos se pueden eliminar.
            </p>
          </div>
          <button 
            onClick={scanMedia}
            disabled={loading}
            className="p-2 bg-secondary hover:bg-accent border border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-40"
            title="Reescanear medios"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1">
            <ImageIcon className="w-3 h-3" /> Total: <strong className="text-foreground">{totalCount}</strong>
          </span>
          <span className="flex items-center gap-1">
            <Link2 className="w-3 h-3 text-bento-green" /> Vinculados: <strong className="text-bento-green">{linkedCount}</strong>
          </span>
          <span className="flex items-center gap-1">
            <Unlink className="w-3 h-3 text-bento-orange" /> Huérfanos: <strong className="text-bento-orange">{orphanCount}</strong>
          </span>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mt-4">
          {(['all', 'linked', 'orphan'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
                filter === f 
                  ? 'bg-primary text-primary-foreground border-primary' 
                  : 'bg-secondary text-muted-foreground border-border hover:bg-accent hover:text-foreground'
              }`}
            >
              {f === 'all' ? 'Todos' : f === 'linked' ? 'Vinculados' : 'Huérfanos'}
            </button>
          ))}
        </div>
      </div>

      {/* Media Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-xs font-semibold">
              {filter === 'all' ? 'No hay archivos adjuntos en el workspace.' :
               filter === 'linked' ? 'No hay medios vinculados.' :
               'No hay medios huérfanos.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredItems.map(item => (
              <MediaCard
                key={item.path}
                item={item}
                isDeleting={deleting === item.path}
                onPreview={() => handlePreview(item)}
                onDelete={() => handleDelete(item)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewUrl && previewItem && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center p-8" onClick={closePreview}>
          <div className="relative max-w-3xl max-h-[80vh] bg-card border border-border rounded-2xl overflow-hidden shadow-card-hover" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-border bg-secondary">
              <span className="text-xs font-mono text-muted-foreground truncate max-w-md">{previewItem.name}</span>
              <button onClick={closePreview} className="p-1 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-secondary/50 max-h-[70vh] overflow-auto">
              {previewItem.type === 'video' ? (
                <video src={previewUrl} controls className="max-w-full max-h-[60vh] rounded-lg" />
              ) : (
                <img src={previewUrl} alt={previewItem.name} className="max-w-full max-h-[60vh] rounded-lg object-contain" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Individual media card component
interface MediaCardProps {
  item: MediaItem;
  isDeleting: boolean;
  onPreview: () => void;
  onDelete: () => void;
}

const MediaCard: React.FC<MediaCardProps> = ({ item, isDeleting, onPreview, onDelete }) => {
  const { adapter } = useProjectStore();
  const [thumbUrl, setThumbUrl] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const loadThumb = async () => {
      if (!adapter) return;
      try {
        const blob = await adapter.readBinaryFile(item.path);
        if (!cancelled) {
          setThumbUrl(URL.createObjectURL(blob));
        }
      } catch (e) {
        // file might not exist
      }
    };
    loadThumb();
    return () => { 
      cancelled = true;
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    };
  }, [item.path, adapter]);

  return (
    <div className={`group bg-card border rounded-xl overflow-hidden shadow-card hover:shadow-card-hover transition-all ${
      item.isOrphan ? 'border-bento-orange/40' : 'border-border'
    }`}>
      {/* Thumbnail */}
      <div 
        className="relative w-full h-32 bg-secondary flex items-center justify-center cursor-pointer overflow-hidden"
        onClick={onPreview}
      >
        {thumbUrl ? (
          item.type === 'video' ? (
            <video src={thumbUrl} className="w-full h-full object-cover" muted />
          ) : (
            <img src={thumbUrl} alt={item.name} className="w-full h-full object-cover" />
          )
        ) : (
          <div className="text-muted-foreground opacity-30">
            {item.type === 'video' ? <Film className="w-8 h-8" /> : <ImageIcon className="w-8 h-8" />}
          </div>
        )}
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <Eye className="w-5 h-5 text-white drop-shadow" />
        </div>
        {/* Type badge */}
        <span className={`absolute top-2 left-2 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-md ${
          item.type === 'video' 
            ? 'bg-bento-purple-light text-bento-purple' 
            : 'bg-bento-blue-light text-bento-blue'
        }`}>
          {item.type === 'video' ? '🎬 Video' : '🖼️ Imagen'}
        </span>
        {/* Status badge */}
        <span className={`absolute top-2 right-2 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-md ${
          item.isOrphan 
            ? 'bg-destructive/10 text-destructive' 
            : 'bg-bento-green-light text-bento-green'
        }`}>
          {item.isOrphan ? '⚠️ Huérfano' : '✓ Vinculado'}
        </span>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <p className="text-[10px] font-mono text-foreground truncate font-semibold" title={item.name}>
          {item.name}
        </p>

        {/* Links */}
        {item.linkedTo.length > 0 ? (
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1">
              <Link2 className="w-3 h-3" /> Referenciado en:
            </span>
            <div className="max-h-16 overflow-y-auto space-y-0.5">
              {item.linkedTo.map((ref, i) => (
                <span key={i} className="block text-[9px] text-bento-blue font-mono truncate bg-bento-blue-light/30 px-1.5 py-0.5 rounded">
                  {ref}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[9px] text-muted-foreground italic flex items-center gap-1">
            <Unlink className="w-3 h-3" /> Sin vínculos — se puede eliminar
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-border">
          <button 
            onClick={onPreview}
            className="flex-1 text-[9px] font-semibold text-muted-foreground hover:text-foreground bg-secondary hover:bg-accent border border-border rounded-lg py-1.5 transition-colors cursor-pointer flex items-center justify-center gap-1"
          >
            <Eye className="w-3 h-3" /> Ver
          </button>
          {item.isOrphan && (
            <button 
              onClick={onDelete}
              disabled={isDeleting}
              className="flex-1 text-[9px] font-semibold text-destructive hover:text-white bg-destructive/10 hover:bg-destructive border border-destructive/30 hover:border-destructive rounded-lg py-1.5 transition-colors cursor-pointer flex items-center justify-center gap-1 disabled:opacity-40"
            >
              <Trash2 className="w-3 h-3" /> {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
