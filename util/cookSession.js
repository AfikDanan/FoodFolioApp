// Cooking several recipes at once, for one cook. Pure logic: reading a step
// (does it need hands, or does it cook by itself, and for how long), putting the
// steps of all recipes in a sensible order, and the state of a live session.
// No React and no database, so it can be tested on its own.
import { parseIngredients } from "./recipeUtils";
import { stepIngredientsFor } from "./stepQuantities";

// One color per recipe, readable on the dark cooking background.
export const TRACK_COLORS = ["#f0c15a", "#8ab8f0", "#5cc487", "#f2a48f", "#c9a7e8", "#7fd1c7"];

// Hands-on minutes to get a passive step going (pan into the oven, lid on).
const SETUP = 2;
const MAX_PASSIVE = 180;

const NUM = "(\\d+(?:[.,]\\d+)?)";

/** Minutes a step asks for, or null. "כשעה" 60, "10-12 דקות" 10, "שעה וחצי" 90. */
export function stepMinutes(text) {
  const s = String(text || "");
  let total = 0;
  if (/שעתיים/.test(s)) total += 120;
  else {
    const hours = s.match(new RegExp(`${NUM}\\s*שעות`));
    if (hours) total += Math.round(parseFloat(hours[1].replace(",", ".")) * 60);
    else if (/חצי שעה/.test(s)) total += 30;
    else if (/רבע שעה/.test(s)) total += 15;
    else if (/שלושת רבעי שעה/.test(s)) total += 45;
    else if (/(^|[^א-ת])[כלב]?שעה/.test(s)) total += 60;
  }
  if (/שעה וחצי|שעתיים וחצי/.test(s)) total += 30;
  if (/שעה ורבע/.test(s)) total += 15;
  // All "N דקות" mentions: the longest one is the step's main wait.
  // "15-20 דקות" counts as the upper bound. (\\b does not work next to Hebrew letters.)
  const re = new RegExp(`${NUM}(?:\\s*[-–]\\s*${NUM})?\\s*(?:דקות|דק׳|דק'|דק(?![\\u05D0-\\u05EA]))`, "g");
  let m;
  let minutes = 0;
  while ((m = re.exec(s))) {
    const hi = m[2] ? parseFloat(m[2].replace(",", ".")) : 0;
    minutes = Math.max(minutes, Math.round(Math.max(hi, parseFloat(m[1].replace(",", ".")))));
  }
  if (!minutes && /כמה דקות|מספר דקות/.test(s)) minutes = 3;
  if (!minutes && /דקה[- ]שתיים|כדקה|דקה אחת/.test(s)) minutes = 1;
  total += minutes;
  return total > 0 ? total : null;
}

const PASSIVE_WORDS =
  /אופים|לאפות|צולים|לצלות|מבשלים|לבשל|מכסים|מצננים|מקררים|לקרר|מתפיחים|להתפיח|התפחה|משרים|להשרות|לנוח|מרתיחים|מצמצמים|בתנור|לתנור|על אש (?:נמוכה|קטנה|בינונית)|מבעבע|מאדים|במקרר|במקפיא|מקפיאים|ממתינים|מחכים|משהים|מניחים בצד|להצטנן|להתייצב|לספוג/;
const HANDS_ON_WORDS =
  /תוך (?:כדי )?ערבוב|מערבבים כל הזמן|בלי להפסיק|ללא הפסקה|מטגנים|מקפיצים|משחימים|צורבים|טורפים|מקציפים|לשים|קולים|מזהיבים|מאדים בצל/;

/**
 * { kind, minutes }: "passive" steps cook by themselves for `minutes` (a timer),
 * "active" ones keep the cook busy. Active steps without a stated time get a
 * rough guess from their length; buildTracks then fits the guesses to the
 * recipe's total time.
 */
