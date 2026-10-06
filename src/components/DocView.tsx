/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Document view. The editing surface is the TipTap-based editor
 * (components/editor/TipTapDocEditor); this component owns everything around it:
 * loading/saving the on-disk Markdown, unsaved-change tracking, collaborative
 * locking, the navigation guard, attachments, the header (title + filename rename)
 * and the raw-Markdown "code mode".
 *
 * The on-disk contract is unchanged: documents are raw Markdown strings. The editor
 * round-trips to the exact same dialect (see lib/tiptapMarkdown), so the read-only
 * MarkdownPreview elsewhere and the unsaved-changes diff keep working.
 *
 * In cloud (Firebase) projects the doc is edited collaboratively in real time
 * (lib/collab): instead of one editor holding the lock, everyone edits at once and
 * sees the others' cursors. The file stays the saved copy: whoever edits saves it
 * shortly after, and the others save too if it is still behind the shared state.
 * If collaboration is unavailable (or someone on an older version holds the doc),
 * the lock-based flow applies as in local projects.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useUI } from '../lib/ui';
import { useProjectStore, DOC_LOCK_TTL, isDocLockAlive } from '../store';
import {
  FloppyDisk as Save,
  Trash as Trash2,
  Check,
  Paperclip,
  CaretDown as ChevronDown,
  Image as ImageIcon,
  FilmStrip as Film,
  FolderOpen,
  DotsThreeVertical as MoreVertical,
  FileCode,
  ShieldWarning as ShieldAlert,
  CloudCheck,
  CaretRight,
  FolderSimple,
} from '@phosphor-icons/react';
import TipTapDocEditor from './editor/TipTapDocEditor';
import type { TipTapDocEditorHandle, EditorCollab } from './editor/TipTapDocEditor';
import { normalizeMarkdown } from '../lib/tiptapMarkdown';
import type { FirebaseAdapter } from '../lib/firebase';
import type { CollabSession, CollabPeer } from '../lib/collab';

type CollabModule = typeof import('../lib/collab');

/** Per-device preference; autosave is on unless the user turned it off. */
const AUTOSAVE_KEY = 'kora-doc-autosave';
/** Quiet period after the last edit before an autosave runs. */
const AUTOSAVE_DELAY = 1500;
/** Lock renewal interval; must stay well under DOC_LOCK_TTL. */
const LOCK_HEARTBEAT = 15000;
/**
 * Collaborative docs: when the pending change is someone else's, give its author
 * time to save it before saving it ourselves (randomized so the others don't all
 * save at once).
 */
const REMOTE_SAVE_DELAY = 6000;
const REMOTE_SAVE_JITTER = 4000;
/** Longest a change waits for a pause in the typing before it is saved anyway. */
const MAX_SAVE_WAIT = 10000;

