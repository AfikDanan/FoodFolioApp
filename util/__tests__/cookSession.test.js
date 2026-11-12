import {
  allDone,
  buildTracks,
  classifyStep,
  completeStep,
  currentTrack,
  minutesLeft,
  simulate,
  skipTimer,
  startRun,
  stepMinutes,
  tickRun,
  timerLeft,
  toggleTimer,
  upcoming,
} from "../cookSession";

const recipe = (id, title, time, steps) => ({ id, title, time, steps, servings: 4, row: { ingredients: "[]" } });

const chicken = recipe(1, "עוף בתנור עם תפוחי אדמה", 75, [
  "מחממים תנור ל־200 מעלות.",
  "חותכים תפוחי אדמה ומסדרים בתבנית עם העוף.",
  "צולים בתנור כשעה, עד שהעוף מזהיב.",
  "מוציאים ומגישים.",
]);
const soup = recipe(2, "מרק עדשים כתומות", 50, [
  "קוצצים בצל וגזר.",
  "מטגנים את הבצל 5 דקות.",
  "מוסיפים עדשים ומים ומבשלים על אש נמוכה 35 דקות.",
  "טוחנים את המרק ומתבלים.",
]);
const salad = recipe(3, "סלט ירקות", 10, ["חותכים ירקות.", "מתבלים ומערבבים."]);

describe("reading a step", () => {
  it("finds the minutes", () => {
    expect(stepMinutes("מבשלים 35 דקות")).toBe(35);
    expect(stepMinutes("צולים כשעה")).toBe(60);
    expect(stepMinutes("אופים שעה וחצי")).toBe(90);
    expect(stepMinutes("מתפיחים שעתיים")).toBe(120);
    expect(stepMinutes("מבשלים 10-12 דקות")).toBe(10);
    expect(stepMinutes("מטגנים 5 דקות, ואז מבשלים 30 דקות")).toBe(30);
    expect(stepMinutes("מחממים תנור ל־200 מעלות")).toBeNull();
    expect(stepMinutes("חותכים בצל")).toBeNull();
  });

  it("tells hands-on work from waiting", () => {
    expect(classifyStep("צולים בתנור כשעה")).toMatchObject({ kind: "passive", minutes: 60 });
    expect(classifyStep("מכסים ומבשלים 7 דקות")).toMatchObject({ kind: "passive", minutes: 7 });
    expect(classifyStep("מטגנים את הבצל 5 דקות")).toMatchObject({ kind: "active", minutes: 5 });
    expect(classifyStep("מבשלים 15 דקות תוך כדי ערבוב")).toMatchObject({ kind: "active", minutes: 15 });
    expect(classifyStep("חותכים ירקות").kind).toBe("active");
  });
});

describe("buildTracks", () => {
  const tracks = buildTracks([{ r: chicken }, { r: soup }, { r: salad }, { r: recipe(4, "ריק", 5, []) }]);

  it("makes one numbered, colored track per recipe with steps", () => {
    expect(tracks).toHaveLength(3);
    expect(tracks.map((t) => t.n)).toEqual([1, 2, 3]);
    expect(tracks.map((t) => t.short)).toEqual(["עוף", "מרק", "סלט"]);
    expect(new Set(tracks.map((t) => t.color)).size).toBe(3);
  });

  it("fits guessed hands-on time to the recipe's total", () => {
    const total = tracks[0].steps.reduce((a, s) => a + s.minutes, 0);
    expect(total).toBeGreaterThanOrEqual(70);
    expect(total).toBeLessThanOrEqual(80);
  });

  it("uses two words when first words clash", () => {
    const t = buildTracks([{ r: recipe(1, "מרק עוף", 30, ["a"]) }, { r: recipe(2, "מרק עדשים", 30, ["a"]) }]);
    expect(t.map((x) => x.short)).toEqual(["מרק עוף", "מרק עדשים"]);
  });
});

