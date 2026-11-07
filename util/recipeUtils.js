import { departments } from "../constants/recipeConstants";
import { singularUnits } from "./unitConversion";

const SNAPS = [
  [0, ""],
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.5, "½"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
  [1, ""],
];

// Quantities >= 10 round to an integer; below that the fraction snaps to the
// nearest of ¼ ⅓ ½ ⅔ ¾.
export function formatQty(value) {
  const n = Number(value);
  if (!isFinite(n) || n <= 0) return "¼";
  if (n >= 10) return String(Math.round(n));
  let whole = Math.floor(n);
  const frac = n - whole;
  let best = SNAPS[0];
  for (const s of SNAPS) {
    if (Math.abs(s[0] - frac) < Math.abs(best[0] - frac)) best = s;
  }
  if (best[0] === 1) whole += 1;
  const glyph = best[1];
  if (whole === 0) return glyph || "¼";
  return `${whole}${glyph}`;
}

// "1/2", "1.5", "2" -> number
export function parseQty(q) {
  if (typeof q === "number") return q;
  if (!q) return 1;
  const s = String(q).trim().replace(",", ".");
  const frac = s.match(/^(\d+)?\s*(\d+)\/(\d+)$/);
  if (frac) {
    const whole = frac[1] ? parseInt(frac[1], 10) : 0;
    return whole + parseInt(frac[2], 10) / parseInt(frac[3], 10);
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : 1;
}

// totalTime is free text ("30 דקות", "שעה", "1:30", ...). Returns minutes or null.
export function parseMinutes(text) {
  if (text === null || text === undefined) return null;
  const s = String(text);
  if (!/\d|שעה|שעתיים/.test(s)) return null;
  let minutes = 0;
  if (/שעתיים/.test(s)) minutes += 120;
  const colon = s.match(/(\d+):(\d{2})/);
  if (colon) return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);
  const hours = s.match(/(\d+(?:[.,]\d+)?)\s*(?:שעות|שעה|ש['׳]?)(?!\S*ני)/);
  if (hours) minutes += Math.round(parseFloat(hours[1].replace(",", ".")) * 60);
  else if (/(^|\s)שעה/.test(s) && !/שעתיים/.test(s)) minutes += 60;
  const mins = s.match(/(\d+)\s*(?:דקות|דקה|דק)/);
  if (mins) minutes += parseInt(mins[1], 10);
  else if (!hours && !/שעה|שעתיים/.test(s)) {
    const bare = s.match(/(\d+)/);
    if (bare) minutes += parseInt(bare[1], 10);
  }
  return minutes > 0 ? minutes : null;
}

export function timeLabel(minutes) {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes} דק׳`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ש׳ ${m} דק׳` : `${h} ש׳`;
}

export function recipeTimeLabel(recipe) {
  const m = parseMinutes(recipe?.totalTime);
  return m ? timeLabel(m) : "";
}

export function parseIngredients(raw) {
  try {
    let v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (typeof v === "string") v = JSON.parse(v);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

// Instructions are stored as {"1": "...", "2": "..."}; return an ordered array.
export function parseSteps(raw) {
  try {
    let v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (typeof v === "string") v = JSON.parse(v);
    if (Array.isArray(v)) return v.map(String).filter(Boolean);
    if (v && typeof v === "object") {
      return Object.keys(v)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => String(v[k]))
        .filter(Boolean);
    }
  } catch (e) {
    if (typeof raw === "string" && raw.trim()) {
      return raw.split("\n").filter((l) => l.trim());
    }
  }
  return [];
}

export function stepsToObject(steps) {
  const out = {};
  steps.forEach((s, i) => {
    out[i + 1] = s;
  });
  return out;
}

export const UNIT_MAP = {
  גרם: "גרם",
  גר: "גרם",
  'ק"ג': 'ק"ג',
  קילו: 'ק"ג',
  קילוגרם: 'ק"ג',
  ליטר: "ליטר",
  'מ"ל': 'מ"ל',
  כוס: "כוס",
  כוסות: "כוס",
  כף: "כף",
  כפות: "כף",
  כפית: "כפית",
  כפיות: "כפית",
  יחידה: "יחידה",
  יחידות: "יחידה",
  קורט: "קורט",
  שן: "שן",
  שיני: "שן",
  צרור: "צרור",
  צרורות: "צרור",
  חבילה: "חבילה",
  חבילות: "חבילה",
  קופסה: "קופסה",
  קופסאות: "קופסה",
  פחית: "קופסה",
  פחיות: "קופסה",
  פרוסה: "פרוסה",
  פרוסות: "פרוסה",
};

const KEYWORDS = [
  ["תבלינים", ["מלח", "כמון", "פפריקה", "כורכום", "קינמון", "פלפל שחור", "זעתר", "אורגנו", "הל"]],
  ["מוצרי חלב וביצים", ["חלב", "גבינ", "יוגורט", "ביצ", "חמאה", "שמנת", "פרמזן", "פטה", "לבנה", "קוטג"]],
  ["בשר ועוף", ["עוף", "בקר", "בשר", "הודו", "כרעיים", "שניצל", "טחון", "ירכיים"]],
  ["דגים", ["דג", "סלמון", "לברק", "טונה", "דניס", "בורי"]],
  ["לחם", ["לחם", "פית", "חלה", "לחמני", "בגט"]],
  // before "ממתקים" so sugar and cocoa land with the baking staples
  ["יבשים ואפייה", ["קמח", "סוכר", "אורז", "פסטה", "ספגטי", "קוסקוס", "בורגול", "סולת", "שיבולת", "עדשים", "אגוז", "שקד", "פיסטוק", "שמרים", "אבקת אפייה", "סודה לשתייה", "קקאו", "עמילן", "צימוקים"]],
  ["ממתקים", ["שוקולד", "עוגיות"]],
  ["קפה ותה", ["קפה", "תה"]],
  ["אלכוהול", ["יין", "בירה", "וודקה", "ערק"]],
  ["שימורים", ["שימור", "רסק", "קופסה", "חומוס", "תירס", "זיתים", "מלפפונים חמוצים"]],
  ["שמנים ורטבים", ["שמן", "חומץ", "סויה", "רוטב", "מיונז", "חרדל", "קטשופ"]],
  ["ממרחים", ["טחינה", "ריבה", "דבש", "שוקולד השחר", "חמאת בוטנים"]],
  ["פירות וירקות", ["עגבני", "מלפפ", "בצל", "שום", "תפוח", "לימון", "בננ", "תרד", "פטרוזיליה", "כוסברה", "גזר", "אבוקדו", "בזיליקום", "פלפל", "חסה", "קישוא", "חציל", "תות", "ענב", "נענע", "שמיר"]],
];

// Keyword-based guess; spices are checked first so "פלפל שחור" is not produce.
export function guessDepartment(name) {
  const n = name || "";
  for (const [dept, words] of KEYWORDS) {
    if (words.some((w) => n.includes(w))) return dept;
  }
  return "אחר";
}

// "חלב 2 ליטר" -> { name, quantity, unit, department }
export function parseIngredientLine(line) {
  const tokens = String(line)
    .trim()
    .replace(/״/g, '"')
    .split(/\s+/)
    .filter(Boolean);
  let quantity = null;
  let unit = null;
  const rest = [];
  for (const w of tokens) {
    if (quantity === null && /^\d+([.,]\d+)?$/.test(w)) {
      quantity = parseFloat(w.replace(",", "."));
      continue;
    }
    if (!unit && UNIT_MAP[w]) {
      unit = UNIT_MAP[w];
      continue;
    }
    rest.push(w);
  }
  const name = rest.join(" ");
  return {
    name,
    quantity: quantity || 1,
    unit: unit || "יחידה",
    department: guessDepartment(name),
  };
}

const GREETING_HOURS = [
  [5, "לילה טוב"],
  [12, "בוקר טוב"],
  [17, "צהריים טובים"],
  [22, "ערב טוב"],
];
export function greeting(date = new Date()) {
  const h = date.getHours();
  for (const [limit, text] of GREETING_HOURS) {
    if (h < limit) return text;
  }
  return "לילה טוב";
}

const MONTHS = [
  "בינואר",
  "בפברואר",
  "במרץ",
  "באפריל",
  "במאי",
  "ביוני",
  "ביולי",
  "באוגוסט",
  "בספטמבר",
  "באוקטובר",
  "בנובמבר",
  "בדצמבר",
];
const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export const dayName = (date) => `יום ${DAY_NAMES[date.getDay()]}`;
export const longDate = (date) =>
  `${dayName(date)}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
export const shortDate = (date) => `${date.getDate()}.${date.getMonth() + 1}`;

export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function nextDays(count = 7, from = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    return d;
  });
}

// Stable pastel tint for recipes without a photo.
export function tintFor(id, title = "") {
  let h = Number(id) || 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 360;
  return `hsl(${(h * 47) % 360}, 32%, 83%)`;
}

export function hasPhoto(image) {
  return typeof image === "string" && image.startsWith("file");
}

export function categoryList(recipe) {
  return recipe?.categoryNames ? recipe.categoryNames.split(",") : [];
}

const PLURAL_UNITS = {
  כוס: "כוסות",
  כף: "כפות",
  כפית: "כפיות",
  ליטר: "ליטרים",
  שן: "שיני", // "2 שיני שום"
  צרור: "צרורות",
  חבילה: "חבילות",
  קופסה: "קופסאות",
  פרוסה: "פרוסות",
};

// The unit as shown next to a quantity: abbreviations stay ("ק"ג"), spoons and
// cups go plural, and a plain "יחידה" is dropped. Written before a noun ("2 שיני
// שום") a clove is in the construct form; shown on its own (a quantity pill beside
// the name) it is "2 שיניים", so pass `standalone` there.
export function displayUnit(quantity, unit, standalone = false) {
  const u = singularUnits[unit] || unit || "";
  if (u === "יחידה") return "";
  if (quantity <= 1) return u;
  if (standalone && u === "שן") return "שיניים";
  return PLURAL_UNITS[u] || u;
}

// How much one tap on + or - changes a quantity, by unit.
const QTY_STEPS = { גרם: 50, 'מ"ל': 50, 'מ"ג': 50, 'ק"ג': 0.5, ליטר: 0.5, כוס: 0.25, כף: 0.5, כפית: 0.5 };
export const quantityStep = (unit) => QTY_STEPS[singularUnits[unit] || unit] ?? 1;

/**
 * One tap on + (direction 1) or - (-1). A value between two steps first snaps to
 * the next step in that direction (7.5 eggs -> 8 or 7); otherwise it moves by one.
 * Can return 0 or less: callers decide whether that means "remove".
 */
export function stepQuantity(quantity, unit, direction) {
  const step = quantityStep(unit);
  const ratio = quantity / step;
  const onGrid = Math.abs(ratio - Math.round(ratio)) < 1e-6;
  const next =
    direction > 0
      ? (onGrid ? Math.round(ratio) + 1 : Math.ceil(ratio)) * step
      : (onGrid ? Math.round(ratio) - 1 : Math.floor(ratio)) * step;
  return Math.round(next * 1000) / 1000;
}

export function parseJsonList(raw) {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

const FRIDGE_RULES = [
  [/סלט|חסה|טרי|אבוקדו/, 1],
  [/דג|לברק|סלמון|דניס|פנקייק|טוסט/, 2],
  [/מרק|תבשיל|קדרה|בשר|עוף|פסטה|אורז|מג.דרה|קציצ|לזניה|פשטידה/, 4],
];

// Days a finished dish keeps in the fridge: the stored (model-estimated) value,
// else a keyword guess, else 3.
export function fridgeDays(recipe) {
  if (recipe.fridge_days !== null && recipe.fridge_days !== undefined) {
    return recipe.fridge_days;
  }
  for (const [re, days] of FRIDGE_RULES) {
    if (re.test(recipe.title || "")) return days;
  }
  return 3;
}

// A DB row -> the shape the planner and lists work with.
export function normalizeRecipe(row) {
  return {
    id: row.id,
    title: row.title,
    image: row.image,
    cat: categoryList(row),
    tags: parseJsonList(row.tags),
    time: parseMinutes(row.totalTime) || 0,
    servings: row.servings || 4,
    fridge: fridgeDays(row),
    steps: parseSteps(row.instructions),
    row,
  };
}
