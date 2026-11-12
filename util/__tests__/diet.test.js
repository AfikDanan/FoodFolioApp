import {
  dietConflicts,
  dietParts,
  hasDiet,
  ingredientGroups,
  normalizeDiet,
  suitsDiet,
} from "../diet";

const diet = (d) => normalizeDiet(d);
const groups = (name) => Object.keys(ingredientGroups(name)).sort();

describe("ingredientGroups", () => {
  it("recognises meat, fish, dairy and eggs", () => {
    expect(groups("חזה עוף")).toEqual(["meat"]);
    expect(groups("בשר טחון")).toEqual(["meat"]);
    expect(groups("פילה סלמון")).toEqual(["fish"]);
    expect(groups("דגים לבנים")).toEqual(["fish"]);
    expect(groups("שמנת מתוקה")).toEqual(["dairy"]);
    expect(groups("גבינה לבנה")).toEqual(["dairy"]);
    expect(groups("ביצים")).toEqual(["egg"]);
    expect(groups("שרימפס")).toEqual(["seafood"]);
    expect(groups("בייקון")).toEqual(["pork"]);
  });

  it("does not confuse look-alikes", () => {
    expect(groups("חלב קוקוס")).toEqual([]);
    expect(groups("חמאת בוטנים")).toEqual(["peanuts"]);
    expect(groups("אגוז מוסקט")).toEqual([]);
    expect(groups("דגנים מלאים")).toEqual([]);
    expect(groups("שעועית לבנה")).toEqual([]);
    expect(groups("דבש תמרים")).toEqual([]);
    expect(groups("קמח שקדים")).toEqual(["nuts"]);
    expect(groups("שמן זית")).toEqual([]);
    expect(groups("חלבה")).toEqual(["sesame"]);
    expect(groups("שקדי מרק")).toEqual(["gluten"]);
  });

  it("trusts a name that says it is vegan or gluten free", () => {
    expect(groups("שניצל טבעוני")).toEqual([]);
    expect(groups("גבינה טבעונית")).toEqual([]);
    expect(groups("פסטה ללא גלוטן")).toEqual([]);
    expect(groups("נקניקיות צמחוניות")).toEqual([]);
  });

  it("handles plurals, prefixes and both apostrophe styles", () => {
    expect(groups("אגוזי מלך")).toEqual(["nuts"]);
    expect(groups("מלח ופלפל")).toEqual([]);
    expect(groups("לחם ושמנת")).toEqual(["dairy", "gluten"]);
    expect(groups("צ'דר מגורר")).toEqual(["dairy"]);
    expect(groups("רוטב סויה")).toEqual(["gluten", "soy"]);
  });
});

describe("dietConflicts", () => {
  const pasta = ["חזה עוף", "פסטה פנה", "שמנת מתוקה", "אגוזי מלך", "שום"];

  it("is empty without preferences", () => {
    expect(hasDiet(diet({}))).toBe(false);
    expect(dietConflicts(pasta, diet({}))).toEqual({});
  });

  it("flags meat for a vegetarian and nuts for a nut allergy", () => {
    expect(dietConflicts(pasta, diet({ style: "vegetarian", allergies: ["nuts"] }))).toEqual({
      0: "לא צמחוני",
      3: "מכיל אגוזים",
    });
  });

  it("flags animal products for a vegan", () => {
    expect(dietConflicts(["ביצים", "דבש", "חלב", "קמח", "טופו"], diet({ style: "vegan" }))).toEqual({
      0: "לא טבעוני",
      1: "לא טבעוני",
      2: "לא טבעוני",
    });
  });

  it("lets a pescatarian keep fish but not meat", () => {
    expect(dietConflicts(["סלמון", "עוף"], diet({ style: "pescatarian" }))).toEqual({
      1: "לא צמחוני",
    });
  });

  it("applies kosher rules", () => {
    expect(dietConflicts(["שרימפס", "בייקון", "עוף"], diet({ kosher: true }))).toEqual({
      0: "לא כשר",
      1: "לא כשר",
    });
    expect(dietConflicts(pasta, diet({ noMeatDairy: true }))).toEqual({ 2: "חלבי במתכון בשרי" });
    // Dairy alone is fine.
    expect(dietConflicts(["פסטה", "שמנת מתוקה"], diet({ noMeatDairy: true }))).toEqual({});
  });

  it("matches custom allergies and avoided foods by name", () => {
    const d = diet({ otherAllergies: ["חרדל"], avoid: ["כוסברה", "פטריות"] });
    expect(dietConflicts(["חרדל דיז׳ון", "כוסברה קצוצה", "פטריות שמפיניון", "בצל"], d)).toEqual({
      0: "מכיל חרדל",
      1: "לא אוכלים אצלנו",
      2: "לא אוכלים אצלנו",
    });
  });
});

describe("suitsDiet and dietParts", () => {
  it("checks a single suggestion", () => {
    const d = diet({ style: "vegetarian" });
    expect(suitsDiet("טופו קשה", d)).toBe(true);
    expect(suitsDiet("חזה הודו", d)).toBe(false);
    expect(suitsDiet("שמנת", diet({ noMeatDairy: true }), ["עוף"])).toBe(false);
  });

  it("describes the preferences in Hebrew", () => {
    expect(
      dietParts(diet({ style: "vegetarian", kosher: true, allergies: ["nuts"], avoid: ["כוסברה"] }))
    ).toEqual(["צמחוני", "כשר", "אלרגיה לאגוזים", "בלי כוסברה"]);
    expect(dietParts(diet({}))).toEqual([]);
  });

  it("drops unknown values when normalising", () => {
    expect(normalizeDiet({ style: "keto", allergies: ["nuts", "x"], avoid: [" ", "בצל", "בצל"] })).toEqual({
      style: "all",
      kosher: false,
      noMeatDairy: false,
      allergies: ["nuts"],
      otherAllergies: [],
      avoid: ["בצל"],
    });
  });
});