export function classifyStep(text) {
  const s = String(text || "");
  // Overnight waits (soaking, chilling) happen outside today's cooking: only the
  // few minutes of setting them up count.
  if (/לילה/.test(s) && /משרים|להשרות|מקררים|במקרר|מתפיחים|מרינד|מעמידים|משהים/.test(s)) {
    return { kind: "active", minutes: 3, stated: true };
  }
  const minutes = stepMinutes(s);
  if (minutes !== null) {
    const stirring = /תוך (?:כדי )?ערבוב|מערבבים כל הזמן|בלי להפסיק|ללא הפסקה/.test(s);
    const passive =
      !stirring &&
      (minutes >= 10 || (minutes >= 5 && PASSIVE_WORDS.test(s) && !HANDS_ON_WORDS.test(s)));
    if (passive) return { kind: "passive", minutes: Math.min(minutes, MAX_PASSIVE), stated: true };
    return { kind: "active", minutes: Math.max(1, minutes), stated: true };
  }
  // No time given: an oven, a pot or a rise still cooks by itself. Warming the
  // oven up is quick hands-on work.
  if (PASSIVE_WORDS.test(s) && !HANDS_ON_WORDS.test(s) && !/מחממים|מחמם|חימום|מניחים בצד/.test(s)) {
    return { kind: "passive", minutes: 20, stated: true };
  }
  return { kind: "active", minutes: Math.min(6, Math.max(2, Math.round(s.length / 30) + 1)), stated: false };
}

const firstWords = (title, n) => String(title || "").trim().split(/\s+/).slice(0, n).join(" ");

/**
 * items: [{ r, factor }] with r a normalized recipe (id, title, time, steps, row)
 * and factor the amount multiplier. Returns one track per recipe:
 * { id, n, title, short, color, steps: [{ text, kind, minutes }], ingredients }.
 */
export function buildTracks(items) {
  const usable = items.filter((x) => x.r && x.r.steps && x.r.steps.length);
  const heads = usable.map((x) => firstWords(x.r.title, 1));
  return usable.map((x, index) => {
    const steps = x.r.steps.map((text) => ({ text, ...classifyStep(text) }));
    // Fit the guessed hands-on minutes to what the recipe says it takes in total.
    const guessed = steps.filter((s) => !s.stated);
    const fixed = steps.filter((s) => s.stated).reduce((a, s) => a + s.minutes, 0);
    const guessSum = guessed.reduce((a, s) => a + s.minutes, 0);
    if (x.r.time > 0 && guessed.length) {
      const budget = Math.max(guessed.length, x.r.time - fixed);
      const ratio = budget / guessSum;
      for (const s of guessed) s.minutes = Math.min(15, Math.max(1, Math.round(s.minutes * ratio)));
    }
    const shared = heads.filter((h) => h === heads[index]).length > 1;
    return {
      id: x.r.id,
      n: index + 1,
      title: x.r.title,
      short: firstWords(x.r.title, shared ? 2 : 1),
      color: TRACK_COLORS[index % TRACK_COLORS.length],
      steps: steps.map(({ text, kind, minutes }) => ({ text, kind, minutes })),
      ingredients: stepIngredientsFor(parseIngredients(x.r.row?.ingredients), x.factor || 1),
    };
  });
}

const remaining = (track, i) =>
  track.steps.slice(i).reduce((a, s) => a + s.minutes + (s.kind === "passive" ? SETUP : 0), 0);

/**
 * Which recipe the cook should turn to now, among those that are ready:
 * something whose timer just ended comes first (it is hot and waiting), then
 * whatever still has the longest road ahead, so long dishes start early.
 * ready: [{ ti, i, fromTimer, since }]. Returns the track index, or -1.
 */
export function chooseNext(tracks, ready) {
  if (!ready.length) return -1;
  const sorted = ready.slice().sort((a, b) => {
    if (!!a.fromTimer !== !!b.fromTimer) return a.fromTimer ? -1 : 1;
    if (a.fromTimer && b.fromTimer && a.since !== b.since) return a.since - b.since;
    const diff = remaining(tracks[b.ti], b.i) - remaining(tracks[a.ti], a.i);
    return diff || a.ti - b.ti;
  });
  return sorted[0].ti;
}