describe("simulate", () => {
  const tracks = buildTracks([{ r: salad }, { r: soup }, { r: chicken }]);
  const plan = simulate(tracks);

  it("starts with the longest dish and works on others while it cooks", () => {
    expect(plan.order[0].ti).toBe(2); // chicken
    const ovenStart = plan.order.find((o) => o.ti === 2 && o.kind === "passive").at;
    const soupStart = plan.order.find((o) => o.ti === 1).at;
    expect(soupStart).toBeGreaterThan(ovenStart);
    expect(soupStart).toBeLessThan(ovenStart + 60);
  });

  it("never has the cook in two places at once", () => {
    const busy = plan.lanes.flat().filter((s) => s.kind === "active").sort((a, b) => a.start - b.start);
    for (let i = 1; i < busy.length; i++) expect(busy[i].start).toBeGreaterThanOrEqual(busy[i - 1].end);
  });

  it("is much shorter than cooking one after the other", () => {
    const serial = tracks.reduce((a, t) => a + t.steps.reduce((b, s) => b + s.minutes, 0), 0);
    expect(plan.total).toBeLessThan(serial - 30);
    expect(plan.order).toHaveLength(10);
  });
});

describe("a live session", () => {
  const tracks = buildTracks([{ r: chicken }, { r: soup }]);
  const T0 = 1_000_000;

  it("walks the cook through, starting timers for passive steps", () => {
    let run = startRun(tracks);
    expect(currentTrack(tracks, run, null)).toBe(0);
    run = completeStep(tracks, run, 0, T0); // oven on
    run = completeStep(tracks, run, 0, T0); // tray ready
    expect(tracks[0].steps[run[0].i].kind).toBe("passive");
    run = completeStep(tracks, run, 0, T0); // into the oven: timer starts
    expect(run[0].phase).toBe("waiting");
    expect(timerLeft(run[0], T0)).toBe(60 * 60000);
    // The cook is sent to the soup while the chicken roasts.
    expect(currentTrack(tracks, run, 0)).toBe(1);
  });

  it("moves a recipe on when its timer ends, and puts it first", () => {
    let run = startRun(tracks);
    for (let i = 0; i < 3; i++) run = completeStep(tracks, run, 0, T0);
    const early = tickRun(tracks, run, T0 + 59 * 60000);
    expect(early.finished).toEqual([]);
    const late = tickRun(tracks, run, T0 + 60 * 60000);
    expect(late.finished).toEqual([0]);
    expect(late.run[0]).toMatchObject({ i: 3, phase: "ready", fromTimer: true });
    expect(currentTrack(tracks, late.run, null)).toBe(0);
  });

  it("pauses, resumes and skips a timer", () => {
    let run = startRun(tracks);
    for (let i = 0; i < 3; i++) run = completeStep(tracks, run, 0, T0);
    run = toggleTimer(run, 0, T0 + 10 * 60000);
    expect(run[0].phase).toBe("paused");
    expect(timerLeft(run[0], T0 + 30 * 60000)).toBe(50 * 60000);
    run = toggleTimer(run, 0, T0 + 30 * 60000);
    expect(timerLeft(run[0], T0 + 30 * 60000)).toBe(50 * 60000);
    run = skipTimer(tracks, run, 0, T0 + 31 * 60000);
    expect(run[0]).toMatchObject({ i: 3, phase: "ready" });
  });

  it("lists what comes next", () => {
    let run = startRun(tracks);
    for (let i = 0; i < 3; i++) run = completeStep(tracks, run, 0, T0);
    // Now on the soup's first step, chicken in the oven.
    const next = upcoming(tracks, run, 1, T0 + 60000);
    expect(next[0]).toMatchObject({ ti: 1, si: 1, when: "next" });
    expect(next[1]).toMatchObject({ ti: 0, si: 3, when: "timer", ms: 59 * 60000 });
  });

  it("knows when everything is done and how long is left", () => {
    let run = startRun(tracks);
    const before = minutesLeft(tracks, run, T0);
    expect(before).toBe(simulate(tracks).total);
    let now = T0;
    let guard = 0;
    while (!allDone(run) && guard++ < 50) {
      const ti = currentTrack(tracks, run, null);
      if (ti >= 0) run = completeStep(tracks, run, ti, now);
      else {
        now += 61 * 60000;
        run = tickRun(tracks, run, now).run;
      }
    }
    expect(allDone(run)).toBe(true);
    expect(minutesLeft(tracks, run, now)).toBe(0);
  });
});
