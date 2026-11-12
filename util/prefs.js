import { useEffect, useState } from "react";
import { getMeta, setMeta } from "./database";
import { normalizeDiet } from "./diet";

// Personal preferences kept on the device: how cooking screens behave and what
// the household eats. One JSON value, loaded once at start, shared through a hook.
export const COOK_VIEWS = ["guided", "board"];

export function normalizePrefs(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  return {
    // Show each ingredient's amount next to its name inside the cooking steps.
    stepQuantities: p.stepQuantities !== false,
    // The view that opens first when cooking several recipes together.
    cookView: COOK_VIEWS.includes(p.cookView) ? p.cookView : "guided",
    diet: normalizeDiet(p.diet),
  };
}

const KEY = "prefs";
let current = normalizePrefs(null);
const listeners = new Set();

export const getPrefs = () => current;

export async function loadPrefs() {
  try {
    const raw = await getMeta(KEY);
    current = normalizePrefs(raw ? JSON.parse(raw) : null);
  } catch (e) {
    current = normalizePrefs(null);
  }
  listeners.forEach((fn) => fn(current));
  return current;
}

// Merge a partial change, for example savePrefs({ cookView: "board" }).
export async function savePrefs(patch) {
  current = normalizePrefs({ ...current, ...patch });
  listeners.forEach((fn) => fn(current));
  await setMeta(KEY, JSON.stringify(current));
}

export const saveDiet = (patch) => savePrefs({ diet: { ...current.diet, ...patch } });

export function usePrefs() {
  const [prefs, setPrefs] = useState(current);
  useEffect(() => {
    listeners.add(setPrefs);
    setPrefs(current);
    return () => listeners.delete(setPrefs);
  }, []);
  return prefs;
}
