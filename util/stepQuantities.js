// Finds where a cooking step mentions an ingredient, so the amount can be shown
// right there ("מערבבים את הבשר הטחון [500 גרם] עם הבצל [1 יחידה]").
// Pure text logic: no React, no database.
import { displayUnit, formatQty, parseQty } from "./recipeUtils";

const HEB = "א-ת";
// Prefixes that attach to a Hebrew noun: ו ש ב ל כ, then ה or מה ("מהבצל"). A bare
// מ is left out on purpose: "ומשמנים" (greasing) must not read as the oil.
const PREFIX = "[ושבלכ]{0,2}(?:מה|ה)?";
const ENDING = "(?:יים|יות|ייה|ים|ות|יה|י|ה|ת)?";
const FINALS = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };
const TO_FINAL = { כ: "ך", מ: "ם", נ: "ן", פ: "ף", צ: "ץ" };

// First words that describe a part or a form, where the real ingredient is the
// next word ("שיני שום" is mentioned in steps as "השום").
// First words that describe a part or a form, where the real ingredient is the
// next word ("שיני שום" is mentioned in steps as "השום").
const PART_WORDS = [
  "שיני", "שן", "עלי", "גרעיני", "קליפת", "גרידת", "פתיתי", "גבעולי", "ענפי", "צרור", "חבילת",
  "פחית", "קופסת", "כרעיים", "כרעי", "חזה", "שוקי", "שוקיים", "כנפי", "כנפיים", "ירכי",
  "ירכיים", "פילה", "נתחי", "קוביות", "פרוסות", "רצועות", "גבינת",
];
// First words that often name what is being cooked, not the ingredient
// ("הרוטב" in a step is usually the sauce in the pot, not "רוטב סויה").
const VAGUE_WORDS = ["רוטב", "מרק", "אבקת", "אבקה", "מיץ", "תערובת", "תבלין", "תבליני", "ממרח", "רסק", "מים", "בצק"];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const clean = (s) =>
  String(s || "")
    .replace(/[֑-ׇ]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[,،].*$/, "")
    .replace(/\s+/g, " ")
    .trim();

// "בצלים" -> pattern that also finds "בצל"; "ביצה" -> also "ביצים", "ביצת".
function wordPattern(word) {
  let stem = word;
  for (const end of ["יים", "יות", "ים", "ות", "ה", "ת"]) {
    if (stem.length - end.length >= 2 && stem.endsWith(end)) {
      stem = stem.slice(0, -end.length);
      break;
    }
  }
  const last = stem[stem.length - 1];
  const base = FINALS[last] || last;
  const head = escapeRe(stem.slice(0, -1));
  const tail = TO_FINAL[base] ? `[${base}${TO_FINAL[base]}]` : escapeRe(last);
  return `${head}${tail}${ENDING}`;
}

// A phrase of one or more words, each allowed its own prefix ("הבשר הטחון").
function phraseRegex(words) {
  const body = words.map((w) => `${PREFIX}${wordPattern(w)}`).join("\\s+");
  return new RegExp(`(^|[^${HEB}])(${body})(?=$|[^${HEB}])`, "g");
}

const NUMBER = "(?:\\d|[½¼¾⅓⅔]|חצי|רבע|שליש|שני |שתי )";
const TIME_UNIT = /^\s*[\d.,/½¼¾-]*\s*(?:דקות|דקה|דק׳|שעות|שעה|שעתיים|מעלות|שניות)/;

// True when the step already gives an amount for this mention.
function hasOwnAmount(text, start, end) {
  const before = text.slice(Math.max(0, start - 20), start);
  const m = before.match(new RegExp(`${NUMBER}[^.,;:()\\d]*$`));
  if (m && !TIME_UNIT.test(m[0])) return true;
  const after = text.slice(end, end + 10);
  return /^\s*[(\-–:]?\s*(?:\d|[½¼¾⅓⅔])/.test(after) && !TIME_UNIT.test(after.replace(/^\s*[(\-–:]?/, ""));
}

/** "500 גרם", "2 כפות", "1 יחידה". Empty when there is no real amount. */
export function amountLabel(quantity, unit) {
  const q = Number(quantity);
  if (!isFinite(q) || q <= 0) return "";
  const u = displayUnit(q, unit, true) || (q <= 1 ? "יחידה" : "יחידות");
  return `${formatQty(q)} ${u}`;
}

/** [{ name, label }] for a recipe's parsed ingredients, scaled by `factor`. */
export function stepIngredientsFor(ingredients, factor = 1) {
  return (ingredients || []).map((ing) => ({
    name: ing.name,
    label:
      String(ing.quantity ?? "").trim() === ""
        ? ""
        : amountLabel(parseQty(ing.quantity) * factor, ing.unit),
  }));
}

/**
 * text: one step. ingredients: [{ name, label }] with the amount already
 * formatted for the current servings. Returns the step as parts, in order:
 * strings, and { qty } objects placed right after the ingredient they belong to.
 */
export function annotateStep(text, ingredients) {
  const source = String(text || "");
  if (!source || !ingredients?.length) return [source];

  const list = ingredients
    .map((ing) => ({ words: clean(ing.name).split(" ").filter(Boolean), label: ing.label }))
    .filter((x) => x.words.length && x.label);

  // The single word each ingredient may be called by, when it is not ambiguous.
  const shortOf = (words) => {
    if (words.length === 1) return null;
    if (PART_WORDS.includes(words[0])) return words[1];
    if (VAGUE_WORDS.includes(words[0])) return null;
    return words[0].length >= 2 ? words[0] : null;
  };
  const shorts = list.map((x) => shortOf(x.words));
  const singles = list.filter((x) => x.words.length === 1).map((x) => x.words[0]);
  const isUnique = (word, i) =>
    !!word &&
    !singles.includes(word) &&
    shorts.every((s, j) => j === i || s !== word) &&
    list.every((x, j) => j === i || !x.words.includes(word));

  const taken = []; // [start, end) ranges already claimed
  const free = (s, e) => taken.every(([a, b]) => e <= a || s >= b);
  const marks = []; // { at, label }

  const tryMatch = (words, label) => {
    const re = phraseRegex(words);
    let m;
    while ((m = re.exec(source))) {
      const start = m.index + m[1].length;
      let end = start + m[2].length;
      if (!free(start, end)) continue;
      // Keep a following adjective with the noun: "הבצל המגורר [1 יחידה]".
      if (/^[ושבלכמ]?ה/.test(m[2])) {
        const more = source.slice(end).match(new RegExp(`^(?:\\s+ה[${HEB}]{2,}){1,2}`));
        if (more && free(end, end + more[0].length)) end += more[0].length;
      }
      taken.push([start, end]);
      if (!hasOwnAmount(source, start, end)) marks.push({ at: end, label });
      return true;
    }
    return false;
  };

  // Longest names first, so "שמן זית" is claimed before a plain "שמן".
  const order = list.map((_, i) => i).sort((a, b) => list[b].words.length - list[a].words.length);
  const found = {};
  for (const i of order) found[i] = tryMatch(list[i].words, list[i].label);
  for (const i of order) {
    if (!found[i] && isUnique(shorts[i], i)) tryMatch([shorts[i]], list[i].label);
  }

  if (!marks.length) return [source];
  marks.sort((a, b) => a.at - b.at);
  const parts = [];
  let pos = 0;
  for (const mark of marks) {
    if (mark.at > pos) parts.push(source.slice(pos, mark.at));
    parts.push({ qty: mark.label });
    pos = mark.at;
  }
  if (pos < source.length) parts.push(source.slice(pos));
  return parts;
}
