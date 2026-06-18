/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useProjectStore } from '../store';
import { UserPlus, FileText, Sparkles, ArrowRight, ChevronLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { hashPassword } from '../lib/crypto';
import VersionBadge from './VersionBadge';

const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899',
];

type OnboardingStep = 'user' | 'project' | 'template';

export default function ProjectOnboarding() {
  const { projectMeta, initializeNewProject, closeProject } = useProjectStore();
  
  const [step, setStep] = useState<OnboardingStep>('user');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Step 1: User Registration
  const [regUsername, setRegUsername] = useState('');
  const [regName, setRegName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);

  // Step 2: Project Data
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');

  // Step 3: Template Selection
  const [useSampleData, setUseSampleData] = useState(false);

  const handleUserRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername.trim() || !regName.trim() || !regPassword) return;
    
    setErrorMsg(null);
    setLoading(true);
    
    try {
      // Validate
      if (regPassword.length < 4) {
        throw new Error('La contraseña debe tener al menos 4 caracteres.');
      }

      // Move to next step
      setStep('project');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error en el registro.');
    } finally {
      setLoading(false);
    }
  };

  const handleProjectData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName.trim()) return;

    setErrorMsg(null);
    setLoading(true);

    try {
      // Move to template selection
      setStep('template');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error en la configuración.');
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = async (template: 'blank' | 'sample') => {
    setErrorMsg(null);
    setLoading(true);

    try {
      // Create first user with superadmin flag
      const salt = crypto.randomUUID().slice(0, 8);
      const passwordHash = await hashPassword(regPassword, salt);

      const firstUser = {
        id: crypto.randomUUID(),
        username: regUsername.toLowerCase().trim(),
        name: regName,
        avatarColor: selectedColor,
        passwordHash,
        salt,
        createdAt: Date.now(),
        isSuperAdmin: true,
        docViewModes: {}
      };

      // Initialize project with selected template
      await initializeNewProject(
        projName,
        projDesc,
        firstUser,
        template === 'sample'
      );

      // Project is now initialized and user is logged in
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al inicializar el proyecto.');
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'project') {
      setStep('user');
      setErrorMsg(null);
    } else if (step === 'template') {
      setStep('project');
      setErrorMsg(null);
    }
  };

  return (
    <div id="onboarding-screen" className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4 sm:px-6 py-6 pt-14 sm:pt-6 pb-14 sm:pb-6 font-body relative">
      <div className="max-w-2xl w-full bg-card backdrop-blur-md rounded-2xl p-5 sm:p-8 border border-border shadow-card-hover animate-scale-in">
        
        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${step === 'user' || step === 'project' || step === 'template' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
            1
          </div>
          <div className={`h-1 w-12 ${(step === 'project' || step === 'template') ? 'bg-primary' : 'bg-secondary'}`}></div>
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${step === 'project' || step === 'template' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
            2
          </div>
          <div className={`h-1 w-12 ${step === 'template' ? 'bg-primary' : 'bg-secondary'}`}></div>
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${step === 'template' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
            3
          </div>
        </div>

        {/* Error Message */}
        {errorMsg && (
          <div className="mb-6 p-4 bg-bento-orange-light border border-border rounded-xl flex items-start gap-3 text-bento-orange text-xs leading-relaxed">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>{errorMsg}</div>
          </div>
        )}

        {/* Step 1: User Registration */}
        {step === 'user' && (
          <form onSubmit={handleUserRegister} className="space-y-4 sm:space-y-5 animate-fade-in">
            <div className="text-center mb-6">
              <div className="flex justify-center mb-3">
                <div className="w-12 h-12 rounded-xl bg-bento-orange-light flex items-center justify-center text-bento-orange">
                  <UserPlus className="w-6 h-6" />
                </div>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground font-heading">Crear Primer Usuario</h2>
              <p className="text-xs text-muted-foreground mt-2">Este usuario será el super administrador del proyecto</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Nombre de Usuario (Login)</label>
              <input
                type="text"
                required
                className="w-full bg-secondary border border-input rounded-xl px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                placeholder="Ej. juan, maria, carlos"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Nombre Completo</label>
              <input
                type="text"
                required
                className="w-full bg-secondary border border-input rounded-xl px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                placeholder="Ej. Juan Pérez"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Contraseña</label>
              <input
                type="password"
                required
                className="w-full bg-secondary border border-input rounded-xl px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                placeholder="Mínimo 4 caracteres"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground block">Color de Perfil / Avatar</label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    className="w-6 h-6 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c,
                      borderColor: selectedColor === c ? 'hsl(var(--ring))' : 'transparent',
                      transform: selectedColor === c ? 'scale(1.15)' : 'scale(1)'
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={closeProject}
                className="flex-1 bg-secondary hover:bg-muted text-foreground py-2.5 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-primary hover:opacity-90 text-primary-foreground font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                Siguiente <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Project Details */}
        {step === 'project' && (
          <form onSubmit={handleProjectData} className="space-y-4 sm:space-y-5 animate-fade-in">
            <div className="text-center mb-6">
              <div className="flex justify-center mb-3">
                <div className="w-12 h-12 rounded-xl bg-bento-blue-light flex items-center justify-center text-bento-blue">
                  <FileText className="w-6 h-6" />
                </div>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground font-heading">Datos del Proyecto</h2>
              <p className="text-xs text-muted-foreground mt-2">Define el nombre y descripción de tu proyecto</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Nombre del Proyecto</label>
              <input
                type="text"
                required
                className="w-full bg-secondary border border-input rounded-xl px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                placeholder="Ej. Plan de Lanzamiento, Mi Startup"
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Descripción (Opcional)</label>
              <textarea
                className="w-full bg-secondary border border-input rounded-xl px-4 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors h-20"
                placeholder="Describe el objetivo y contexto de este proyecto..."
                value={projDesc}
                onChange={(e) => setProjDesc(e.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 bg-secondary hover:bg-muted text-foreground py-2.5 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-primary hover:opacity-90 text-primary-foreground py-2.5 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                Siguiente <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Template Selection */}
        {step === 'template' && (
          <div className="space-y-4 sm:space-y-5 animate-fade-in">
            <div className="text-center mb-6">
              <div className="flex justify-center mb-3">
                <div className="w-12 h-12 rounded-xl bg-bento-green-light flex items-center justify-center text-bento-green">
                  <Sparkles className="w-6 h-6" />
                </div>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground font-heading">Elige un Punto de Partida</h2>
              <p className="text-xs text-muted-foreground mt-2">¿Cómo deseas iniciar tu proyecto?</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Blank Project */}
              <button
                onClick={() => handleTemplateSelect('blank')}
                disabled={loading}
                className="group border border-border bg-card hover:border-bento-blue/60 hover:shadow-card-hover rounded-2xl p-6 cursor-pointer transition-all duration-300 flex flex-col text-left h-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-xl bg-bento-blue-light flex items-center justify-center text-bento-blue mb-4">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-foreground text-sm font-heading">Proyecto en Blanco</h3>
                <p className="mt-2 text-muted-foreground text-xs leading-relaxed flex-1">
                  Comienza desde cero con una lista vacía. Perfecto para nuevos proyectos.
                </p>
                <span className="mt-4 text-[11px] text-bento-blue font-medium group-hover:underline flex items-center gap-1">
                  Crear vacío <ArrowRight className="w-3 h-3" />
                </span>
              </button>

              {/* With Sample Data */}
              <button
                onClick={() => handleTemplateSelect('sample')}
                disabled={loading}
                className="group border border-border bg-card hover:border-bento-orange/60 hover:shadow-card-hover rounded-2xl p-6 cursor-pointer transition-all duration-300 flex flex-col text-left h-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-xl bg-bento-orange-light flex items-center justify-center text-bento-orange mb-4">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-foreground text-sm font-heading">Con Datos de Ejemplo</h3>
                <p className="mt-2 text-muted-foreground text-xs leading-relaxed flex-1">
                  Carga listas y tareas de demostración para explorar todas las funciones.
                </p>
                <span className="mt-4 text-[11px] text-bento-orange font-medium group-hover:underline flex items-center gap-1">
                  Cargar Demo <ArrowRight className="w-3 h-3" />
                </span>
              </button>
            </div>

            <button
              onClick={handleBack}
              disabled={loading}
              className="w-full bg-secondary hover:bg-muted text-foreground py-2.5 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
          </div>
        )}

        {loading && step === 'template' && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-sm rounded-2xl flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
              <p className="text-xs text-muted-foreground font-mono">Inicializando proyecto...</p>
            </div>
          </div>
        )}
      </div>
      <VersionBadge />
    </div>
  );
}
