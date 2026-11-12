import { fetchMealPlan, replaceMealPlan, getMeta, setMeta } from "./database";

// The plan is a flat map { "YYYY-MM-DD|meal": recipeId } plus a map of prep tags
// { key: "fridge" | "freeze" } for slots filled by batch cooking.
export async function loadPlan() {
  const rows = (await fetchMealPlan()) || [];
  const plan = {};
  const prep = {};
  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.day)) continue; // old weekday-name rows
    const key = `${r.day}|${r.meal_type}`;
    plan[key] = r.recipe_id;
    if (r.prep_state) prep[key] = r.prep_state;
  }
  return { plan, prep };
}

export function savePlan(plan, prep = {}) {
  const slots = {};
  for (const [key, id] of Object.entries(plan)) {
    slots[key] = { id, prep: prep[key] || null };
  }
  return replaceMealPlan(slots);
}

export const loadCookDay = () => getMeta("cook_day");
export const saveCookDay = (key) => setMeta("cook_day", key || "");

// ---- The cooking day ------------------------------------------------------
// One planned cooking day: when, for how many days and people, and what to cook.
// { date: "YYYY-MM-DD", days, meals: [...], people, picks: { recipeId: meals },
//   slots: [plan keys it filled], shopping: bool (ingredients sent to the list) }
export function normalizeCookSession(raw) {
  const s = raw && typeof raw === "object" ? raw : null;
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s.date || "")) return null;
  const picks = {};
  for (const [id, k] of Object.entries(s.picks || {})) {
    if (Number(k) > 0) picks[id] = Math.round(Number(k));
  }
  if (!Object.keys(picks).length) return null;
  return {
    date: s.date,
    days: Math.min(7, Math.max(1, Number(s.days) || 5)),
    meals: Array.isArray(s.meals) ? s.meals.filter((m) => typeof m === "string") : [],
    people: Math.min(20, Math.max(1, Number(s.people) || 2)),
    picks,
    slots: Array.isArray(s.slots) ? s.slots.filter((k) => typeof k === "string") : [],
    shopping: !!s.shopping,
  };
}

export async function loadCookSession() {
  try {
    const raw = await getMeta("cook_session");
    return raw ? normalizeCookSession(JSON.parse(raw)) : null;
  } catch (e) {
    return null;
  }
}

export async function saveCookSession(session) {
  const clean = normalizeCookSession(session);
  await setMeta("cook_session", clean ? JSON.stringify(clean) : "");
  await saveCookDay(clean ? clean.date : "");
  return clean;
}

// A cooking session in progress (which step each recipe is on, running timers),
// so leaving the screen or the app does not lose the place.
export async function loadCookRun() {
  try {
    const raw = await getMeta("cook_run");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
export const saveCookRun = (state) => setMeta("cook_run", state ? JSON.stringify(state) : "");
