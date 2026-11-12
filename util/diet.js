// Dietary preferences: which ingredients of a recipe do not suit the household.
// Pure logic, based only on ingredient names, so it is a helper and not a
// guarantee. The settings screen says so next to the allergy list.

export const DIET_STYLES = [
  { key: "all", label: "הכל" },
  { key: "vegetarian", label: "צמחוני" },
  { key: "vegan", label: "טבעוני" },
  { key: "pescatarian", label: "צמחוני עם דגים" },
];

export const ALLERGENS = [
  { key: "gluten", label: "גלוטן" },
  { key: "dairy", label: "חלב" },
  { key: "egg", label: "ביצים" },
  { key: "nuts", label: "אגוזים" },
  { key: "peanuts", label: "בוטנים" },
  { key: "sesame", label: "שומשום" },
  { key: "soy", label: "סויה" },
  { key: "fish", label: "דגים" },
];

const STYLE_KEYS = DIET_STYLES.map((s) => s.key);
const ALLERGEN_KEYS = ALLERGENS.map((a) => a.key);

const cleanList = (list) =>
  Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map((x) => String(x || "").trim().slice(0, 40))
        .filter(Boolean)
    )
  ).slice(0, 30);

export function normalizeDiet(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  return {
    style: STYLE_KEYS.includes(d.style) ? d.style : "all",
    kosher: !!d.kosher,
    noMeatDairy: !!d.noMeatDairy,
    allergies: ALLERGEN_KEYS.filter((k) => Array.isArray(d.allergies) && d.allergies.includes(k)),
    // Allergies outside the fixed list, and foods the household simply does not eat.
    otherAllergies: cleanList(d.otherAllergies),
    avoid: cleanList(d.avoid),
  };
}

export const hasDiet = (diet) =>
  !!diet &&
  (diet.style !== "all" ||
    diet.kosher ||
    diet.noMeatDairy ||
    diet.allergies.length > 0 ||
    diet.otherAllergies.length > 0 ||
    diet.avoid.length > 0);