function loadAutoSavePref(): boolean {
  try {
    return localStorage.getItem(AUTOSAVE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function formatSavedAgo(savedAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - savedAt) / 1000));
  if (seconds < 45) return 'Guardado hace unos segundos';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Guardado hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Guardado hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `Guardado hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

export default function DocView() {
  const {
    docs,
    selectedDocId,
    getDocContent,
    saveDocContent,
    deleteDoc,
    uploadAttachment,
    resolveAttachmentUrl,
    renameDocFile,
    adapter,
    activeUser,
    docLocks,
    lockDoc,
    unlockDoc,
    setDocHasUnsavedChanges,
    pendingNavigationAction,
    confirmPendingNavigation,
    cancelPendingNavigation,
    setShowDocs,
  } = useProjectStore();
  const { toast, confirm } = useUI();

  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [lockingUser, setLockingUser] = useState<string | null>(null);
  // This editor session's lock id, and until when (our clock) our claim is live.
  const sessionRef = useRef('');
  const claimUntilRef = useRef(0);
  const acquireLockRef = useRef<(() => Promise<void>) | null>(null);

  const docMeta = docs.find((d) => d.id === selectedDocId);

  // ── Realtime collaboration (cloud projects) ──────────────────────────────────────
  const isCloud = adapter?.getMode() === 'FIREBASE';
  // Which session the doc was opened with; null session = lock-based editing.
  const [collabInfo, setCollabInfo] = useState<{ docId: string; session: CollabSession | null } | null>(null);
  const collab = collabInfo?.docId === selectedDocId ? collabInfo.session : null;
  // How to lock the open doc; null while it is still unknown whether it's collaborative.
  const lockMode: 'collab' | 'plain' | null = !isCloud
    ? 'plain'
    : collabInfo?.docId === selectedDocId ? (collabInfo.session ? 'collab' : 'plain') : null;
  const [collabGen, setCollabGen] = useState(0);
  const [savedHash, setSavedHash] = useState<string | null>(null);
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const collabModRef = useRef<CollabModule | null>(null);
  // Hash of the file as loaded, and of the editor's serialization of it.
  const fileHashesRef = useRef<{ file: string; canonical: string } | null>(null);
  const lastChangeRemoteRef = useRef(false);
  const dirtySinceRef = useRef<number | null>(null);

  const [title, setTitle] = useState('');
  const [currentMarkdown, setCurrentMarkdown] = useState('');
  const [initialMarkdown, setInitialMarkdown] = useState('');
  const [originalMarkdown, setOriginalMarkdown] = useState('');
  // The editor's own serialization of originalMarkdown. The Markdown round-trip is
  // not always byte-identical, so content equal to either one counts as unchanged.
  const [baselineMarkdown, setBaselineMarkdown] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [autoSave, setAutoSave] = useState(loadAutoSavePref);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const savingRef = useRef(false);
  const takeBaselineRef = useRef(false);
  const [loading, setLoading] = useState(false); // save-in-progress (button spinner)
  const [initialLoading, setInitialLoading] = useState(false); // first document load
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
  const [editingFilename, setEditingFilename] = useState(false);
  const [filenameValue, setFilenameValue] = useState('');

  // Attachment + doc menus and code mode
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<{ name: string; path: string; type: 'image' | 'video' }[]>([]);
  const [mediaThumbs, setMediaThumbs] = useState<Record<string, string>>({});
  const [showDocMenu, setShowDocMenu] = useState(false);
  const [codeMode, setCodeMode] = useState(false);
  const docMenuRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<TipTapDocEditorHandle>(null);

  // ── Load document ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedDocId) return;
    const docId = selectedDocId;
    let cancelled = false;
    let session: CollabSession | null = null;
    setInitialLoading(true);
    setCollabInfo(null);
    (async () => {
      const normalized = normalizeMarkdown(await getDocContent(docId));
      const st = useProjectStore.getState();
      if (st.adapter?.getMode() === 'FIREBASE' && st.activeUser) {
        try {
          // Someone on an older Kora holds the doc with a plain lock: stay with locks.
          const lock = await st.readDocLock(docId);
          const plainHolder = !!lock && !lock.collab && lock.userId !== st.activeUser.id && isDocLockAlive(docId, lock);
          if (!plainHolder) {
            const mod = await import('../lib/collab');
            collabModRef.current = mod;
            session = await mod.openCollabSession(st.adapter as FirebaseAdapter, docId, normalized, {
              id: st.activeUser.id,
              name: st.activeUser.name,
              color: st.activeUser.avatarColor || '#64748b',
            });
            if (session) {
              fileHashesRef.current = {
                file: mod.hashMarkdown(normalized),
                canonical: mod.hashMarkdown(mod.canonicalMarkdown(normalized)),
              };
            }
          }
        } catch (err) {
          console.warn('Collaborative editing unavailable, using locks', err);
          session = null;
        }
      }
      if (cancelled) {
        session?.destroy();
        return;
      }
      const meta = useProjectStore.getState().docs.find((d) => d.id === docId);
      const docTitle = meta?.title || 'Sin Título';
      takeBaselineRef.current = true;
      setInitialMarkdown(normalized);
      setCurrentMarkdown(normalized);
      setOriginalMarkdown(normalized);
      setBaselineMarkdown(normalized);
      setTitle(docTitle);
      setOriginalTitle(docTitle);
      setLastSavedAt(meta?.editedAt ?? meta?.createdAt ?? null);
      setHasChanges(false);
      setCodeMode(false);
      lastChangeRemoteRef.current = false;
      setSavedHash(session?.savedHash ?? null);
      setCollabInfo({ docId, session });
      setInitialLoading(false);
    })();
    return () => {
      cancelled = true;
      session?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocId, docMeta?.id, collabGen]);

  // Follow who else is in the doc and what the file holds; reopen if re-seeded.
  useEffect(() => {
    if (!collab) {
      setPeers([]);
      return;
    }
    const sync = () => {
      setPeers(collab.getPeers());
      setSavedHash(collab.savedHash);
    };
    sync();
    const unsubscribe = collab.subscribe(sync);
    const unsubscribeReset = collab.onReset(() => setCollabGen((g) => g + 1));
    return () => {
      unsubscribe();
      unsubscribeReset();
    };
  }, [collab]);

  const editorCollab = useMemo<EditorCollab | null>(
    () => (collab && collabModRef.current
      ? { extensions: collab.editorExtensions(), isRemote: collabModRef.current.isRemoteTransaction }
      : null),
    [collab]
  );

  const handleEditorChange = useCallback((markdown: string, remote: boolean) => {
    lastChangeRemoteRef.current = remote;
    setCurrentMarkdown(markdown);
  }, []);

  // Someone else renamed the doc while we hadn't touched the title: follow it.
  useEffect(() => {
    if (!collab || !docMeta) return;
    if (title.trim() === originalTitle.trim() && docMeta.title !== originalTitle.trim()) {
      setTitle(docMeta.title);
      setOriginalTitle(docMeta.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collab, docMeta?.title]);

  // The editor reports its serialization on mount: on a fresh load that becomes the
  // baseline; after leaving code mode it is simply the current content.
  const handleEditorReady = useCallback((markdown: string) => {
    if (takeBaselineRef.current) {
      takeBaselineRef.current = false;
      setBaselineMarkdown(markdown);
    }
    setCurrentMarkdown(markdown);
  }, []);

  // Re-read the doc from disk (used while someone else holds the lock, so we show
  // their saved edits, and when the lock passes to us).
  const reloadFromDisk = useCallback(async () => {
    if (!selectedDocId) return;
    const text = normalizeMarkdown(await getDocContent(selectedDocId));
    const meta = useProjectStore.getState().docs.find((d) => d.id === selectedDocId);
    const docTitle = meta?.title || 'Sin Título';
    const canonical = !codeMode && editorRef.current ? editorRef.current.setMarkdown(text) : text;
    setInitialMarkdown(text);
    setOriginalMarkdown(text);
    setBaselineMarkdown(canonical);
    setCurrentMarkdown(canonical);
    setTitle(docTitle);
    setOriginalTitle(docTitle);
    setLastSavedAt(meta?.editedAt ?? null);
  }, [selectedDocId, codeMode, getDocContent]);

  // ── Acquire lock + heartbeat ─────────────────────────────────────────────────────
  // Whoever opened the doc first keeps it. If another session overwrites our live
  // lock without having seen it (a stale read), our claim reclaims it and the late
  // arrival drops to read-only. See lockDoc in the store.
  useEffect(() => {
    if (!selectedDocId || !activeUser || !lockMode) return;
    const shared = lockMode === 'collab';
    const session = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionRef.current = session;
    claimUntilRef.current = 0;
    let inFlight = false;
    let closed = false;
    let pending: Promise<void> = Promise.resolve();
    const acquireLock = async () => {
      if (inFlight || closed) return;
      inFlight = true;
      pending = (async () => {
        try {
          // Our own clock only: we've held it continuously if the last renewal is within the TTL.
          const claimLive = claimUntilRef.current > Date.now();
          const ok = await lockDoc(selectedDocId, session, claimLive, shared);
          if (!closed) claimUntilRef.current = ok ? Date.now() + DOC_LOCK_TTL : 0;
        } finally {
          inFlight = false;
        }
      })();
      await pending;
    };
    // Release after any in-flight renewal lands, or that write would re-create the lock.
    const release = () => { pending.finally(() => unlockDoc(selectedDocId)); };
    acquireLockRef.current = acquireLock;
    acquireLock();
    const heartbeat = setInterval(acquireLock, LOCK_HEARTBEAT);
    // Background tabs throttle timers; renew as soon as the tab is visible again.
    const onVisible = () => { if (document.visibilityState === 'visible') acquireLock(); };
    // Best effort: release on tab close/reload so others don't wait out the TTL.
    const onPageHide = () => { release(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onPageHide);
      closed = true;
      acquireLockRef.current = null;
      claimUntilRef.current = 0;
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocId, activeUser?.id, lockMode]);

  // ── Locked-by-other status ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedDocId || !activeUser) return;
    const activeLock = docLocks[selectedDocId];
    // Collaborative sessions don't exclude each other.
    const heldByOther = !!activeLock && activeLock.userId !== activeUser.id && !(collab && activeLock.collab)
      && isDocLockAlive(selectedDocId, activeLock);
    const ourClaimWins = heldByOther && claimUntilRef.current > Date.now() && activeLock.replaces !== sessionRef.current;
    if (heldByOther && !ourClaimWins) {
      setIsLockedByOther(true);
      setLockingUser(activeLock.username);
    } else {
      setIsLockedByOther(false);
      setLockingUser(null);
    }
    if (ourClaimWins) acquireLockRef.current?.();
  }, [selectedDocId, activeUser?.id, docLocks, collab]);

  // While read-only, follow the editor's saves; when the lock passes to us, start
  // from the latest saved version rather than what we loaded earlier.
  const prevLockedRef = useRef(false);
  const prevEditedAtRef = useRef(docMeta?.editedAt);
  const prevDocIdRef = useRef(selectedDocId);
  useEffect(() => {
    const wasLocked = prevLockedRef.current;
    const editedChanged = prevEditedAtRef.current !== docMeta?.editedAt;
    const docChanged = prevDocIdRef.current !== selectedDocId;
    prevLockedRef.current = isLockedByOther;
    prevEditedAtRef.current = docMeta?.editedAt;
    prevDocIdRef.current = selectedDocId;
    // A different doc is loaded by the load effect above; a collaborative one is
    // kept current by the session.
    if (docChanged || initialLoading || collab) return;
    if ((wasLocked && !isLockedByOther) || (isLockedByOther && editedChanged)) reloadFromDisk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocId, isLockedByOther, docMeta?.editedAt]);

  // ── Track changes and sync to store for navigation interception ───────────────────
  // Nothing counts as a change while someone else holds the doc: we can't save it.
  // A collaborative doc has changes while the file is behind the shared content.
  useEffect(() => {
    let markdownChanged: boolean;
    const mod = collabModRef.current;
    if (collab && mod) {
      const hash = mod.hashMarkdown(currentMarkdown);
      const file = fileHashesRef.current;
      markdownChanged = hash !== savedHash && !(file && savedHash === file.file && hash === file.canonical);
    } else {
      markdownChanged = currentMarkdown !== originalMarkdown && currentMarkdown !== baselineMarkdown;
    }
    const titleChanged = title.trim() !== originalTitle.trim();
    const changed = !isLockedByOther && !initialLoading && (markdownChanged || titleChanged);
    if (!changed) dirtySinceRef.current = null;
    else if (dirtySinceRef.current === null) dirtySinceRef.current = Date.now();
    setHasChanges(changed);
    setDocHasUnsavedChanges(changed);
  }, [currentMarkdown, originalMarkdown, baselineMarkdown, title, originalTitle, isLockedByOther, initialLoading, setDocHasUnsavedChanges, collab, savedHash]);

  useEffect(() => () => setDocHasUnsavedChanges(false), [setDocHasUnsavedChanges]);

  // ── Save ─────────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!selectedDocId || isLockedByOther || savingRef.current) return false;
    savingRef.current = true;
    setLoading(true);
    try {
      // In block mode read from the editor; in code mode currentMarkdown is source of truth.
      // A collaborative doc's code mode is a read-only view: the editor's content counts.
      const markdown = codeMode && !collab ? currentMarkdown : (editorRef.current?.getMarkdown() ?? currentMarkdown);
      const savedTitle = title;
      await saveDocContent(selectedDocId, savedTitle, markdown);
      if (collab) {
        await collab.markSaved(markdown);
        setSavedHash(collab.savedHash);
      }
      // Only move the baselines: edits typed while the save was in flight stay pending.
      setOriginalMarkdown(markdown);
      setBaselineMarkdown(markdown);
      setOriginalTitle(savedTitle.trim());
      // Keep the editor's mount baseline in sync so a later remount doesn't
      // revert to pre-save content.
      setInitialMarkdown(markdown);
      setLastSavedAt(Date.now());
      return true;
    } catch {
      toast('Error al guardar documento', 'error');
      return false;
    } finally {
      savingRef.current = false;
      setLoading(false);
    }
  }, [selectedDocId, isLockedByOther, codeMode, collab, currentMarkdown, title, saveDocContent, toast]);

  // ── Autosave ─────────────────────────────────────────────────────────────────────
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  // Collaborative docs always autosave: the others' edits must reach the file too.
  const effectiveAutoSave = autoSave || !!collab;
  useEffect(() => {
    if (!effectiveAutoSave || !hasChanges || isLockedByOther || loading || (collab && codeMode)) return;
    let delay = collab && lastChangeRemoteRef.current
      ? REMOTE_SAVE_DELAY + Math.random() * REMOTE_SAVE_JITTER
      : AUTOSAVE_DELAY;
    // Nonstop typing (ours or others') would otherwise postpone the save forever.
    if (dirtySinceRef.current !== null) delay = Math.min(delay, Math.max(0, dirtySinceRef.current + MAX_SAVE_WAIT - Date.now()));
    const timer = setTimeout(() => handleSaveRef.current(), delay);
    return () => clearTimeout(timer);
  }, [effectiveAutoSave, collab, codeMode, hasChanges, isLockedByOther, loading, currentMarkdown, title]);

  const toggleAutoSave = () => {
    const next = !autoSave;
    setAutoSave(next);
    try { localStorage.setItem(AUTOSAVE_KEY, String(next)); } catch { /* storage unavailable */ }
    setShowDocMenu(false);
  };

  // Keep the "Guardado hace…" label fresh.
  useEffect(() => {
    if (!effectiveAutoSave) return;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [effectiveAutoSave]);

  // ── Navigation guard (unsaved changes) ─────────────────────────────────────────────
  const isHandlingRef = useRef(false);
  useEffect(() => {
    if (!pendingNavigationAction || isHandlingRef.current) return;
    isHandlingRef.current = true;

    const handlePendingNavigation = async () => {
      // No prompt when there's nothing of ours to lose.
      if (!hasChanges || isLockedByOther) {
        confirmPendingNavigation();
        isHandlingRef.current = false;
        return;
      }
      // With autosave, save and leave; only fall back to asking if saving failed.
      if (effectiveAutoSave && (await handleSave())) {
        confirmPendingNavigation();
        isHandlingRef.current = false;
        return;
      }

      const result = await confirm({
        title: 'Cambios sin guardar',
        message: 'Tienes cambios sin guardar en este documento. ¿Quieres guardarlos antes de salir?',
        confirmLabel: 'Guardar',
        cancelLabel: 'Cancelar',
        neutralLabel: 'Salir sin guardar',
      });

      if (result === true) {
        const saved = await handleSave();
        if (saved) confirmPendingNavigation();
        else cancelPendingNavigation();
      } else if (result === 'neutral') {
        confirmPendingNavigation();
      } else {
        cancelPendingNavigation();
      }
      isHandlingRef.current = false;
    };

    handlePendingNavigation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNavigationAction]);

  // ── Resolve attachment URLs referenced in the document ────────────────────────────
  useEffect(() => {
    if (!currentMarkdown) return;
    const regex = /(?:attachments\/images\/[a-zA-Z0-9_\-\.]+|attachments\/videos\/[a-zA-Z0-9_\-\.]+)/g;
    const matches = currentMarkdown.match(regex) || [];
    const uniqueMatches = Array.from(new Set(matches));
    uniqueMatches.forEach(async (filePath: string) => {
      if (resolvedUrls[filePath]) return;
      const resolved = await resolveAttachmentUrl('/' + filePath);
      if (resolved) setResolvedUrls((prev) => ({ ...prev, [filePath]: resolved }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMarkdown]);

  // ── Ctrl/Cmd+S to save (undo/redo handled internally by TipTap) ───────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges) handleSave();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [hasChanges, handleSave]);

  // ── Attachment handling ───────────────────────────────────────────────────────────
  const insertAttachment = useCallback((relativePath: string, name: string, isVideo: boolean) => {
    if (codeMode) {
      // Append markdown source directly in code mode.
      const snippet = isVideo ? `<video src="${relativePath}" controls></video>` : `![${name}](${relativePath})`;
      setCurrentMarkdown((prev) => (prev ? prev + '\n' + snippet : snippet));
      return;
    }
    if (isVideo) editorRef.current?.insertVideo(relativePath);
    else editorRef.current?.insertImage(relativePath, name);
  }, [codeMode]);

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { path } = await uploadAttachment(file);
      const relativePath = path.startsWith('/') ? path.substring(1) : path;
      insertAttachment(relativePath, file.name, file.type.startsWith('video/'));
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
      setMediaFiles([
        ...images.map((name) => ({ name, path: `/attachments/images/${name}`, type: 'image' as const })),
        ...videos.map((name) => ({ name, path: `/attachments/videos/${name}`, type: 'video' as const })),
      ]);
      setShowMediaPicker(true);
    } catch {
      setMediaFiles([]);
      setShowMediaPicker(true);
    }
  };

  const handleInsertFromLibrary = (file: { name: string; path: string; type: 'image' | 'video' }) => {
    const relativePath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
    insertAttachment(relativePath, file.name, file.type === 'video');
    setShowMediaPicker(false);
  };

  // Close attach menu on outside click
  useEffect(() => {
    if (!showAttachMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) setShowAttachMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAttachMenu]);

  // Close doc menu on outside click
  useEffect(() => {
    if (!showDocMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (docMenuRef.current && !docMenuRef.current.contains(e.target as Node)) setShowDocMenu(false);
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
      Object.values(mediaThumbs).forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMediaPicker, mediaFiles]);

  // ── Toggle code mode: sync markdown between the two views ──────────────────────────
  const toggleCodeMode = () => {
    if (!codeMode) {
      // Entering code mode: pull latest markdown from the editor.
      const md = editorRef.current?.getMarkdown() ?? currentMarkdown;
      setCurrentMarkdown(md);
      setCodeMode(true);
    } else {
      // Leaving code mode: push edited markdown back into the editor.
      editorRef.current?.setMarkdown(currentMarkdown);
      setInitialMarkdown(currentMarkdown);
      setCodeMode(false);
    }
    setShowDocMenu(false);
  };

  if (!docMeta) return null;

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
          {/* Where the doc lives: back to the documents view or its folder */}
          <div className="flex items-center gap-1 px-2 mb-0.5 text-[11px] font-semibold text-muted-foreground min-w-0">
            <button
              onClick={() => setShowDocs(true, null)}
              className="hover:text-foreground transition-colors cursor-pointer shrink-0"
              data-tooltip="Volver a Documentos"
            >
              Documentos
            </button>
            {docMeta.folder && (
              <>
                <CaretRight className="w-3 h-3 shrink-0" weight="bold" />
                <button
                  onClick={() => setShowDocs(true, docMeta.folder)}
                  className="flex items-center gap-1 min-w-0 hover:text-foreground transition-colors cursor-pointer"
                  data-tooltip="Abrir la carpeta"
                >
                  <FolderSimple className="w-3.5 h-3.5 shrink-0 text-bento-yellow" weight="fill" />
                  <span className="truncate">{docMeta.folder}</span>
                </button>
              </>
            )}
          </div>
          <input
            type="text"
            disabled={isLockedByOther}
            className="w-full bg-transparent border-0 text-base sm:text-lg font-bold text-foreground hover:bg-accent focus:bg-card px-2 py-1 rounded-xl focus:outline-none transition-colors focus:ring-1 focus:ring-ring font-heading disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="text-[10px] text-muted-foreground font-mono px-2 mt-0.5 flex items-center gap-1 truncate">
            <span>Formato: Markdown legible. Archivo:</span>
            {editingFilename ? (
              <form
                className="inline-flex items-center gap-1"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (filenameValue.trim() && selectedDocId) await renameDocFile(selectedDocId, filenameValue);
                  setEditingFilename(false);
                }}
              >
                <span className="text-muted-foreground">/docs/{docMeta.folder ? `${docMeta.folder}/` : ''}</span>
                <input
                  type="text"
                  autoFocus
                  className="bg-card border border-input rounded px-1 py-0 text-[10px] font-mono text-foreground focus:outline-none focus:border-ring w-32"
                  value={filenameValue}
                  onChange={(e) => setFilenameValue(e.target.value)}
                  onBlur={async () => {
                    if (filenameValue.trim() && selectedDocId) await renameDocFile(selectedDocId, filenameValue);
                    setEditingFilename(false);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Escape') setEditingFilename(false); }}
                />
              </form>
            ) : (
              <button
                onClick={() => {
                  if (!isLockedByOther) {
                    setFilenameValue(docMeta.filename);
                    setEditingFilename(true);
                  }
                }}
                className="text-foreground font-semibold truncate hover:underline hover:text-bento-blue transition-colors cursor-pointer"
                data-tooltip="Clic para renombrar archivo"
              >
                /docs/{docMeta.folder ? `${docMeta.folder}/` : ''}{docMeta.filename}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Attachment button */}
          <div className="relative" ref={attachMenuRef}>
            <button
              onClick={() => !isLockedByOther && setShowAttachMenu(!showAttachMenu)}
              disabled={isLockedByOther}
              className="p-2 bg-card border border-border text-muted-foreground hover:text-foreground rounded-xl hover:bg-accent transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              data-tooltip="Adjuntar imagen o video"
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

          {peers.length > 0 && (() => {
            const people = peers.filter((p, i) => peers.findIndex((q) => q.userId === p.userId) === i);
            return (
              <div
                className="flex items-center -space-x-1.5 px-1 select-none"
                data-tooltip={`Editando ahora: ${people.map((p) => p.name).join(', ')}`}
              >
                {people.slice(0, 4).map((p) => (
                  <span
                    key={p.userId}
                    className="w-6 h-6 rounded-full ring-2 ring-card flex items-center justify-center text-[10px] font-bold text-white uppercase"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name.charAt(0)}
                  </span>
                ))}
                {people.length > 4 && (
                  <span className="w-6 h-6 rounded-full ring-2 ring-card bg-secondary flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                    +{people.length - 4}
                  </span>
                )}
              </div>
            );
          })()}

          {effectiveAutoSave ? (
            !isLockedByOther && (
              <div
                className="px-2 py-2 text-[11px] text-muted-foreground flex items-center gap-1.5 select-none whitespace-nowrap"
                data-tooltip={lastSavedAt ? new Date(lastSavedAt).toLocaleString() : undefined}
              >
                {loading || hasChanges ? (
                  <>
                    <div className="w-3 h-3 border-b-2 border-muted-foreground rounded-full animate-spin"></div>
                    Guardando…
                  </>
                ) : (
                  <>
                    <CloudCheck className="w-3.5 h-3.5" />
                    {lastSavedAt ? formatSavedAgo(lastSavedAt, Math.max(now, lastSavedAt)) : 'Guardado'}
                  </>
                )}
              </div>
            )
          ) : (
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
          )}

          <div className="relative" ref={docMenuRef}>
            <button
              onClick={() => setShowDocMenu(!showDocMenu)}
              disabled={isLockedByOther}
              className="p-2 bg-card border border-border text-muted-foreground hover:text-foreground rounded-xl hover:bg-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              data-tooltip="Opciones del documento"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {showDocMenu && (
              <div className="absolute top-full right-0 mt-1 bg-card border border-border rounded-xl shadow-card-hover py-1 z-50 min-w-[180px]">
                <button
                  onClick={toggleCodeMode}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-colors text-left"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  {codeMode ? 'Modo bloques' : 'Modo código'}
                </button>
                <button
                  role="menuitemcheckbox"
                  aria-checked={effectiveAutoSave}
                  onClick={toggleAutoSave}
                  disabled={!!collab}
                  data-tooltip={collab ? 'En la edición en tiempo real los cambios siempre se guardan solos' : undefined}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <CloudCheck className="w-3.5 h-3.5" />
                  <span className="flex-1">Autoguardado</span>
                  <span className={`relative inline-flex w-7 h-4 rounded-full transition-colors ${effectiveAutoSave ? 'bg-primary' : 'bg-secondary border border-border'}`}>
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-card shadow transition-all ${effectiveAutoSave ? 'left-3.5' : 'left-0.5'}`} />
                  </span>
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

      {/* Editor body */}
      {!codeMode ? (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
            {!initialLoading && (
              <TipTapDocEditor
                key={`${selectedDocId}:${collab?.epoch ?? 'local'}:${collabGen}`}
                ref={editorRef}
                initialMarkdown={initialMarkdown}
                collab={editorCollab}
                readOnly={isLockedByOther}
                resolvedUrls={resolvedUrls}
                onChange={handleEditorChange}
                onReady={handleEditorReady}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col">
          {collab && (
            <div className="px-6 py-2 border-b border-border bg-secondary text-[11px] text-muted-foreground shrink-0 select-none">
              En la edición en tiempo real el modo código es de solo lectura. Vuelve al modo bloques para editar.
            </div>
          )}
          <textarea
            disabled={isLockedByOther}
            readOnly={!!collab}
            className="flex-1 w-full bg-card text-foreground p-6 text-xs font-mono focus:outline-none resize-none leading-relaxed disabled:opacity-60"
            style={{ tabSize: 2 }}
            value={currentMarkdown}
            onChange={(e) => setCurrentMarkdown(e.target.value)}
            placeholder="# Escribe en Markdown..."
          />
        </div>
      )}

      {/* Media Library Picker Modal */}
      {showMediaPicker && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-foreground/20 backdrop-blur-[2px] animate-fade-in" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-card-hover w-full max-w-lg mx-4 max-h-[75vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
              <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-bento-blue" />
                Biblioteca de Medios
              </h2>
              <button onClick={() => setShowMediaPicker(false)} className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer">✕</button>
            </div>
            <p className="px-5 pt-3 text-[10px] text-muted-foreground">Haz clic en un archivo para insertarlo en el documento.</p>
            <div className="flex-1 overflow-y-auto p-4">
              {mediaFiles.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No hay archivos en la biblioteca de medios.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {mediaFiles.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => handleInsertFromLibrary(file)}
                      className="group relative flex flex-col items-center rounded-xl border border-border hover:border-bento-blue/50 bg-secondary hover:bg-accent overflow-hidden transition-all cursor-pointer"
                      data-tooltip={file.name}
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
