/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Optional effort level of a task: how much work it takes, from a quick win to an
 * epic. Shown as a small bar meter wherever the task appears.
 */
import type { TaskEffort } from '../types';

/** `color` fills the meter's bars: from green (a quick win) to red (an epic). */
export const EFFORT_LEVELS: { value: TaskEffort; label: string; description: string; color: string }[] = [
  { value: 'easy', label: 'Fácil', description: 'Se resuelve en un momento', color: 'bg-emerald-500' },
  { value: 'casual', label: 'Casual', description: 'Poco trabajo, sin complicaciones', color: 'bg-lime-500' },
  { value: 'moderate', label: 'Moderado', description: 'Requiere algo de tiempo y atención', color: 'bg-amber-400' },
  { value: 'hard', label: 'Difícil', description: 'Trabajo considerable o con incertidumbre', color: 'bg-orange-500' },
  { value: 'epic', label: 'Épico', description: 'Un gran esfuerzo; considera dividirla', color: 'bg-red-500' },
];

/** Options for a select, with "no level" first. */
export const EFFORT_OPTIONS = [
  { value: '', label: 'Sin definir' },
  ...EFFORT_LEVELS.map(({ value, label }) => ({ value, label })),
];

export function effortLevel(effort?: TaskEffort | null) {
  const index = EFFORT_LEVELS.findIndex((l) => l.value === effort);
  return index < 0 ? null : { ...EFFORT_LEVELS[index], rank: index + 1 };
}

/** Bar meter: as many filled bars as the level's rank, in the level's color. */
export function EffortMeter({ effort, className = '' }: { effort?: TaskEffort | null; className?: string }) {
  const level = effortLevel(effort);
  return (
    <span className={`inline-flex items-end gap-px h-2.5 ${className}`} aria-hidden="true">
      {EFFORT_LEVELS.map((_, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-[1px] ${level && i < level.rank ? level.color : 'bg-muted-foreground/25'}`}
          style={{ height: `${40 + i * 15}%` }}
        />
      ))}
    </span>
  );
}

/** Badge with the meter and the level's name; nothing when the task has no level. */
export function EffortBadge({ effort, compact = false }: { effort?: TaskEffort | null; compact?: boolean }) {
  const level = effortLevel(effort);
  if (!level) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-md border border-border bg-secondary text-muted-foreground ${
        compact ? 'text-[8px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'
      }`}
      data-tooltip={`Nivel de esfuerzo: ${level.label}`}
    >
      <EffortMeter effort={effort} />
      {level.label}
    </span>
  );
}
