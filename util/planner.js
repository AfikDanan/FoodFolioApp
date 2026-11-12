// Pure planning logic ported from the design prototype: week auto-fill, batch
// cooking distribution and the cook-day timeline. No React, no database.
import { dateKey, formatQty, timeLabel } from "./recipeUtils";

// Every meal slot a day can have, in order. Which ones a person uses is a setting.
export const ALL_MEALS = ["בוקר", "ביניים 1", "צהריים", "ביניים 2", "ערב"];
const DEFAULT_MEALS = ["בוקר", "צהריים", "ערב"];
const SNACKS = ["ביניים 1", "ביניים 2"];
// Which of the user's categories each meal draws from.
const MEAL_CATS = {
  בוקר: ["ארוחות בוקר"],
  "ביניים 1": ["מאפים", "ארוחות בוקר"],
  צהריים: ["סלטים", "עיקריות", "תוספות"],
  "ביניים 2": ["מאפים", "קינוחים"],
  ערב: ["עיקריות"],
};
const BATCH_CATS = ["עיקריות", "תוספות", "סלטים"];

export const slotKey = (date, meal) => `${dateKey(date)}|${meal}`;

/**
 * Fill only the empty slots of `days` from the user's own recipes.
 * plan: { "YYYY-MM-DD|meal": recipeId }. Returns the new plan and the keys that
 * were suggested (so the UI can outline them for review).
 */
export function generateFill({ recipes, plan, days, options, seed = 0, meals = DEFAULT_MEALS }) {
  const next = { ...plan };
  const suggested = {};
  if (!recipes.length) return { plan: next, suggested };
  const used = new Set(Object.values(next));

  days.forEach((date, d) => {
    const weekday = date.getDay() < 5; // Sunday to Thursday
    meals.forEach((meal) => {
      const mi = ALL_MEALS.indexOf(meal);
      const key = slotKey(date, meal);
      if (next[key]) return;

      if (options.left && meal === "צהריים" && meals.includes("ערב") && d > 0) {
        const yesterdayDinner = next[slotKey(days[d - 1], "ערב")];
        if (yesterdayDinner) {
          next[key] = yesterdayDinner;
          suggested[key] = true;
          return;
        }
      }

      let pool = recipes.filter((r) => r.cat.some((c) => MEAL_CATS[meal].includes(c)));
      if (!pool.length) {
        if (SNACKS.includes(meal)) return; // no fitting recipe: leave the snack empty
        pool = recipes;
      }
      // Each option narrows the pool, unless that would leave nothing.
      const narrow = (fn) => {
        const x = pool.filter(fn);
        if (x.length) pool = x;
      };
      if (options.veg) {
        narrow((r) => r.tags.some((t) => ["צמחוני", "טבעוני", "דגים"].includes(t)));
      }
      if (options.quick && weekday) narrow((r) => r.time > 0 && r.time <= 45);
      if (options.norep) narrow((r) => !used.has(r.id));

      const pick = pool[(d * 3 + mi + seed * 5) % pool.length];
      next[key] = pick.id;
      suggested[key] = true;
      used.add(pick.id);
    });
  });
  return { plan: next, suggested };
}

export const batchCandidates = (recipes) =>
  recipes
    .filter((r) => r.cat.some((c) => BATCH_CATS.includes(c)))
    .sort((a, b) => Number(a.fridge < 3) - Number(b.fridge < 3));

// Every recipe can be cooked ahead; the ones that keep well come first, and
// those best eaten fresh sink to the bottom (in their original order).
export const cookDayCandidates = (recipes) =>
  recipes
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(a.r.fridge < 3) - Number(b.r.fridge < 3) || b.r.fridge - a.r.fridge || a.i - b.i)
    .map((x) => x.r);

// `count` days starting at the cook day: the days its food has to cover.
export function coverFrom(date, count) {
  return Array.from(
    { length: count },
    (_, i) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + i)
  );
}

// Days (from the cook day, max 5, clipped to the week) the batch has to cover.
export function coverDays(days, cookIndex) {
  return days.slice(cookIndex, Math.min(cookIndex + 5, days.length));
}

/**
 * Hand out portions to slots: shortest fridge life first, never the same dish
 * twice in a row, and anything that won't last until its day goes to the freezer.
 * picks: [{ r, k }] where k is the number of meals.
 */
export function distribute({ picks, cover, meals }) {
  const rem = picks
    .map((x) => ({ r: x.r, left: x.k, f: x.r.fridge }))
    .sort((a, b) => a.f - b.f);
  const slots = [];
  let prev = null;
  cover.forEach((date, i) => {
    meals.forEach((meal) => {
      const open = rem.filter((x) => x.left > 0);
      if (!open.length) {
        slots.push({ date, meal, r: null });
        return;
      }
      const choice = open.find((x) => x.r.id !== prev) || open[0];
      choice.left -= 1;
      prev = choice.r.id;
      slots.push({ date, meal, r: choice.r, freeze: i > choice.f });
    });
  });
  return slots;
}

// "✦ auto-complete": fill the gap with dishes that keep well, two meals each.
export function autoCompletePicks({ recipes, picks, need }) {
  const next = { ...picks };
  let left = need - Object.values(next).reduce((a, b) => a + b, 0);
  const keeps = (list) =>
    list.filter((r) => r.fridge >= 3 && !next[r.id]).sort((a, b) => b.fridge - a.fridge);
  // Mains, sides and salads first; any other dish that keeps only if there are none.
  let pool = keeps(batchCandidates(recipes));
  if (!pool.length) pool = keeps(recipes);
  for (const r of pool) {
    if (left <= 0) break;
    const k = Math.min(2, left);
    next[r.id] = k;
    left -= k;
  }
  return next;
}

const clock = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

/** Cook-day plan: longest dish first, the others fitted in while it cooks. */
export function buildTimeline({ picks, people, slots }) {
  const sorted = picks.slice().sort((a, b) => b.r.time - a.r.time);
  const items = [];
  let kitchenMinutes = 0;
  if (sorted.length) {
    const first = sorted[0];
    const scale = (x) => formatQty((x.k * people) / x.r.servings);
    items.push({
      at: clock(0),
      title: first.r.title,
      text: `מתחילים במתכון הארוך (${timeLabel(first.r.time)}), פי ${scale(first)} מהכמות. ${
        first.r.steps?.[0] || ""
      }`.trim(),
    });
    let cur = 10;
    sorted.slice(1).forEach((x) => {
      items.push({
        at: clock(cur),
        title: x.r.title,
        text: `בזמן ש${first.r.title} מתבשל: פי ${scale(x)} מהמתכון, ${timeLabel(x.r.time)}.`,
      });
      cur += Math.max(10, Math.round((x.r.time * 0.5) / 5) * 5);
    });
    const end = Math.max(first.r.time, cur);
    const have = picks.reduce((a, x) => a + x.k, 0);
    const frozen = slots.filter((s) => s.freeze).length;
    items.push({
      at: clock(end),
      title: "חלוקה לקופסאות",
      text: `מקררים כשעה, מחלקים ל־${have} קופסאות ומסמנים תאריך.${
        frozen ? ` ${frozen} מהן נכנסות למקפיא.` : ""
      }`,
    });
    kitchenMinutes = end + 20;
  }
  return { items, kitchenMinutes };
}