// Each group: words that mark an ingredient, and phrases that look like a match
// but are not (coconut milk is not dairy, nutmeg is not a nut).
const GROUPS = {
  meat: {
    words: [
      "בשר", "עוף", "עופות", "הודו", "בקר", "כבש", "טלה", "עגל", "אנטריקוט", "סינטה",
      "אסאדו", "שניצל", "נקניק", "נקניקיה", "נקניקייה", "קבב", "המבורגר", "פרגית", "פרגיות",
      "כרעיים", "כרעי", "שוקיים", "כנפיים", "כנפי", "כבד", "כבדי", "לבבות", "פסטרמה", "סלמי",
      "שווארמה", "אווז", "ברווז", "צלעות", "אוסובוקו", "שפונדרה", "בריסקט", "פילה בקר",
      "קורנדביף", "מרגז", "צ׳וריסו", "צוריסו", "שייטל",
    ],
    not: ["בשר קוקוס", "בשר מן הצומח", "חזה חציל"],
  },
  pork: {
    words: ["חזיר", "בייקון", "פרושוטו", "פנצ׳טה", "פנצטה", "חמון", "שינקן", "בשר לבן", "קותלי"],
    not: [],
  },
  fish: {
    words: [
      "דג", "דגים", "דגי", "סלמון", "טונה", "אמנון", "מושט", "דניס", "לברק", "בורי", "בקלה",
      "הרינג", "סרדין", "סרדינים", "אנשובי", "פורל", "לוקוס", "מוסר", "טילאפיה", "נסיכה",
      "נסיכת", "קרפיון", "מקרל", "פלמידה", "דג סול", "זהבון", "אינטיאס", "ברמונדי", "קוויאר",
      "רוטב דגים", "ווסטרשייר", "וורצ׳סטר",
    ],
    not: [],
  },
  seafood: {
    words: [
      "שרימפס", "שרימפ", "חסילון", "חסילונים", "קלמרי", "תמנון", "צדפה", "צדפות", "מולים",
      "סרטן", "סרטנים", "לובסטר", "סקאלופ", "סקאלופס", "דיונון", "פירות ים", "רוטב צדפות",
    ],
    not: [],
  },
  gelatin: { words: ["ג׳לטין", "גלטין"], not: ["ג׳לטין צמחי", "גלטין צמחי"] },
  dairy: {
    words: [
      "חלב", "חלבי", "חמאה", "חמאת", "שמנת", "גבינה", "גבינת", "גבינות", "יוגורט", "קוטג׳",
      "קוטג", "^לבנה", "לאבנה", "מוצרלה", "פרמזן", "פטה", "ריקוטה", "מסקרפונה", "צ׳דר", "צדר",
      "בולגרית", "צפתית", "קשקבל", "גאודה", "חלומי", "רוקפור", "קממבר", "גבנ״צ", "קצפת", "אשל",
      "ריוויון", "גלידה", "גהי", "קרם פרש", "שמנת חמוצה", "מעדן חלב", "אבקת חלב", "טוב טעם",
      "עמק", "גורגונזולה", "פקורינו", "מנצ׳גו", "בורטה",
    ],
    not: [
      "חלב קוקוס", "חלב שקדים", "חלב סויה", "חלב שיבולת שועל", "חלב אורז", "חלב צמחי",
      "חלב אגוזים", "חלב קשיו", "חמאת בוטנים", "חמאת קקאו", "חמאת שקדים", "חמאת קשיו",
      "חמאת אגוזים", "חמאת שומשום", "שמנת קוקוס", "שמנת סויה", "שמנת צמחית", "שמנת שיבולת שועל",
      "שמנת פרווה", "קרם קוקוס",
    ],
  },
  egg: {
    words: ["ביצה", "ביצים", "ביצי", "ביצת", "חלמון", "חלמונים", "חלמוני", "חלבון", "חלבונים", "מיונז"],
    not: ["אבקת חלבון", "חלבון סויה", "חלבון אפונה"],
  },
  honey: { words: ["דבש"], not: ["דבש תמרים", "דבש מייפל"] },
  gluten: {
    words: [
      "קמח", "חיטה", "סולת", "בורגול", "קוסקוס", "פסטה", "ספגטי", "פנה", "פוזילי", "לזניה",
      "לזנייה", "אטריות", "נודלס", "לחם", "פיתה", "פיתות", "חלה", "פירורי לחם", "פנקו", "קרקר",
      "קרקרים", "ביסקוויט", "ביסקוויטים", "פתיתים", "שעורה", "גריסים", "שיפון", "כוסמין",
      "שיבולת שועל", "קוואקר", "בצק", "טורטייה", "טורטיות", "מצה", "מצות", "רוטב סויה", "בירה",
      "סייטן", "פריקי", "פריקה", "לאפה", "בגט", "קרוטונים", "שקדי מרק", "אורזו", "ניוקי",
      "רביולי", "טורטליני", "פטיבר", "לחמניה", "לחמנייה", "לחמניות", "קמח מצה",
    ],
    not: [
      "קמח שקדים", "קמח קוקוס", "קמח תירס", "קמח אורז", "קמח חומוס", "קמח תפוחי אדמה",
      "קמח טפיוקה", "קמח כוסמת", "קמח עדשים", "אטריות אורז", "אטריות שעועית", "פסטה אורז",
      "טורטיית תירס", "טורטיות תירס",
    ],
  },
  nuts: {
    words: [
      "אגוז", "אגוזים", "אגוזי", "שקד", "שקדים", "קשיו", "פקאן", "פקאנים", "פיסטוק", "פיסטוקים",
      "לוז", "מקדמיה", "ערמון", "ערמונים", "צנובר", "צנוברים", "מרציפן", "נוטלה", "פרלינה",
      "פרלין",
    ],
    not: ["אגוז מוסקט", "אגוז קוקוס", "שקדי מרק"],
  },
  peanuts: { words: ["בוטן", "בוטנים", "בוטני", "במבה"], not: [] },
  sesame: {
    words: ["שומשום", "סומסום", "טחינה", "חלבה", "חלווה", "זעתר"],
    not: [],
  },
  soy: { words: ["סויה", "טופו", "אדממה", "מיסו", "טמפה", "טריאקי"], not: [] },
};

const HEB = "א-ת";
// Plural and construct endings a listed word may carry ("דג" also finds "דגים").
const SUFFIX = "(?:ים|ות|י|יות)?";
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function wordRegex(word) {
  const anchored = word.startsWith("^");
  const w = escapeRe(anchored ? word.slice(1) : word);
  const before = anchored ? "^" : `(?:^|[^${HEB}])[והבל]?`;
  return new RegExp(`${before}${w}${SUFFIX}(?=$|[^${HEB}])`);
}

const COMPILED = Object.fromEntries(
  Object.entries(GROUPS).map(([key, g]) => [
    key,
    { words: g.words.map(wordRegex), not: g.not.map((n) => new RegExp(escapeRe(n), "g")) },
  ])
);

