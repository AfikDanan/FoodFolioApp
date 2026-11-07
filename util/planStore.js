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
