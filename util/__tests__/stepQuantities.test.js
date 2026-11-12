import { amountLabel, annotateStep } from "../stepQuantities";

const ings = [
  { name: "בשר טחון", label: "500 גרם" },
  { name: "בצל", label: "1 יחידה" },
  { name: "פטרוזיליה", label: "½ צרור" },
  { name: "ביצה", label: "1 יחידה" },
  { name: "שמן זית", label: "2 כפות" },
  { name: "שיני שום", label: "3 שיניים" },
  { name: "רוטב עגבניות", label: "400 גרם" },
  { name: "מלח", label: "" },
];

// Compact form for assertions: quantities in square brackets.
const flat = (parts) => parts.map((p) => (typeof p === "string" ? p : `[${p.qty}]`)).join("");

describe("annotateStep", () => {
  it("puts each amount after its ingredient, adjectives included", () => {
    expect(
      flat(annotateStep("מערבבים את הבשר הטחון עם הבצל המגורר, הפטרוזיליה והביצה, ויוצרים קציצות.", ings))
    ).toBe(
      "מערבבים את הבשר הטחון[500 גרם] עם הבצל המגורר[1 יחידה], הפטרוזיליה[½ צרור] והביצה[1 יחידה], ויוצרים קציצות."
    );
  });

  it("uses a short name when it points to one ingredient only", () => {
    expect(flat(annotateStep("מטגנים את השום בשמן הזית.", ings))).toBe(
      "מטגנים את השום[3 שיניים] בשמן הזית[2 כפות]."
    );
  });

  it("does not guess from a vague word", () => {
    expect(flat(annotateStep("מרתיחים את הרוטב ומכניסים את הקציצות.", ings))).toBe(
      "מרתיחים את הרוטב ומכניסים את הקציצות."
    );
  });

  it("leaves a mention alone when the step already states an amount", () => {
    expect(flat(annotateStep("מוסיפים 2 כפות שמן זית ומערבבים.", ings))).toBe(
      "מוסיפים 2 כפות שמן זית ומערבבים."
    );
    expect(flat(annotateStep("מוסיפים חצי מהבצל.", ings))).toBe("מוסיפים חצי מהבצל.");
  });

  it("still marks an ingredient that follows a cooking time", () => {
    expect(flat(annotateStep("אחרי 10 דקות מוסיפים את הבצל.", ings))).toBe(
      "אחרי 10 דקות מוסיפים את הבצל[1 יחידה]."
    );
  });

  it("handles plural and singular forms", () => {
    const list = [
      { name: "עגבניות", label: "4 יחידות" },
      { name: "ביצים", label: "3 יחידות" },
      { name: "לימון", label: "1 יחידה" },
    ];
    expect(flat(annotateStep("חותכים כל עגבנייה, טורפים את הביצים וסוחטים את הלימון.", list))).toBe(
      "חותכים כל עגבנייה[4 יחידות], טורפים את הביצים[3 יחידות] וסוחטים את הלימון[1 יחידה]."
    );
  });

  it("marks only the first mention and skips ingredients without an amount", () => {
    expect(flat(annotateStep("מוסיפים בצל ומלח. מערבבים את הבצל.", ings))).toBe(
      "מוסיפים בצל[1 יחידה] ומלח. מערבבים את הבצל."
    );
  });

  it("does not use a short name shared by two ingredients", () => {
    const list = [
      { name: "פפריקה מתוקה", label: "1 כף" },
      { name: "פפריקה חריפה", label: "1 כפית" },
    ];
    expect(flat(annotateStep("מוסיפים את הפפריקה.", list))).toBe("מוסיפים את הפפריקה.");
  });

  it("finds the ingredient behind a cut or a form", () => {
    const list = [
      { name: "כרעיים עוף", label: "1½ ק\"ג" },
      { name: "שמן זית", label: "3 כפות" },
      { name: "פפריקה מתוקה", label: "1 כף" },
      { name: "גבינת פטה", label: "100 גרם" },
    ];
    expect(flat(annotateStep("משפשפים את העוף בשמן, פפריקה ומלח ומניחים מעל.", list))).toBe(
      "משפשפים את העוף[1½ ק\"ג] בשמן[3 כפות], פפריקה[1 כף] ומלח ומניחים מעל."
    );
    expect(flat(annotateStep("מפוררים פטה מעל ומגישים.", list))).toBe("מפוררים פטה[100 גרם] מעל ומגישים.");
  });

  it("returns the text untouched when nothing matches", () => {
    expect(annotateStep("מחממים תנור.", ings)).toEqual(["מחממים תנור."]);
    expect(annotateStep("", ings)).toEqual([""]);
  });
});

describe("amountLabel", () => {
  it("formats amounts for a pill", () => {
    expect(amountLabel(500, "גרם")).toBe("500 גרם");
    expect(amountLabel(1, "יחידה")).toBe("1 יחידה");
    expect(amountLabel(3, "יחידה")).toBe("3 יחידות");
    expect(amountLabel(2, "כף")).toBe("2 כפות");
    expect(amountLabel(0, "גרם")).toBe("");
    expect(amountLabel("", "גרם")).toBe("");
  });
});