// Niqqud off, the two apostrophe styles unified, spaces collapsed.
export const cleanName = (name) =>
  String(name || "")
    .replace(/[֑-ׇ]/g, "")
    .replace(/['’`]/g, "׳")
    .replace(/\s+/g, " ")
    .trim();

const ANIMAL = ["meat", "pork", "fish", "seafood", "gelatin", "dairy", "egg", "honey"];

/** Which groups an ingredient name belongs to, for example { dairy: true }. */
export function ingredientGroups(name) {
  const text = cleanName(name);
  const out = {};
  if (!text) return out;
  const gf = /ללא גלוטן|נטול גלוטן/.test(text);
  const vegan = /טבעוני|מן הצומח|פרווה/.test(text);
  const veggie = vegan || /צמחוני/.test(text);
  for (const [key, g] of Object.entries(COMPILED)) {
    if (key === "gluten" && gf) continue;
    if (vegan && ANIMAL.includes(key)) continue;
    if (veggie && ["meat", "pork", "fish", "seafood"].includes(key)) continue;
    let rest = text;
    for (const n of g.not) rest = rest.replace(n, " ");
    if (g.words.some((re) => re.test(rest))) out[key] = true;
  }
  return out;
}

const ALLERGY_REASON = {
  gluten: "מכיל גלוטן",
  dairy: "מכיל חלב",
  egg: "מכיל ביצים",
  nuts: "מכיל אגוזים",
  peanuts: "מכיל בוטנים",
  sesame: "מכיל שומשום",
  soy: "מכיל סויה",
  fish: "מכיל דגים",
};

const containsWord = (text, word) => {
  const w = cleanName(word);
  return !!w && new RegExp(`(?:^|[^${HEB}])[והבל]?${escapeRe(w)}`).test(text);
};

// The first reason an ingredient does not fit, or null. `meaty` says whether the
// recipe has meat, for the "no meat with dairy" rule.
function reasonFor(name, diet, meaty) {
  const g = ingredientGroups(name);
  const text = cleanName(name);
  for (const key of diet.allergies) {
    if (g[key]) return ALLERGY_REASON[key];
  }
  for (const other of diet.otherAllergies) {
    if (containsWord(text, other)) return `מכיל ${other}`;
  }
  if (diet.kosher && (g.pork || g.seafood)) return "לא כשר";
  const flesh = g.meat || g.pork || g.gelatin;
  if (diet.style === "vegan") {
    if (flesh || g.fish || g.seafood || g.dairy || g.egg || g.honey) return "לא טבעוני";
  } else if (diet.style === "vegetarian") {
    if (flesh || g.fish || g.seafood) return "לא צמחוני";
  } else if (diet.style === "pescatarian") {
    if (flesh) return "לא צמחוני";
  }
  // Kosher keeps meat and dairy apart, so it implies the separate toggle.
  if ((diet.noMeatDairy || diet.kosher) && meaty && g.dairy) return "חלבי במתכון בשרי";
  for (const word of diet.avoid) {
    if (containsWord(text, word)) return "לא אוכלים אצלנו";
  }
  return null;
}

/**
 * names: the recipe's ingredient names, in order.
 * Returns { [index]: reason } for the ingredients that do not suit `diet`.
 */
export function dietConflicts(names, diet) {
  const out = {};
  if (!hasDiet(diet)) return out;
  const meaty = names.some((n) => {
    const g = ingredientGroups(n);
    return g.meat || g.pork;
  });
  names.forEach((name, i) => {
    const reason = reasonFor(name, diet, meaty);
    if (reason) out[i] = reason;
  });
  return out;
}

/** Does one name (a suggested substitute, say) suit the diet inside this recipe? */
export function suitsDiet(name, diet, otherNames = []) {
  if (!hasDiet(diet)) return true;
  const meaty = otherNames.some((n) => {
    const g = ingredientGroups(n);
    return g.meat || g.pork;
  });
  return !reasonFor(name, diet, meaty);
}

const label = (list, key) => list.find((x) => x.key === key)?.label;

/** Short Hebrew parts, for example ["צמחוני", "כשר", "אלרגיה לאגוזים"]. */
export function dietParts(diet) {
  if (!hasDiet(diet)) return [];
  const parts = [];
  if (diet.style !== "all") parts.push(label(DIET_STYLES, diet.style));
  if (diet.kosher) parts.push("כשר");
  if (diet.noMeatDairy) parts.push("בלי בשר וחלב יחד");
  for (const key of diet.allergies) parts.push(`אלרגיה ל${label(ALLERGENS, key)}`);
  for (const other of diet.otherAllergies) parts.push(`אלרגיה ל${other}`);
  for (const word of diet.avoid) parts.push(`בלי ${word}`);
  return parts;
}
