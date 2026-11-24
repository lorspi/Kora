/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, lazy, Suspense } from 'react';
import { useProjectStore } from './store';
import ProjectBrowser from './components/ProjectBrowser';
import ProjectOnboarding from './components/ProjectOnboarding';
import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import ListViews from './components/ListViews';
const DocView = lazy(() => import('./components/DocView'));
import DocumentsBrowser from './components/DocumentsBrowser';
import MediaExplorer from './components/MediaExplorer';
import TrashView from './components/TrashView';
import ProjectInfoCards from './components/ProjectInfoCards';
import AboutKora from './components/AboutKora';
import AccessibilitySection from './components/AccessibilitySection';
import TaskDrawer from './components/TaskDrawer';
import SearchDialog from './components/SearchDialog';
import InviteJoinScreen from './components/InviteJoinScreen';
import { useHashRouter, isInviteHash, clearRouteHash } from './lib/router';
import { decodeInvite, CLOUD_ACCESS_LOST_EVENT } from './lib/cloudflare';
import { useUI } from './lib/ui';
import {
  CheckCircle as CheckCircle2,
  Stack as Layers,
  FileText,
  HardDrive,
  Cloud,
  List as Menu
} from '@phosphor-icons/react';
import ThemeToggle from './components/ThemeToggle';

/** Mobile top bar – visible only below lg breakpoint */
function MobileHeader() {
  const { projectMeta, setSidebarOpen, setSearchOpen } = useProjectStore();
  return (
    <header className="lg:hidden flex items-center justify-between px-3 py-2 border-b border-border bg-card shrink-0">
      <div className="flex items-center gap-2 overflow-hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 -ml-1 rounded-lg hover:bg-accent text-foreground transition-colors"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>
        <img src="/icon.svg" alt="Kora" className="w-6 h-6 shrink-0" />
        <span className="text-sm font-bold text-foreground truncate font-heading">
          {projectMeta?.name || 'Kora'}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <button
          onClick={() => setSearchOpen(true)}
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Buscar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </button>
      </div>
    </header>
  );
}

