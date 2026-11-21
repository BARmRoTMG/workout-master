export const MUSCLES = [
  'chest',
  'back',
  'shoulders',
  'quads',
  'hamstrings',
  'glutes',
  'biceps',
  'triceps',
  'calves',
  'abs',
] as const

export type Muscle = (typeof MUSCLES)[number]

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  biceps: 'Biceps',
  triceps: 'Triceps',
  calves: 'Calves',
  abs: 'Abs',
}

export type MuscleSize = 'large' | 'medium' | 'small'

export const MUSCLE_SIZE: Record<Muscle, MuscleSize> = {
  chest: 'large',
  back: 'large',
  quads: 'large',
  hamstrings: 'large',
  glutes: 'large',
  shoulders: 'medium',
  biceps: 'small',
  triceps: 'small',
  calves: 'small',
  abs: 'small',
}

export const LOWER_BODY = new Set<Muscle>(['quads', 'hamstrings', 'glutes', 'calves'])

/** Hours until a muscle is fully recovered from a hard set. */
export const RECOVERY_HOURS: Record<MuscleSize, number> = {
  large: 72,
  medium: 60,
  small: 48,
}

/** Plate-colour family used to tint exercises: push red, pull green, legs blue. */
export function family(m: Muscle): 'push' | 'pull' | 'legs' | 'core' {
  if (m === 'chest' || m === 'shoulders' || m === 'triceps') return 'push'
  if (m === 'back' || m === 'biceps') return 'pull'
  if (m === 'abs') return 'core'
  return 'legs'
}
