/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useProjectStore } from '../store';
import { KeyRound, UserPlus, LogIn, ChevronRight, User, Sparkles } from 'lucide-react';

const AVATAR_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#d946ef', // Fuchsia
  '#ec4899', // Pink
];

export default function AuthScreen() {
  const { users, loginUser, registerUser, projectMeta, logoutUser } = useProjectStore();
  const [isRegister, setIsRegister] = useState(users.length === 0);
  
  // Login form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // Register form states
  const [regUsername, setRegUsername] = useState('');
  const [regName, setRegName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setErrorMsg(null);
    setLoading(true);
    try {
      await loginUser(username, password);
    } catch (err: any) {
      setErrorMsg(err.message || 'Contraseña incorrecta.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername.trim() || !regName.trim() || !regPassword) return;
    setErrorMsg(null);
    setLoading(true);
    try {
      await registerUser(regUsername, regName, regPassword, selectedColor);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al registrar el usuario.');
    } finally {
      setLoading(false);
    }
  };

  // Quick select user to fill credentials for evaluation speed
  const handleQuickSelect = (uName: string) => {
    setUsername(uName);
    setPassword('clickup123'); // Demo preseeded password
  };

  return (
    <div id="auth-screen" className="min-h-screen bg-slate-900 border-slate-800 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-slate-800/80 backdrop-blur-md rounded-2xl p-8 border border-slate-700/80 shadow-2xl">
        
        {/* Project Header context */}
        <div className="text-center mb-6">
          <span className="text-[10px] uppercase font-mono tracking-wider bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full font-bold">
            Carpeta Abierta con éxito 📁
          </span>
          <h2 className="text-xl font-bold mt-2 text-slate-100 truncate pb-1">
            {projectMeta?.name || 'Cargando Proyecto...'}
          </h2>
          <p className="text-xs text-slate-400 mt-1 truncate">
            {projectMeta?.description || 'Gestiona tu proyecto de manera offline.'}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-950/50 border border-red-800/60 rounded-xl text-red-200 text-xs">
            {errorMsg}
          </div>
        )}

        {isRegister ? (
          /* Register Form */
          <form onSubmit={handleRegister} className="space-y-4">
            <h3 className="text-sm font-bold text-slate-200 border-b border-slate-700/60 pb-1.5 flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-violet-400" />
              Crear Nuevo Usuario Local
            </h3>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">Nombre de Usuario (Login)</label>
              <input 
                type="text"
                required
                className="w-full bg-slate-930 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                placeholder="Ej. maria, carlos, jhon"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">Nombre Completo (Mostrado en Tareas)</label>
              <input 
                type="text"
                required
                className="w-full bg-slate-930 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                placeholder="Ej. María López"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">Contraseña secreta</label>
              <input 
                type="password"
                required
                className="w-full bg-slate-930 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                placeholder="Mínimo 4 caracteres"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 block">Color de Perfil / Avatar</label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    className="w-6 h-6 rounded-full border-2 transition-all relative"
                    style={{ 
                      backgroundColor: c, 
                      borderColor: selectedColor === c ? '#ffffff' : 'transparent',
                      transform: selectedColor === c ? 'scale(1.15)' : 'scale(1)' 
                    }}
                  />
                ))}
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-550 text-indigo-50 font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 mt-2"
            >
              Registrarme & Acceder <Sparkles className="w-4 h-4" />
            </button>

            {users.length > 0 && (
              <button 
                type="button"
                onClick={() => setIsRegister(false)}
                className="w-full text-center text-[11px] text-slate-400 hover:text-slate-200 mt-2 hover:underline focus:outline-none"
              >
                ¿Ya tienes usuario local? Volver al inicio de sesión
              </button>
            )}
          </form>
        ) : (
          /* Login Form */
          <form onSubmit={handleLogin} className="space-y-4">
            <h3 className="text-sm font-bold text-slate-200 border-b border-slate-700/60 pb-1.5 flex items-center gap-1.5">
              <LogIn className="w-4 h-4 text-indigo-400" />
              Ingresar al Proyecto
            </h3>

            {/* Quick Demo Preseeds picker for instantaneous click login! */}
            {users.length > 0 && (
              <div className="p-3 bg-slate-930 border border-slate-750 rounded-xl">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide block mb-2">Simular usuarios de la carpeta:</span>
                <div className="space-y-1.5">
                  {users.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleQuickSelect(u.username)}
                      className="w-full flex items-center justify-between text-left p-2 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-indigo-500/50 transition-all group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white uppercase" style={{ backgroundColor: u.avatarColor }}>
                          {u.name.charAt(0)}
                        </span>
                        <div className="leading-tight">
                          <span className="text-slate-200 text-xs font-semibold block">{u.name}</span>
                          <span className="text-slate-400 text-[10px] block font-mono">@{u.username}</span>
                        </div>
                      </div>
                      <span className="text-[10px] bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white px-2 py-0.5 rounded transition-colors font-mono">
                        Seleccionar / Autocompletar
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">Usuario</label>
              <input 
                type="text"
                required
                className="w-full bg-slate-930 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                placeholder="Tu usuario registrado en este proyecto"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">Contraseña</label>
              <input 
                type="password"
                required
                className="w-full bg-slate-930 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                placeholder="Ingresar contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-550 text-indigo-50 font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 mt-2"
            >
              Iniciar Sesión <ChevronRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between mt-3 text-[11px] text-slate-400">
              <button 
                type="button"
                onClick={() => setIsRegister(true)}
                className="hover:text-slate-200 hover:underline focus:outline-none"
              >
                Crear nuevo usuario en esta carpeta
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