export default function App() {
  const { 
    adapter, 
    activeUser, 
    projectMeta, 
    lists, 
    tasks, 
    docs, 
    selectedListId, 
    selectedDocId, 
    showMediaExplorer,
    showAbout,
    showTrash,
    showDocs,
    backgroundReload,
    initialize,
    isLoading,
    isOnboarding,
    closeProject,
    pendingInvite,
    setPendingInvite
  } = useProjectStore();

  // Every view has an address in the URL (#/listas/..., ?tarea=...) while a project is open.
  const workspaceReady = !!adapter && !!activeUser && !isOnboarding && !isLoading;
  useHashRouter(workspaceReady);

  // Leaving a project (back to the project browser) drops its address.
  const hadAdapter = useRef(false);
  useEffect(() => {
    if (adapter) hadAdapter.current = true;
    else if (hadAdapter.current) {
      hadAdapter.current = false;
      clearRouteHash();
    }
  }, [adapter]);

  // The team's Cloudflare backend stopped accepting our access (invitation revoked).
  const { toast } = useUI();
  useEffect(() => {
    const onAccessLost = () => {
      toast('Ya no tienes acceso a este proyecto en la nube: la invitación fue revocada. Pide un enlace nuevo a quien administra el backend.', 'error');
      useProjectStore.getState().goToProjectBrowser();
    };
    window.addEventListener(CLOUD_ACCESS_LOST_EVENT, onAccessLost);
    return () => window.removeEventListener(CLOUD_ACCESS_LOST_EVENT, onAccessLost);
  }, []);

  // Invitation links (#/unirse?i=...): read the invitation, then take it out of the
  // URL right away so the access token doesn't stay in the address bar or history.
  useEffect(() => {
    const readInvite = () => {
      if (!isInviteHash(window.location.hash)) return;
      const invite = decodeInvite(window.location.hash);
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      if (invite) setPendingInvite(invite);
    };
    readInvite();
    window.addEventListener('hashchange', readInvite);
    return () => window.removeEventListener('hashchange', readInvite);
  }, []);

  // Update browser tab title with project name
  useEffect(() => {
    document.title = projectMeta?.name ? `${projectMeta.name} — Kora` : 'Kora';
  }, [projectMeta?.name]);

  // Initialize the app on load
  useEffect(() => {
    // Check for reset parameter
    const params = new URLSearchParams(window.location.search);
    if (params.has('reset')) {
      closeProject();
      // Remove the reset parameter from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      initialize();
    }
  }, []);

  // Sync loop.
  //  - Local folder mode: poll every 7s while the tab is visible (folder changes
  //    aren't observable otherwise).
  //  - Cloud modes: subscribe to realtime changes. Cloudflare says which files
  //    changed, so only those parts are re-read. A slow safety poll runs only while
  //    the realtime connection isn't confirmed up (every request counts against
  //    the team's free quota).
  useEffect(() => {
    if (!adapter) return;
    const isHidden = () => typeof document !== 'undefined' && document.hidden;

    const maybeSubscribe = (adapter as any).subscribe;
    if (typeof maybeSubscribe === 'function') {
      // Group the notices of a burst of writes (e.g. a task and its log) into one reload.
      let pendingPaths: Set<string> | null = null;
      let pendingAll = false;
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        flushTimer = null;
        const paths = pendingAll ? undefined : Array.from(pendingPaths ?? []);
        pendingPaths = null;
        pendingAll = false;
        backgroundReload(paths);
      };
      const unsubscribe = maybeSubscribe.call(adapter, (paths?: string[]) => {
        if (!Array.isArray(paths)) pendingAll = true;
        else {
          pendingPaths = pendingPaths ?? new Set();
          paths.forEach((p) => pendingPaths!.add(p));
        }
        if (!flushTimer) flushTimer = setTimeout(flush, 500);
      });

      const SAFETY_POLL = 5 * 60_000;
      const realtimeUp = () =>
        typeof (adapter as any).isRealtimeConnected === 'function' && (adapter as any).isRealtimeConnected();
      let lastPoll = Date.now();
      const safetyPoll = () => {
        if (isHidden() || realtimeUp()) return;
        lastPoll = Date.now();
        backgroundReload();
      };
      const slowInterval = setInterval(safetyPoll, SAFETY_POLL);
      const onVisible = () => {
        if (!isHidden() && Date.now() - lastPoll > SAFETY_POLL) safetyPoll();
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
        if (flushTimer) clearTimeout(flushTimer);
        clearInterval(slowInterval);
        document.removeEventListener('visibilitychange', onVisible);
      };
    }

    // Local folder mode: background reload every 7 seconds while visible, and on return.
    const interval = setInterval(() => {
      if (!isHidden()) backgroundReload();
    }, 7000);
    const onVisible = () => {
      if (!isHidden()) backgroundReload();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [adapter]);

  const invite = pendingInvite ? <InviteJoinScreen /> : null;

  // Initial loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-foreground">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="font-mono text-muted-foreground">Cargando...</p>
        </div>
        {invite}
      </div>
    );
  }

  // Stage 1: Show Project Browser (multi-project selection)
  if (!adapter) {
    return <><ProjectBrowser />{invite}</>;
  }

  // Stage 2: Onboarding for new project
  if (isOnboarding) {
    return <><ProjectOnboarding />{invite}</>;
  }

  // Stage 3: Register/Authenticate Local User inside selected folder
  if (!activeUser) {
    return <><AuthScreen />{invite}</>;
  }

  const cloudMode = adapter.getMode();
  const isCloud = cloudMode === 'FIREBASE' || cloudMode === 'CLOUDFLARE';

  // Metrics calculators
  const totalTasks = tasks.length;
  let completedTasksCount = 0;
  tasks.forEach(t => {
    const listObj = lists.find(l => l.id === t.listId);
    const statusObj = listObj?.statuses.find(s => s.id === t.statusId);
    if (statusObj?.isCompleted) {
      completedTasksCount++;
    }
  });

  const completionPercent = totalTasks > 0 ? Math.round((completedTasksCount / totalTasks) * 100) : 0;

  // Stage 3: Full Workspace Dashboard Layout
  return (
    <div id="full-dashboard" className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden font-body">
      
      {/* Mobile Top Header Bar - visible only on mobile */}
      <MobileHeader />

      <div className="flex-1 flex flex-row overflow-hidden min-h-0">
        {/* Sidebar Navigation */}
        <Sidebar />

        {/* Main Work Area Container */}
        <main id="main-content-flow" className="flex-1 flex flex-col h-full bg-background overflow-hidden min-w-0 min-h-0">
          <div className="flex-1 flex flex-col overflow-hidden">
            {showAbout ? (
              <AboutKora />
            ) : showTrash ? (
              <TrashView />
            ) : showMediaExplorer ? (
              <MediaExplorer />
            ) : showDocs ? (
              <DocumentsBrowser />
            ) : selectedDocId ? (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
                <DocView />
              </Suspense>
            ) : selectedListId ? (
              <ListViews />
            ) : (
            /* Default Project Overview Welcome Screen dashboard */
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-background">
              <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 text-left animate-fade-in">
                
                {/* Profile welcome */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
                  <div className="min-w-0">
                    <h1 className="text-xl sm:text-2xl font-black text-foreground flex items-center gap-2 font-heading">
                      ¡Hola de nuevo, {activeUser.name.split(' ')[0]}! 👋
                    </h1>
                    <p className="text-muted-foreground text-xs mt-1.5 leading-normal">
                      {isCloud
                        ? `Tu proyecto está conectado a ${cloudMode === 'CLOUDFLARE' ? 'tu backend de Cloudflare' : 'Firebase'} y se sincroniza en tiempo real con tu equipo.`
                        : 'Has cargado exitosamente la carpeta local de tu proyecto. Tu base de conocimientos está lista y 100% desconectada.'}
                    </p>
                  </div>

                  <div className="text-xs font-mono bg-card border border-border p-3 rounded-xl shadow-card">
                    {isCloud ? (
                      <>
                        <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                          <Cloud className="w-4 h-4 text-bento-orange" />
                          <span>Base de Datos:</span>
                        </div>
                        <strong className="text-bento-orange font-semibold uppercase font-mono text-[11px]">
                          {cloudMode === 'CLOUDFLARE' ? 'Nube · Cloudflare' : 'Nube · Firebase'}
                        </strong>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                          <HardDrive className="w-4 h-4 text-bento-blue" />
                          <span>Base de Datos:</span>
                        </div>
                        <strong className="text-bento-blue font-semibold uppercase font-mono text-[11px]">
                          Carpeta local
                        </strong>
                      </>
                    )}
                  </div>
                </div>

                {/* Stats Bento Grid Panel */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  
                  {/* Stats A: List Count */}
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-card flex items-center justify-between gap-3 transition-all duration-300 hover:shadow-card-hover">
                    <div className="space-y-1.5">
                      <span className="text-[10px] bg-secondary font-bold uppercase text-muted-foreground px-2 py-0.5 rounded tracking-wide">
                        Flujos listados
                      </span>
                      <h3 className="text-2xl font-bold text-foreground font-mono">{lists.length}</h3>
                    </div>
                    <Layers className="w-8 h-8 text-bento-blue" />
                  </div>

                  {/* Stats B: Real-time task completeness */}
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-card flex items-center justify-between gap-3 transition-all duration-300 hover:shadow-card-hover">
                    <div className="space-y-1.5">
                      <span className="text-[10px] bg-secondary font-bold uppercase text-muted-foreground px-2 py-0.5 rounded tracking-wide">
                        Completitud de Tareas
                      </span>
                      <h3 className="text-2xl font-bold text-foreground font-mono">
                        {completedTasksCount}/{totalTasks}
                        <span className="text-xs text-muted-foreground ml-1.5 font-body">({completionPercent}%)</span>
                      </h3>
                    </div>
                    <CheckCircle2 className="w-8 h-8 text-bento-green" />
                  </div>

                  {/* Stats C: Document index count */}
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-card flex items-center justify-between gap-3 transition-all duration-300 hover:shadow-card-hover">
                    <div className="space-y-1.5">
                      <span className="text-[10px] bg-secondary font-bold uppercase text-muted-foreground px-2 py-0.5 rounded tracking-wide">
                        Documentos (.md)
                      </span>
                      <h3 className="text-2xl font-bold text-foreground font-mono">{docs.length}</h3>
                    </div>
                    <FileText className="w-8 h-8 text-bento-orange" />
                  </div>

                </div>

                {/* Project Settings Cards */}
                <ProjectInfoCards />

                {/* Accessibility Section */}
                <AccessibilitySection />

              </div>
            </div>
          )}
        </div>
      </main>

        {/* Task detail: a column to the right of the open view (full screen on mobile) */}
        <TaskDrawer />
      </div>

      {/* Global Command palette search dialog */}
      <SearchDialog />

      {invite}

    </div>
  );
}
