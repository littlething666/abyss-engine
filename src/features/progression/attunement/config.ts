import { AttunementRitualChecklist } from '../../../types/progression';

export type AttunementFieldPayload = Partial<AttunementRitualChecklist>;

export type AttunementOption<Value extends string, Payload extends AttunementFieldPayload> = {
  value: Value;
  label: string;
  checklist: Payload;
};

export const MICRO_GOAL_OPTIONS: AttunementOption<string, Pick<AttunementRitualChecklist, 'microGoal'>>[] = [
  { value: 'Review 15 cards', label: 'Review 15 cards', checklist: { microGoal: 'Review 15 cards' } },
  { value: 'Clear 10 flashcards', label: 'Clear 10 flashcards', checklist: { microGoal: 'Clear 10 flashcards' } },
  { value: 'Solve 3 practice prompts', label: 'Solve 3 practice prompts', checklist: { microGoal: 'Solve 3 practice prompts' } },
  { value: 'Finish one chapter', label: 'Finish one chapter', checklist: { microGoal: 'Finish one chapter' } },
];

export const SLEEP_OPTIONS: AttunementOption<
  'deprived' | 'fair' | 'peak',
  Pick<AttunementRitualChecklist, 'sleepHours'>
>[] = [
  { value: 'deprived', label: 'Deprived (<5h)', checklist: { sleepHours: 4 } },
  { value: 'fair', label: 'Fair (6-7h)', checklist: { sleepHours: 6 } },
  { value: 'peak', label: 'Peak (8h+)', checklist: { sleepHours: 8 } },
];

export const MOVEMENT_OPTIONS: AttunementOption<'none' | 'short' | 'full' | 'high', Pick<AttunementRitualChecklist, 'movementMinutes'>>[] = [
  { value: 'none', label: 'None', checklist: { movementMinutes: 0 } },
  { value: 'short', label: 'Short (15m)', checklist: { movementMinutes: 15 } },
  { value: 'full', label: 'Full Workout', checklist: { movementMinutes: 60 } },
  { value: 'high', label: 'High Intensity', checklist: { movementMinutes: 120 } },
];

export const FUEL_QUALITY_OPTIONS: AttunementOption<
  'underfueled' | 'sugar-rush' | 'steady-fuel' | 'food-coma',
  Pick<AttunementRitualChecklist, 'fuelQuality'>
>[] = [
  { value: 'underfueled', label: 'Underfueled (Weak)', checklist: { fuelQuality: 'underfueled' } },
  { value: 'sugar-rush', label: 'Sugar Rush (Jittery)', checklist: { fuelQuality: 'sugar-rush' } },
  { value: 'steady-fuel', label: 'Steady Fuel (Sharp)', checklist: { fuelQuality: 'steady-fuel' } },
  { value: 'food-coma', label: 'Food Coma (Heavy)', checklist: { fuelQuality: 'food-coma' } },
];

export const HYDRATION_OPTIONS: AttunementOption<
  'dehydrated' | 'moderate' | 'optimal',
  Pick<AttunementRitualChecklist, 'hydration'>
>[] = [
  { value: 'dehydrated', label: 'Dehydrated', checklist: { hydration: 'dehydrated' } },
  { value: 'moderate', label: 'Moderate', checklist: { hydration: 'moderate' } },
  { value: 'optimal', label: 'Optimal', checklist: { hydration: 'optimal' } },
];

export function getChecklistForSelection<
  T extends readonly AttunementOption<string, AttunementFieldPayload>[],
>(options: T, selectedValue: string): AttunementFieldPayload {
  const match = options.find((option) => option.value === selectedValue);
  return match?.checklist ?? {};
}