/**
 * Play the whole session forward for one cook.
 * init (optional): [{ i, freeIn, fromTimer }] per track, in minutes from now.
 * Returns { total, lanes: [[{ start, end, kind }]], order: [{ at, ti, si, kind, minutes }] }.
 */
export function simulate(tracks, init) {
  const st = tracks.map((_, ti) => ({
    i: init?.[ti]?.i ?? 0,
    freeAt: init?.[ti]?.freeIn ?? 0,
    fromTimer: !!init?.[ti]?.fromTimer,
  }));
  const lanes = tracks.map(() => []);
  const order = [];
  // A timer already running when the simulation starts shows as a passive block.
  st.forEach((s, ti) => {
    if (s.freeAt > 0) lanes[ti].push({ start: 0, end: s.freeAt, kind: "passive" });
  });
  let t = 0;
  let guard = 0;
  const open = () => st.some((s, ti) => s.i < tracks[ti].steps.length);
  while (open() && guard++ < 2000) {
    const ready = st
      .map((s, ti) => ({ ti, i: s.i, fromTimer: s.fromTimer, since: s.freeAt }))
      .filter((x) => x.i < tracks[x.ti].steps.length && st[x.ti].freeAt <= t);
    if (!ready.length) {
      t = Math.min(...st.filter((s, ti) => s.i < tracks[ti].steps.length).map((s) => s.freeAt));
      continue;
    }
    const ti = chooseNext(tracks, ready);
    const s = st[ti];
    const step = tracks[ti].steps[s.i];
    order.push({ at: t, ti, si: s.i, kind: step.kind, minutes: step.minutes });
    if (step.kind === "passive") {
      lanes[ti].push({ start: t, end: t + SETUP, kind: "active" });
      lanes[ti].push({ start: t + SETUP, end: t + SETUP + step.minutes, kind: "passive" });
      t += SETUP;
      s.freeAt = t + step.minutes;
      s.fromTimer = true;
    } else {
      lanes[ti].push({ start: t, end: t + step.minutes, kind: "active" });
      t += step.minutes;
      s.freeAt = t;
      s.fromTimer = false;
    }
    s.i += 1;
  }
  const total = Math.max(0, ...lanes.flat().map((seg) => seg.end));
  return { total, lanes, order };
}

// ---- A live session -------------------------------------------------------
// One entry per track: { i, phase, endsAt, left, fromTimer, since }.
// phase: "ready" (waiting for the cook), "waiting" (timer running until endsAt),
// "paused" (timer stopped with `left` ms to go), "done".

export const startRun = (tracks) =>
  tracks.map((t) => ({
    i: 0,
    phase: t.steps.length ? "ready" : "done",
    endsAt: null,
    left: null,
    fromTimer: false,
    since: 0,
  }));

const advance = (track, s, now, fromTimer) => {
  const i = s.i + 1;
  return {
    i,
    phase: i >= track.steps.length ? "done" : "ready",
    endsAt: null,
    left: null,
    fromTimer,
    since: now,
  };
};

/** The cook finished (or, for a passive step, started) the current step of track ti. */
export function completeStep(tracks, run, ti, now) {
  const s = run[ti];
  if (!s || s.phase !== "ready") return run;
  const step = tracks[ti].steps[s.i];
  const next = run.slice();
  next[ti] =
    step.kind === "passive"
      ? { ...s, phase: "waiting", endsAt: now + step.minutes * 60000, left: null, fromTimer: false }
      : advance(tracks[ti], s, now, false);
  return next;
}

/** Timers that ran out move their recipe on. Returns { run, finished: [ti] }. */
export function tickRun(tracks, run, now) {
  const finished = [];
  const next = run.map((s, ti) => {
    if (s.phase === "waiting" && s.endsAt <= now) {
      finished.push(ti);
      return advance(tracks[ti], s, now, true);
    }
    return s;
  });
  return finished.length ? { run: next, finished } : { run, finished };
}

/** "It is ready already": end a timer early. */
export function skipTimer(tracks, run, ti, now) {
  const s = run[ti];
  if (!s || (s.phase !== "waiting" && s.phase !== "paused")) return run;
  const next = run.slice();
  next[ti] = advance(tracks[ti], s, now, true);
  return next;
}

