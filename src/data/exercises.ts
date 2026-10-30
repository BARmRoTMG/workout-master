import type { Muscle } from '../lib/muscles'

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight'
export type ExerciseKind = 'compound' | 'isolation'

export interface Exercise {
  id: string
  name: string
  primary: Muscle
  secondary: Muscle[]
  kind: ExerciseKind
  equipment: Equipment
  repMin: number
  repMax: number
  custom?: boolean
}

type Def = [
  id: string,
  name: string,
  primary: Muscle,
  secondary: Muscle[],
  kind: ExerciseKind,
  equipment: Equipment,
  repMin: number,
  repMax: number,
]

const DEFS: Def[] = [
  // Chest
  ['barbell-bench-press', 'Barbell Bench Press', 'chest', ['triceps', 'shoulders'], 'compound', 'barbell', 6, 10],
  ['dumbbell-bench-press', 'Dumbbell Bench Press', 'chest', ['triceps', 'shoulders'], 'compound', 'dumbbell', 8, 12],
  ['incline-dumbbell-press', 'Incline Dumbbell Press', 'chest', ['shoulders', 'triceps'], 'compound', 'dumbbell', 8, 12],
  ['machine-chest-press', 'Machine Chest Press', 'chest', ['triceps', 'shoulders'], 'compound', 'machine', 8, 12],
  ['push-up', 'Push-up', 'chest', ['triceps', 'shoulders'], 'compound', 'bodyweight', 8, 20],
  ['cable-fly', 'Cable Fly', 'chest', [], 'isolation', 'cable', 10, 15],
  ['pec-deck', 'Pec Deck', 'chest', [], 'isolation', 'machine', 10, 15],
  // Back
  ['lat-pulldown', 'Lat Pulldown', 'back', ['biceps'], 'compound', 'cable', 8, 12],
  ['seated-cable-row', 'Seated Cable Row', 'back', ['biceps'], 'compound', 'cable', 8, 12],
  ['barbell-row', 'Barbell Row', 'back', ['biceps'], 'compound', 'barbell', 6, 10],
  ['one-arm-dumbbell-row', 'One-arm Dumbbell Row', 'back', ['biceps'], 'compound', 'dumbbell', 8, 12],
  ['chest-supported-row', 'Chest-supported Row', 'back', ['biceps'], 'compound', 'machine', 8, 12],
  ['pull-up', 'Pull-up', 'back', ['biceps'], 'compound', 'bodyweight', 5, 12],
  // Shoulders
  ['overhead-press', 'Overhead Press', 'shoulders', ['triceps'], 'compound', 'barbell', 6, 10],
  ['dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'shoulders', ['triceps'], 'compound', 'dumbbell', 8, 12],
  ['machine-shoulder-press', 'Machine Shoulder Press', 'shoulders', ['triceps'], 'compound', 'machine', 8, 12],
  ['lateral-raise', 'Lateral Raise', 'shoulders', [], 'isolation', 'dumbbell', 10, 15],
  ['cable-lateral-raise', 'Cable Lateral Raise', 'shoulders', [], 'isolation', 'cable', 10, 15],
  ['rear-delt-fly', 'Rear Delt Fly', 'shoulders', [], 'isolation', 'machine', 12, 15],
  // Quads
  ['barbell-back-squat', 'Barbell Back Squat', 'quads', ['glutes'], 'compound', 'barbell', 6, 10],
  ['leg-press', 'Leg Press', 'quads', ['glutes'], 'compound', 'machine', 8, 12],
  ['hack-squat', 'Hack Squat', 'quads', ['glutes'], 'compound', 'machine', 8, 12],
  ['goblet-squat', 'Goblet Squat', 'quads', ['glutes'], 'compound', 'dumbbell', 8, 12],
  ['bulgarian-split-squat', 'Bulgarian Split Squat', 'quads', ['glutes'], 'compound', 'dumbbell', 8, 12],
  ['leg-extension', 'Leg Extension', 'quads', [], 'isolation', 'machine', 10, 15],
  // Hamstrings
  ['romanian-deadlift', 'Romanian Deadlift', 'hamstrings', ['glutes', 'back'], 'compound', 'barbell', 6, 10],
  ['dumbbell-romanian-deadlift', 'Dumbbell Romanian Deadlift', 'hamstrings', ['glutes'], 'compound', 'dumbbell', 8, 12],
  ['deadlift', 'Deadlift', 'hamstrings', ['glutes', 'back', 'quads'], 'compound', 'barbell', 4, 8],
  ['lying-leg-curl', 'Lying Leg Curl', 'hamstrings', [], 'isolation', 'machine', 10, 15],
  ['seated-leg-curl', 'Seated Leg Curl', 'hamstrings', [], 'isolation', 'machine', 10, 15],
  // Glutes
  ['hip-thrust', 'Hip Thrust', 'glutes', ['hamstrings'], 'compound', 'barbell', 8, 12],
  ['glute-kickback', 'Cable Glute Kickback', 'glutes', [], 'isolation', 'cable', 12, 15],
  ['hip-abduction', 'Hip Abduction Machine', 'glutes', [], 'isolation', 'machine', 12, 20],
  // Biceps
  ['dumbbell-curl', 'Dumbbell Curl', 'biceps', [], 'isolation', 'dumbbell', 8, 12],
  ['barbell-curl', 'Barbell Curl', 'biceps', [], 'isolation', 'barbell', 8, 12],
  ['hammer-curl', 'Hammer Curl', 'biceps', [], 'isolation', 'dumbbell', 8, 12],
  ['cable-curl', 'Cable Curl', 'biceps', [], 'isolation', 'cable', 10, 15],
  ['preacher-curl', 'Preacher Curl Machine', 'biceps', [], 'isolation', 'machine', 10, 15],
  // Triceps
  ['triceps-pushdown', 'Triceps Pushdown', 'triceps', [], 'isolation', 'cable', 10, 15],
  ['overhead-triceps-extension', 'Overhead Cable Extension', 'triceps', [], 'isolation', 'cable', 10, 15],
  ['skull-crusher', 'Skull Crusher', 'triceps', [], 'isolation', 'barbell', 8, 12],
  ['dips', 'Dips', 'triceps', ['chest', 'shoulders'], 'compound', 'bodyweight', 6, 12],
  // Calves
  ['standing-calf-raise', 'Standing Calf Raise', 'calves', [], 'isolation', 'machine', 10, 15],
  ['seated-calf-raise', 'Seated Calf Raise', 'calves', [], 'isolation', 'machine', 12, 20],
  // Abs
  ['cable-crunch', 'Cable Crunch', 'abs', [], 'isolation', 'cable', 10, 15],
  ['hanging-knee-raise', 'Hanging Knee Raise', 'abs', [], 'isolation', 'bodyweight', 10, 15],
  ['ab-wheel', 'Ab Wheel Rollout', 'abs', [], 'isolation', 'bodyweight', 8, 15],
]

export const LIBRARY: Exercise[] = DEFS.map(
  ([id, name, primary, secondary, kind, equipment, repMin, repMax]) => ({
    id,
    name,
    primary,
    secondary,
    kind,
    equipment,
    repMin,
    repMax,
  }),
)

/** What the suggestion engine picks for a muscle before you have any history for it. */
export const DEFAULT_FOR: Record<Muscle, string> = {
  chest: 'dumbbell-bench-press',
  back: 'lat-pulldown',
  shoulders: 'dumbbell-shoulder-press',
  quads: 'leg-press',
  hamstrings: 'dumbbell-romanian-deadlift',
  glutes: 'hip-thrust',
  biceps: 'dumbbell-curl',
  triceps: 'triceps-pushdown',
  calves: 'standing-calf-raise',
  abs: 'cable-crunch',
}

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
}
