/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useProjectStore } from '../store';
import { KeyRound, UserPlus, LogIn, ChevronRight, User, Sparkles, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { saveSessionForProject } from '../store/sessions';
import ThemeToggle from './ThemeToggle';
import VersionBadge from './VersionBadge';

const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899',
];

export default function AuthScreen() {
  const { users, loginUser, registerUser, projectMeta, closeProject } = useProjectStore();
  const [isRegister, setIsRegister] = useState(users.length === 0);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [regUsername, setRegUsername] = useState('');
  const [regName, setRegName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);

  const [showPassword, setShowPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const SAVED_SESSION_KEY = 'gestor-de-proyectos-saved-session';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setErrorMsg(null);
    setLoading(true);
    try {
      await loginUser(username, password);
      if (rememberMe) {
        const normalizedUsername = username.trim().toLowerCase();
        try {
          localStorage.setItem(SAVED_SESSION_KEY, JSON.stringify({
            username: normalizedUsername,
            savedAt: Date.now()
          }));
        } catch (e) {
          // localStorage may be unavailable
        }
        // Also save per-project session
        const state = useProjectStore.getState();
        if (state.loadedProjectId) {
          saveSessionForProject(state.loadedProjectId, normalizedUsername);
        }
      }
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



  return (
    <div id="auth-screen" className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4 sm:px-6 py-6 pt-14 sm:pt-6 pb-14 sm:pb-6 font-body relative">
      {/* Theme toggle top-right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      
      {/* Back button top-left */}
      <button 
        onClick={closeProject}
        className="absolute top-4 left-4 p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      <div className="max-w-md w-full bg-card backdrop-blur-md rounded-2xl p-5 sm:p-8 border border-border shadow-card-hover animate-scale-in">
        
        {/* Project Header context */}
        <div className="text-center mb-6">
          <span className="text-[10px] uppercase font-mono tracking-wider bg-bento-blue-light text-bento-blue px-3 py-1 rounded-full font-bold">
            Carpeta Abierta con éxito 📁
          </span>
          <h2 className="text-lg sm:text-xl font-bold mt-2 text-foreground truncate pb-1 font-heading">
            {projectMeta?.name || 'Cargando Proyecto...'}
          </h2>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {projectMeta?.description || 'Gestiona tu proyecto de manera offline.'}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs">
            {errorMsg}
          </div>
        )}

        {isRegister ? (
          <form onSubmit={handleRegister} className="space-y-4">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-1.5 flex items-center gap-1.5 font-heading">
              <UserPlus className="w-4 h-4 text-bento-orange" />
              Crear Nuevo Usuario Local
            </h3>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Nombre de Usuario (Login)</label>
              <input 
                type="text"
                required
                className="w-full bg-secondary border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="Ej. maria, carlos, jhon"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Nombre Completo (Mostrado en Tareas)</label>
              <input 
                type="text"
                required
                className="w-full bg-secondary border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="Ej. María López"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Contraseña secreta</label>
              <div className="relative">
                <input 
                  type={showRegPassword ? 'text' : 'password'}
                  required
                  className="w-full bg-secondary border border-input rounded-xl pl-3 pr-10 py-2 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="Mínimo 4 caracteres"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword(!showRegPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  tabIndex={-1}
                  aria-label={showRegPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground block">Color de Perfil / Avatar</label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    className="w-6 h-6 rounded-full border-2 transition-all relative"
                    style={{ 
                      backgroundColor: c, 
                      borderColor: selectedColor === c ? 'hsl(var(--ring))' : 'transparent',
                      transform: selectedColor === c ? 'scale(1.15)' : 'scale(1)' 
                    }}
                  />
                ))}
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:opacity-90 text-primary-foreground font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 mt-2"
            >
              Registrarme & Acceder <Sparkles className="w-4 h-4" />
            </button>

            {users.length > 0 && (
              <button 
                type="button"
                onClick={() => setIsRegister(false)}
                className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground mt-2 hover:underline focus:outline-none"
              >
                ¿Ya tienes usuario local? Volver al inicio de sesión
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-1.5 flex items-center gap-1.5 font-heading">
              <LogIn className="w-4 h-4 text-bento-blue" />
              Ingresar al Proyecto
            </h3>



            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Usuario</label>
              <input 
                type="text"
                required
                className="w-full bg-secondary border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="Tu usuario registrado en este proyecto"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Contraseña</label>
              <div className="relative">
                <input 
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="w-full bg-secondary border border-input rounded-xl pl-3 pr-10 py-2 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="Ingresar contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="app-checkbox w-3.5 h-3.5"
              />
              <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                Mantener sesión iniciada
              </span>
            </label>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:opacity-90 text-primary-foreground font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 mt-2"
            >
              Iniciar Sesión <ChevronRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
              <button 
                type="button"
                onClick={() => setIsRegister(true)}
                className="hover:text-foreground hover:underline focus:outline-none"
              >
                Crear nuevo usuario en esta carpeta
              </button>
            </div>
          </form>
        )}

      </div>
      <VersionBadge />
    </div>
  );
}
