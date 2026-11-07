import { useEffect, useState } from "react";
import { getMeta, setMeta } from "./database";
import { ALL_MEALS } from "./planner";

export const DEFAULT_MEALS = ["בוקר", "צהריים", "ערב"];

// Ready-made plans for the settings screen; people can still toggle meals one by one.
export const MEAL_PRESETS = [
  { label: "2 ארוחות", meals: ["צהריים", "ערב"] },
  { label: "3 ארוחות", meals: DEFAULT_MEALS },
  { label: "5 ארוחות", meals: ALL_MEALS },
];

// Keep only known meals, in day order, and never fewer than one.
export function normalizeMeals(list) {
  const picked = ALL_MEALS.filter((m) => Array.isArray(list) && list.includes(m));
  return picked.length ? picked : DEFAULT_MEALS;
}

const KEY = "meals";
let current = DEFAULT_MEALS;
const listeners = new Set();

export async function loadMeals() {
  try {
    const raw = await getMeta(KEY);
    current = raw ? normalizeMeals(JSON.parse(raw)) : DEFAULT_MEALS;
  } catch (e) {
    current = DEFAULT_MEALS;
  }
  listeners.forEach((fn) => fn(current));
  return current;
}

export async function saveMeals(list) {
  current = normalizeMeals(list);
  listeners.forEach((fn) => fn(current));
  await setMeta(KEY, JSON.stringify(current));
}

// The meals the user eats per day, kept in sync across screens.
export function useMeals() {
  const [meals, setMeals] = useState(current);
  useEffect(() => {
    listeners.add(setMeals);
    setMeals(current);
    return () => listeners.delete(setMeals);
  }, []);
  return meals;
}
