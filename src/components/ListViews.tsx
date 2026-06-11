/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useProjectStore } from '../store';
import { Task, TaskStatus, TaskList } from '../types';
import { 
  Check, 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Calendar, 
  AlertCircle, 
  Maximize2, 
  FolderLock, 
  Edit,
  ArrowUp,
  ArrowDown,
  CircleDot,
  CheckCircle2,
  Table,
  Kanban,
  List as ListIcon,
  Settings as SettingsIcon,
  User,
  PlusCircle,
  Clock
} from 'lucide-react';

type ActiveViewTab = 'list' | 'kanban' | 'table' | 'settings';

export default function ListViews() {
  const { 
    lists, 
    tasks, 
    selectedListId, 
    users, 
    createTask, 
    updateTask, 
    deleteTask, 
    updateListConfig, 
    deleteList, 
    setSelectedTask,
    locks
  } = useProjectStore();

  const [activeTab, setActiveTab] = useState<ActiveViewTab>('list');
  
  // Quick Task Title box values
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPriority, setQuickPriority] = useState<Task['priority']>('medium');

  // Collapsed state map for List View status blocks
  const [collapsedStatuses, setCollapsedStatuses] = useState<Record<string, boolean>>({});

  // Active list item model
  const activeList = lists.find(l => l.id === selectedListId);

  if (!activeList) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-930 text-slate-400 font-sans">
        <CircleDot className="w-12 h-12 text-slate-600 mb-3 animate-pulse" />
        <h2 className="text-sm font-semibold">Selecciona o crea una lista en la barra lateral para comenzar.</h2>
        <p className="text-xs text-slate-500 mt-1">Todas las tareas se almacenan en tiempo real en formato JSON.</p>
      </div>
    );
  }

  // Filter tasks belonging strictly to this list
  const listTasks = tasks.filter(t => t.listId === activeList.id);

  // Quick createTask triggers
  const handleQuickTaskAdd = async (statusId: string, customTitle?: string) => {
    const titleVal = customTitle || quickTitle;
    if (!titleVal.trim()) return;
    
    try {
      await createTask(titleVal, activeList.id, statusId, quickPriority);
      if (!customTitle) setQuickTitle('');
    } catch (e) {
      alert('Error al crear tarea');
    }
  };

  const toggleStatusCollapse = (statusId: string) => {
    setCollapsedStatuses(prev => ({
      ...prev,
      [statusId]: !prev[statusId]
    }));
  };

  const getPriorityBadgeColor = (p: Task['priority']) => {
    switch (p) {
      case 'low': return 'bg-slate-800 text-slate-400 font-medium border-slate-700/60';
      case 'medium': return 'bg-blue-950/40 text-blue-400 border-blue-900/50';
      case 'high': return 'bg-orange-950/40 text-orange-400 border-orange-900/50';
      case 'urgent': return 'bg-red-950/50 text-red-400 border-red-900/40 animate-pulse';
    }
  };

  const getPriorityLabel = (p: Task['priority']) => {
    switch (p) {
      case 'low': return 'Baja';
      case 'medium': return 'Media';
      case 'high': return 'Alta';
      case 'urgent': return 'Urgente';
    }
  };

  return (
    <div id="list-views-container" className="flex-1 flex flex-col h-full bg-slate-50 font-sans overflow-hidden">
      
      {/* Workspace Ribbon Title & View Tabs Selector */}
      <div className="bg-white px-6 pt-5 pb-0 border-b border-slate-200 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: activeList.color }}></div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              {activeList.name}
            </h1>
            <span className="text-xs bg-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded-full border border-slate-200">
              {listTasks.length} {listTasks.length === 1 ? 'tarea' : 'tareas'}
            </span>
          </div>

          {/* Quick task fields adding box for easy additions */}
          {activeTab !== 'settings' && (
            <div className="flex gap-2 items-center">
              <input
                id="quick-task-input"
                type="text"
                placeholder="Rápido: Nombrar tarea..."
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 w-48 sm:w-60 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleQuickTaskAdd(activeList.statuses[0].id);
                  }
                }}
              />
              <select
                className="bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-xs text-slate-700 font-sans focus:outline-none"
                value={quickPriority}
                onChange={(e) => setQuickPriority(e.target.value as Task['priority'])}
              >
                <option value="low">Prioridad Baja</option>
                <option value="medium">Prioridad Media</option>
                <option value="high">Prioridad Alta</option>
                <option value="urgent">Prioridad Urgente</option>
              </select>
              <button 
                onClick={() => handleQuickTaskAdd(activeList.statuses[0].id)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-colors flex items-center gap-1 shrink-0 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>
          )}
        </div>

        {/* List views select toggles */}
        <div className="flex gap-6 text-xs font-semibold text-slate-400">
          <button 
            id="tab-view-list"
            onClick={() => setActiveTab('list')}
            className={`pb-3 flex items-center gap-1.5 cursor-pointer transition-colors border-b-2 ${
              activeTab === 'list' ? 'border-indigo-500 text-indigo-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-850'
            }`}
          >
            <ListIcon className="w-3.5 h-3.5" />
            Lista
          </button>
          <button 
            id="tab-view-kanban"
            onClick={() => setActiveTab('kanban')}
            className={`pb-3 flex items-center gap-1.5 cursor-pointer transition-colors border-b-2 ${
              activeTab === 'kanban' ? 'border-indigo-500 text-indigo-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-850'
            }`}
          >
            <Kanban className="w-3.5 h-3.5" />
            Kanban
          </button>
          <button 
            id="tab-view-table"
            onClick={() => setActiveTab('table')}
            className={`pb-3 flex items-center gap-1.5 cursor-pointer transition-colors border-b-2 ${
              activeTab === 'table' ? 'border-indigo-500 text-indigo-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-850'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            Tabla
          </button>
          <button 
            id="tab-view-settings"
            onClick={() => setActiveTab('settings')}
            className={`pb-3 flex items-center gap-1.5 cursor-pointer transition-colors border-b-2 ${
              activeTab === 'settings' ? 'border-indigo-500 text-indigo-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-850'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            Estados & Config
          </button>
        </div>
      </div>

      {/* Screen Render based on chosen view tab */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'list' && (
          <div className="space-y-6">
            {activeList.statuses.map(status => {
              const statusTasks = listTasks.filter(t => t.statusId === status.id);
              const isCollapsed = collapsedStatuses[status.id];

              return (
                <div key={status.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  {/* Status Group Banner Bar */}
                  <div 
                    onClick={() => toggleStatusCollapse(status.id)}
                    className="flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100/80 border-b border-slate-200 cursor-pointer transition-colors select-none"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }}></span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        {status.name}
                        <span className="text-[10px] bg-slate-200 text-slate-600 font-mono px-2 py-0.5 rounded-full">
                          {statusTasks.length}
                        </span>
                      </h3>
                    </div>
                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>

                  {/* Tasks rows inside Status */}
                  {!isCollapsed && (
                    <div className="divide-y divide-slate-150 bg-white">
                      {statusTasks.map(task => {
                        const isLocked = locks[task.id] && Date.now() < locks[task.id].expiresAt;
                        const completeCount = task.subtasks.filter(s => s.isCompleted).length;
                        const totalCount = task.subtasks.length;
                        const pendingBlocked = task.dependencies.length > 0;

                        return (
                          <div 
                            key={task.id}
                            className="p-3.5 hover:bg-slate-50/70 flex items-center justify-between gap-4 transition-colors group"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {/* Simple mark complete click */}
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Switch to opposite completed or noncompleted status
                                  const alternateSt = activeList.statuses.find(s => s.isCompleted !== status.isCompleted);
                                  if (alternateSt) {
                                    updateTask({ ...task, statusId: alternateSt.id });
                                  }
                                }}
                                className={`w-5 h-5 rounded-full border transition-all flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 ${
                                  status.isCompleted 
                                    ? 'bg-emerald-50 border-emerald-400 text-emerald-600' 
                                    : 'border-slate-300 hover:border-slate-400 text-transparent hover:text-slate-450'
                                  }`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>

                              {/* Task details trigger click */}
                              <div 
                                onClick={() => setSelectedTask(task.id)}
                                className="cursor-pointer min-w-0 flex-1"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-mono text-[10px] font-bold text-slate-400 shrink-0">{task.taskCode}</span>
                                  {pendingBlocked && (
                                    <span className="text-[9px] bg-red-50 text-red-655 font-mono font-bold px-1.5 py-0.2 ml-1 rounded uppercase tracking-wider flex items-center gap-0.5 border border-red-150">
                                      <AlertCircle className="w-2.5 h-2.5" /> Bloqueada
                                    </span>
                                  )}
                                  {isLocked && (
                                    <span className="text-[9px] bg-amber-50 text-amber-700 font-mono px-1.5 py-0.2 rounded flex items-center gap-0.5 border border-amber-150">
                                      <FolderLock className="w-2.5 h-2.5" /> En Edición: @{locks[task.id].username}
                                    </span>
                                  )}
                                </div>
                                <h4 className={`text-xs font-semibold text-slate-700 group-hover:text-indigo-600 truncate ${
                                  status.isCompleted ? 'line-through text-slate-400 group-hover:text-slate-405' : ''
                                }`}>
                                  {task.title}
                                </h4>
                              </div>
                            </div>

                            {/* Info Badges & Assignees */}
                            <div className="flex items-center gap-3 shrink-0">
                              
                              {/* Subtasks summary tag */}
                              {totalCount > 0 && (
                                <span className="text-[10px] bg-slate-50 text-slate-500 font-semibold px-2 py-0.5 rounded-full border border-slate-200 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-indigo-500" />
                                  {completeCount}/{totalCount}
                                </span>
                              )}

                              {/* Due Date Indicator */}
                              {task.dueDate && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 font-semibold border ${
                                  new Date(task.dueDate) < new Date() && !status.isCompleted
                                    ? 'bg-red-50 text-red-600 border-red-200'
                                    : 'bg-slate-50 text-slate-500 border-slate-200'
                                }`}>
                                  <Calendar className="w-3 h-3 text-slate-400" />
                                  {task.dueDate}
                                </span>
                              )}

                              {/* Target Priority Badges */}
                              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${getPriorityBadgeColor(task.priority)}`}>
                                {getPriorityLabel(task.priority)}
                              </span>

                              {/* Assignees avatars list */}
                              <div className="flex -space-x-1.5 overflow-hidden">
                                {task.assignees.map(userId => {
                                  const userObj = users.find(u => u.id === userId);
                                  return userObj ? (
                                    <span 
                                      key={userId}
                                      className="w-5 h-5 rounded-full border border-white flex items-center justify-center text-[8px] font-bold text-white uppercase shrink-0"
                                      style={{ backgroundColor: userObj.avatarColor }}
                                      title={userObj.name}
                                    >
                                      {userObj.name.charAt(0)}
                                    </span>
                                  ) : null;
                                })}
                              </div>

                              {/* Details trigger button */}
                              <button 
                                onClick={() => setSelectedTask(task.id)}
                                className="p-1 text-slate-400 hover:text-indigo-650 hover:bg-slate-100 rounded transition-colors hidden group-hover:block"
                                title="Abrir ficha"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {statusTasks.length === 0 && (
                        <div className="p-3 text-slate-450 text-xs italic text-center">No hay tareas en este estado. Puedes agregar una escribiendo arriba.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'kanban' && (
          <div className="flex gap-4 overflow-x-auto pb-4 items-start h-full" style={{ minHeight: '400px' }}>
            {activeList.statuses.map(status => {
              const statusTasks = listTasks.filter(t => t.statusId === status.id);

              return (
                <div 
                  key={status.id} 
                  className="w-72 bg-white border border-slate-200 rounded-xl p-3 shrink-0 flex flex-col max-h-[85vh] shadow-sm"
                >
                  {/* Status Kanban Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-150 mb-3 shrink-0">
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: status.color }}></span>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide truncate">{status.name}</h4>
                      <span className="text-[10px] bg-slate-100 text-slate-500 font-mono px-1.5 py-0.2 rounded border border-slate-200">{statusTasks.length}</span>
                    </div>
                  </div>

                  {/* Tasks List */}
                  <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1 min-h-[150px]">
                    {statusTasks.map(task => {
                      const isLocked = locks[task.id] && Date.now() < locks[task.id].expiresAt;
                      
                      return (
                        <div 
                          key={task.id}
                          onClick={() => setSelectedTask(task.id)}
                          className="bg-white hover:bg-slate-50/40 p-3 rounded-lg border border-slate-200 hover:border-indigo-200 transition-all cursor-pointer group shadow-sm flex flex-col gap-2.5"
                        >
                          <div className="flex items-center justify-between gap-2.5">
                            <span className="text-[9px] font-mono text-slate-450 font-bold">{task.taskCode}</span>
                            <span className={`text-[8px] font-bold uppercase px-1.5 py-0.2 rounded border ${getPriorityBadgeColor(task.priority)}`}>
                              {getPriorityLabel(task.priority)}
                            </span>
                          </div>

                          <h5 className={`text-xs font-semibold text-slate-700 group-hover:text-indigo-600 leading-snug break-words ${
                            status.isCompleted ? 'line-through text-slate-400' : ''
                          }`}>
                            {task.title}
                          </h5>

                          {/* Lock icon */}
                          {isLocked && (
                            <span className="text-[8px] text-amber-700 bg-amber-50 p-1 rounded font-semibold inline-flex items-center gap-1 border border-amber-150">
                              <FolderLock className="w-2.5 h-2.5" /> En edición: @{locks[task.id].username}
                            </span>
                          )}

                          {/* Footer Info inside card */}
                          {(task.dueDate || task.assignees.length > 0 || task.subtasks.length > 0) && (
                            <div className="flex items-center justify-between border-t border-slate-150 pt-2 shrink-0">
                              
                              {/* Subs tag */}
                              {task.subtasks.length > 0 ? (
                                <span className="text-[9px] text-slate-500 font-mono">
                                  ✓ {task.subtasks.filter(s => s.isCompleted).length}/{task.subtasks.length}
                                </span>
                              ) : <span />}

                              <div className="flex items-center gap-1.5">
                                {task.dueDate && (
                                  <span className="text-[9px] text-slate-400 font-semibold flex items-center gap-0.5">
                                    <Clock className="w-2.5 h-2.5" /> {task.dueDate.replace(/^\d{4}-/, '')}
                                  </span>
                                )}
                                <div className="flex -space-x-1 overflow-hidden">
                                  {task.assignees.map(userId => {
                                    const u = users.find(x => x.id === userId);
                                    return u ? (
                                      <span 
                                        key={userId}
                                        className="w-4 h-4 rounded-full border border-white flex items-center justify-center text-[7px] font-bold text-white uppercase shrink-0"
                                        style={{ backgroundColor: u.avatarColor }}
                                      >
                                        {u.name.charAt(0)}
                                      </span>
                                    ) : null;
                                  })}
                                </div>
                              </div>

                            </div>
                          )}

                          {/* Rapid status swap selector inside Kanban for convenience */}
                          <div className="border-t border-slate-150 pt-2 shrink-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[8px] text-slate-400 mr-1.5">Mover a:</span>
                            {activeList.statuses.filter(s => s.id !== status.id).map(s => (
                              <button
                                key={s.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateTask({ ...task, statusId: s.id });
                                }}
                                className="w-3 h-3 rounded-full hover:scale-115 active:scale-95 transition-transform"
                                style={{ backgroundColor: s.color }}
                                title={`Mover a ${s.name}`}
                              />
                            ))}
                          </div>

                        </div>
                      );
                    })}
                  </div>

                  {/* Inline quick creator */}
                  <button 
                    onClick={() => {
                      const name = prompt('Nombre de la tarea:');
                      if (name && name.trim()) {
                        handleQuickTaskAdd(status.id, name);
                      }
                    }}
                    className="w-full py-1.5 bg-slate-50 hover:bg-slate-100/90 text-slate-500 hover:text-indigo-650 border border-slate-200 hover:border-slate-300 text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer font-bold leading-none shadow-sm"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-slate-400" />
                    Crear tarea
                  </button>

                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'table' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-550 font-bold">
                    <th className="p-3 font-mono font-bold w-16 text-center">Código</th>
                    <th className="p-3">Título de la Tarea</th>
                    <th className="p-3 w-36">Estado</th>
                    <th className="p-3 w-28">Vencimiento</th>
                    <th className="p-3 w-28">Prioridad</th>
                    <th className="p-3 w-24">Asignados</th>
                    <th className="p-3 w-16 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 bg-white">
                  {listTasks.map(task => {
                    const isLocked = locks[task.id] && Date.now() < locks[task.id].expiresAt;

                    return (
                      <tr key={task.id} className="hover:bg-slate-50/65 transition-colors">
                        <td className="p-3 font-mono text-[10px] font-bold text-slate-405 text-center">{task.taskCode}</td>
                        <td className="p-3">
                          <button
                            onClick={() => setSelectedTask(task.id)}
                            className="font-semibold text-slate-700 hover:text-indigo-650 text-left truncate hover:underline block cursor-pointer"
                          >
                            {task.title}
                          </button>
                          {isLocked && (
                            <span className="text-[8px] bg-amber-50 text-amber-700 rounded px-1.5 py-0.5 mt-0.5 inline-block border border-amber-150">
                              🔒 @{locks[task.id].username} editando
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <select
                            className="bg-white border border-slate-200 rounded px-2 py-0.5 text-[11px] text-slate-700 font-sans focus:outline-none"
                            value={task.statusId}
                            onChange={(e) => updateTask({ ...task, statusId: e.target.value })}
                          >
                            {activeList.statuses.map(s => (
                              <option key={s.id} value={s.id}>{s.name.replace(/[^\w\s/]/g, '')}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3">
                          <input 
                            type="date"
                            className="bg-white border border-slate-200 text-slate-700 rounded px-2 py-0.5 text-[10px] focus:outline-none"
                            value={task.dueDate || ''}
                            onChange={(e) => updateTask({ ...task, dueDate: e.target.value })}
                          />
                        </td>
                        <td className="p-3">
                          <select
                            className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[10px] text-slate-700 focus:outline-none uppercase font-bold tracking-wider"
                            value={task.priority}
                            onChange={(e) => updateTask({ ...task, priority: e.target.value as Task['priority'] })}
                          >
                            <option value="low">Baja</option>
                            <option value="medium">Media</option>
                            <option value="high">Alta</option>
                            <option value="urgent">Urgente</option>
                          </select>
                        </td>
                        <td className="p-3">
                          {/* Assignees visual bubbles stack */}
                          <div className="flex -space-x-1.5 overflow-hidden">
                            {task.assignees.map(userId => {
                              const u = users.find(x => x.id === userId);
                              return u ? (
                                <span 
                                  key={userId}
                                  className="w-5 h-5 rounded-full border border-white flex items-center justify-center text-[8px] font-bold text-white uppercase shrink-0"
                                  style={{ backgroundColor: u.avatarColor }}
                                  title={u.name}
                                >
                                  {u.name.charAt(0)}
                                </span>
                              ) : null;
                            })}
                            {task.assignees.length === 0 && (
                              <span className="text-[10px] text-slate-450 italic">Libre</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <button 
                            onClick={() => {
                              if (confirm('¿Eliminar esta tarea de forma permanente del almacenamiento físico?')) {
                                deleteTask(task.id);
                              }
                            }}
                            className="text-slate-400 hover:text-red-650 p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Eliminar tarea"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {listTasks.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center p-8 text-slate-450 italic">
                        No hay tareas en esta lista. Comienza agregando una arriba.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-800 mb-1">Configuración del Flujo de Trabajo</h2>
              <p className="text-xs text-slate-550">Modifica, agrega, reordena o cambia el color o significado de los estados de esta lista.</p>
            </div>

            {/* List Statuses Builder */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-600 block">Estados Globales de la Lista:</span>
              <div className="space-y-2">
                {activeList.statuses.map((st, index) => (
                  <div key={st.id} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                    
                    {/* Status Meta config entry */}
                    <div className="flex items-center gap-2 flex-1">
                      <input 
                        type="color" 
                        className="w-6 h-6 border-0 rounded bg-transparent cursor-pointer shrink-0"
                        value={st.color}
                        onChange={(e) => {
                          const updated = activeList.statuses.map(item => 
                            item.id === st.id ? { ...item, color: e.target.value } : item
                          );
                          updateListConfig(activeList.id, activeList.name, activeList.color, updated);
                        }}
                      />
                      <input 
                        type="text"
                        className="bg-white border border-slate-200 text-xs text-slate-800 rounded px-2 py-1 flex-1 focus:outline-none focus:border-indigo-500"
                        value={st.name}
                        onChange={(e) => {
                          const updated = activeList.statuses.map(item => 
                            item.id === st.id ? { ...item, name: e.target.value } : item
                          );
                          updateListConfig(activeList.id, activeList.name, activeList.color, updated);
                        }}
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      
                      {/* Flag isCompleted checkbox */}
                      <label className="flex items-center gap-1 cursor-pointer select-none border border-slate-200 hover:border-slate-300 px-2 py-1 rounded text-[10px] text-slate-600 hover:text-slate-850 hover:bg-slate-100 bg-white shadow-sm">
                        <input 
                          type="checkbox"
                          className="rounded border-slate-300 mr-0.5 accent-indigo-600"
                          checked={st.isCompleted}
                          onChange={(e) => {
                            const updated = activeList.statuses.map(item => 
                              item.id === st.id ? { ...item, isCompleted: e.target.checked } : item
                            );
                            updateListConfig(activeList.id, activeList.name, activeList.color, updated);
                          }}
                        />
                        Completado
                      </label>

                      {/* Move Up/Down buttons */}
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => {
                          const updated = [...activeList.statuses];
                          // swap elements index & index - 1
                          const temp = updated[index];
                          updated[index] = updated[index - 1];
                          updated[index - 1] = temp;
                          updateListConfig(activeList.id, activeList.name, activeList.color, updated);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded disabled:opacity-35 disabled:pointer-events-none"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={index === activeList.statuses.length - 1}
                        onClick={() => {
                          const updated = [...activeList.statuses];
                          // swap elements index & index + 1
                          const temp = updated[index];
                          updated[index] = updated[index + 1];
                          updated[index + 1] = temp;
                          updateListConfig(activeList.id, activeList.name, activeList.color, updated);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded disabled:opacity-35 disabled:pointer-events-none"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      {/* Remove status column if we have at least 2 */}
                      <button
                        type="button"
                        disabled={activeList.statuses.length <= 2}
                        onClick={() => {
                          if (confirm('¿Eliminar estado? Las tareas que estuvieran en este estado se reasignarán al primer estado.')) {
                            const updated = activeList.statuses.filter(item => item.id !== st.id);
                            // Reassign existing list tasks
                            listTasks.forEach(t => {
                               if (t.statusId === st.id) {
                                 updateTask({ ...t, statusId: updated[0].id });
                               }
                            });
                            updateListConfig(activeList.id, activeList.name, activeList.color, updated);
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-red-655 hover:bg-slate-100 rounded disabled:opacity-35 disabled:pointer-events-none"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                    </div>

                  </div>
                ))}
              </div>

              {/* Add direct new Status column */}
              <button
                type="button"
                onClick={() => {
                  const sName = prompt('Nombre del nuevo estado:');
                  if (sName && sName.trim()) {
                    const newSt: TaskStatus = {
                      id: crypto.randomUUID().slice(0, 8),
                      name: sName.trim(),
                      color: '#' + Math.floor(Math.random()*16777215).toString(16),
                      isCompleted: false
                    };
                    const updated = [...activeList.statuses, newSt];
                    updateListConfig(activeList.id, activeList.name, activeList.color, updated);
                  }
                }}
                className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer py-1 block mt-1"
              >
                <PlusCircle className="w-3.5 h-3.5" /> Agregar Estado de Tarea
              </button>
            </div>

            {/* List Deletion utilities */}
            <div className="border-t border-slate-200 pt-6 space-y-3">
              <div>
                <h4 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-1">Zona Peligrosa</h4>
                <p className="text-[11px] text-slate-500">Eliminar completamente esta Lista de Tareas y todos sus archivos asociados. Esta acción no se puede deshacer de forma local.</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (confirm(`¿ELIMINAR DEFINITIVAMENTE la lista "${activeList.name}" con todas sus tareas?`)) {
                    deleteList(activeList.id);
                  }
                }}
                className="px-4 py-2 bg-red-50 text-red-650 border border-red-200 hover:bg-red-100 rounded-xl text-xs font-bold hover:border-red-300 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" /> Eliminar Lista de Tareas
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