export function toggleTimer(run, ti, now) {
  const s = run[ti];
  if (!s) return run;
  const next = run.slice();
  if (s.phase === "waiting") next[ti] = { ...s, phase: "paused", left: Math.max(0, s.endsAt - now), endsAt: null };
  else if (s.phase === "paused") next[ti] = { ...s, phase: "waiting", endsAt: now + s.left, left: null };
  else return run;
  return next;
}

/** Milliseconds left on a track's timer, or null when it has none. */
export const timerLeft = (s, now) =>
  s.phase === "waiting" ? Math.max(0, s.endsAt - now) : s.phase === "paused" ? s.left : null;

/** The track the guided view shows now: the sticky choice if still ready, else the best one. */
export function currentTrack(tracks, run, preferred) {
  if (preferred !== null && preferred !== undefined && run[preferred]?.phase === "ready") return preferred;
  const ready = run
    .map((s, ti) => ({ ti, i: s.i, fromTimer: s.fromTimer, since: s.since, phase: s.phase }))
    .filter((x) => x.phase === "ready");
  return chooseNext(tracks, ready);
}

export const allDone = (run) => run.length > 0 && run.every((s) => s.phase === "done");

/**
 * What comes after the current step, soonest first:
 * [{ ti, si, when: "next" | "timer", ms }]. "next" can be done right away,
 * "timer" opens when the timer of that recipe ends (ms from now; for a passive
 * step not started yet, its full length).
 */
export function upcoming(tracks, run, current, now, limit = 3) {
  const soon = [];
  const later = [];
  run.forEach((s, ti) => {
    const track = tracks[ti];
    if (s.phase === "done") return;
    if (ti === current) {
      const step = track.steps[s.i];
      if (s.i + 1 >= track.steps.length) return;
      if (step.kind === "passive") later.push({ ti, si: s.i + 1, when: "timer", ms: step.minutes * 60000 });
      else soon.push({ ti, si: s.i + 1, when: "next", rank: -1 });
    } else if (s.phase === "ready") {
      soon.push({ ti, si: s.i, when: "next", rank: s.fromTimer ? 0 : 1 });
    } else if (s.i + 1 < track.steps.length) {
      later.push({ ti, si: s.i + 1, when: "timer", ms: timerLeft(s, now) });
    }
  });
  // Ready recipes in the order the cook will be sent to them.
  const ready = soon.filter((x) => x.rank >= 0);
  const orderedReady = [];
  let pool = ready.map((x) => ({ ti: x.ti, i: x.si, fromTimer: x.rank === 0, since: run[x.ti].since }));
  while (pool.length) {
    const ti = chooseNext(tracks, pool);
    orderedReady.push(ready.find((x) => x.ti === ti));
    pool = pool.filter((x) => x.ti !== ti);
  }
  const own = soon.filter((x) => x.rank < 0);
  // A hot dish whose timer ended jumps ahead of continuing the same recipe.
  const hot = orderedReady.filter((x) => x.rank === 0);
  const rest = orderedReady.filter((x) => x.rank !== 0);
  later.sort((a, b) => a.ms - b.ms);
  return [...hot, ...own, ...rest, ...later]
    .slice(0, limit)
    .map(({ ti, si, when, ms }) => ({ ti, si, when, ms: ms ?? 0 }));
}

/** Minutes still ahead from the live state (for "ready by" and the header). */
export function minutesLeft(tracks, run, now) {
  const init = run.map((s) => ({
    i: s.phase === "done" ? Infinity : s.phase === "ready" ? s.i : s.i + 1,
    freeIn: s.phase === "waiting" || s.phase === "paused" ? Math.ceil(timerLeft(s, now) / 60000) : 0,
    fromTimer: s.fromTimer || s.phase === "waiting" || s.phase === "paused",
  }));
  return simulate(tracks, init).total;
}

/** "1:05" from seconds or "2:10" from minutes, for timers and totals. */
export const mmss = (ms) => {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
};
export const hmm = (minutes) => {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};
