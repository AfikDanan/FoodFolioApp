import {
  autoCompletePicks,
  buildTimeline,
  cookDayCandidates,
  coverDays,
  coverFrom,
  distribute,
  generateFill,
  slotKey,
} from "../planner";

const r = (id, over = {}) => ({
  id,
  title: `מתכון ${id}`,
  cat: ["עיקריות"],
  tags: [],
  time: 30,
  servings: 4,
  fridge: 3,
  ...over,
});
// Sunday 1 Nov 2026 onwards
const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 1 + i));

describe("generateFill", () => {
  const recipes = [
    r(1, { cat: ["ארוחות בוקר"] }),
    r(2, { cat: ["סלטים"], time: 10 }),
    r(3, { time: 90 }),
    r(4, { time: 20, tags: ["צמחוני"] }),
  ];
  const opts = { quick: false, norep: false, veg: false, left: false };

  it("only touches empty slots", () => {
    const keep = slotKey(days[0], "ערב");
    const { plan, suggested } = generateFill({ recipes, plan: { [keep]: 3 }, days, options: opts });
    expect(plan[keep]).toBe(3);
    expect(suggested[keep]).toBeUndefined();
    expect(Object.keys(plan)).toHaveLength(21);
  });

  it("puts breakfast recipes at breakfast and mains at dinner", () => {
    const { plan } = generateFill({ recipes, plan: {}, days, options: opts });
    expect(days.every((d) => plan[slotKey(d, "בוקר")] === 1)).toBe(true);
    expect(days.every((d) => [3, 4].includes(plan[slotKey(d, "ערב")]))).toBe(true);
  });

  it("keeps weekday dinners under 45 minutes when asked", () => {
    const { plan } = generateFill({ recipes, plan: {}, days, options: { ...opts, quick: true } });
    expect(plan[slotKey(days[1], "ערב")]).toBe(4);
  });

  it("repeats lunch from last night's dinner with leftovers on", () => {
    const { plan } = generateFill({ recipes, plan: {}, days, options: { ...opts, left: true } });
    expect(plan[slotKey(days[1], "צהריים")]).toBe(plan[slotKey(days[0], "ערב")]);
  });

  it("falls back to all recipes when a category is missing and never throws", () => {
    const only = [r(9, { cat: ["קינוחים"] })];
    const { plan } = generateFill({ recipes: only, plan: {}, days, options: opts });
    expect(Object.values(plan).every((id) => id === 9)).toBe(true);
    expect(generateFill({ recipes: [], plan: {}, days, options: opts }).plan).toEqual({});
  });
});

describe("batch cooking", () => {
  const a = r(1, { fridge: 1 });
  const b = r(2, { fridge: 5, time: 60 });
  const cover = coverDays(days, 0);

  it("covers five days from the cook day, clipped to the week", () => {
    expect(coverDays(days, 0)).toHaveLength(5);
    expect(coverDays(days, 5)).toHaveLength(2);
  });

  it("serves short-lived dishes first, never twice in a row, and freezes what will not last", () => {
    const slots = distribute({
      picks: [
        { r: a, k: 2 },
        { r: b, k: 4 },
      ],
      cover,
      meals: ["צהריים", "ערב"],
    });
    expect(slots[0].r.id).toBe(1);
    expect(slots[1].r.id).toBe(2);
    // alternates while both dishes still have portions left
    expect(slots.slice(0, 4).map((s) => s.r.id)).toEqual([1, 2, 1, 2]);
    expect(slots.filter((s) => s.r)).toHaveLength(6);
    expect(slots.filter((s) => !s.r)).toHaveLength(4);
    const lateA = slots.find((s) => s.r?.id === 1 && s.date > days[1]);
    if (lateA) expect(lateA.freeze).toBe(true);
    expect(slots.find((s) => s.r?.id === 2 && s.date === days[0]).freeze).toBe(false);
  });

  it("auto-complete adds dishes that keep at least 3 days, two meals each", () => {
    const picks = autoCompletePicks({ recipes: [a, b, r(3, { fridge: 4 })], picks: {}, need: 4 });
    expect(picks).toEqual({ 2: 2, 3: 2 });
  });

  it("offers every recipe for the cooking day, the ones that keep well first", () => {
    const cake = r(7, { cat: ["קינוחים"], fridge: 5 });
    const fresh = r(8, { cat: ["סלטים"], fridge: 1 });
    const stew = r(9, { fridge: 4 });
    expect(cookDayCandidates([fresh, stew, cake]).map((x) => x.id)).toEqual([7, 9, 8]);
  });

  it("covers any number of days from any date, across months", () => {
    const cover = coverFrom(new Date(2026, 10, 28), 5);
    expect(cover.map((d) => d.getDate())).toEqual([28, 29, 30, 1, 2]);
    expect(cover[4].getMonth()).toBe(11);
  });

  it("auto-complete falls back to other dishes when there are no mains", () => {
    const picks = autoCompletePicks({ recipes: [r(5, { cat: ["קינוחים"], fridge: 4 })], picks: {}, need: 2 });
    expect(picks).toEqual({ 5: 2 });
  });

  it("starts the timeline with the longest dish and ends with boxing up", () => {
    const picks = [
      { r: a, k: 2 },
      { r: b, k: 2 },
    ];
    const slots = distribute({ picks, cover, meals: ["ערב"] });
    const { items, kitchenMinutes } = buildTimeline({ picks, people: 2, slots });
    expect(items[0].title).toBe(b.title);
    expect(items[0].at).toBe("0:00");
    expect(items.at(-1).title).toBe("חלוקה לקופסאות");
    expect(kitchenMinutes).toBe(80);
  });
});

describe("meals per day", () => {
  const recipes = [
    r(1, { cat: ["ארוחות בוקר"] }),
    r(2, { cat: ["מאפים"] }),
    r(3, { cat: ["קינוחים"] }),
    r(4, { cat: ["עיקריות"] }),
    r(5, { cat: ["סלטים"] }),
  ];
  const opts = { quick: false, norep: false, veg: false, left: false };

  it("fills exactly the meals the person eats", () => {
    const two = generateFill({ recipes, plan: {}, days, options: opts, meals: ["צהריים", "ערב"] });
    expect(Object.keys(two.plan)).toHaveLength(14);
    const five = generateFill({
      recipes,
      plan: {},
      days,
      options: opts,
      meals: ["בוקר", "ביניים 1", "צהריים", "ביניים 2", "ערב"],
    });
    expect(Object.keys(five.plan)).toHaveLength(35);
  });

  it("draws snacks from pastries and desserts", () => {
    const { plan } = generateFill({
      recipes,
      plan: {},
      days,
      options: opts,
      meals: ["ביניים 1", "ביניים 2"],
    });
    expect([1, 2]).toContain(plan[slotKey(days[0], "ביניים 1")]);
    expect([2, 3]).toContain(plan[slotKey(days[0], "ביניים 2")]);
  });

  it("leaves a snack empty rather than filling it with a main dish", () => {
    const mains = [r(4, { cat: ["עיקריות"] })];
    const { plan } = generateFill({ recipes: mains, plan: {}, days, options: opts, meals: ["ביניים 1", "ערב"] });
    expect(plan[slotKey(days[0], "ביניים 1")]).toBeUndefined();
    expect(plan[slotKey(days[0], "ערב")]).toBe(4);
  });
});
