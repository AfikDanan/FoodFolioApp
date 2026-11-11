import {
  formatQty,
  parseMinutes,
  timeLabel,
  parseIngredientLine,
  parseSteps,
  parseQty,
  guessDepartment,
  greeting,
  dateKey,
} from "../recipeUtils";
import { mergeItems } from "../shopping";

jest.mock("../database", () => ({
  fetchShoppingList: jest.fn(),
  saveShoppingList: jest.fn(),
}));

describe("formatQty", () => {
  it("snaps fractions and rounds large values", () => {
    expect(formatQty(1.5)).toBe("1½");
    expect(formatQty(0.75)).toBe("¾");
    expect(formatQty(2.34)).toBe("2⅓");
    expect(formatQty(0.9)).toBe("1");
    expect(formatQty(12.4)).toBe("12");
    expect(formatQty(0)).toBe("¼");
  });
});

describe("parseQty", () => {
  it("handles decimals and fractions", () => {
    expect(parseQty("0.50")).toBe(0.5);
    expect(parseQty("1/2")).toBe(0.5);
    expect(parseQty("1 1/2")).toBe(1.5);
    expect(parseQty(3)).toBe(3);
  });
});

describe("parseMinutes / timeLabel", () => {
  it("reads common Hebrew time strings", () => {
    expect(parseMinutes("30 דקות")).toBe(30);
    expect(parseMinutes("45")).toBe(45);
    expect(parseMinutes("שעה")).toBe(60);
    expect(parseMinutes("שעתיים")).toBe(120);
    expect(parseMinutes("1 שעה 20 דקות")).toBe(80);
    expect(parseMinutes("1:30")).toBe(90);
    expect(parseMinutes("לא צוין")).toBeNull();
  });
  it("formats labels", () => {
    expect(timeLabel(40)).toBe("40 דק׳");
    expect(timeLabel(60)).toBe("1 ש׳");
    expect(timeLabel(80)).toBe("1 ש׳ 20 דק׳");
  });
});

describe("parseIngredientLine", () => {
  it("extracts quantity, unit and name", () => {
    expect(parseIngredientLine("חלב 2 ליטר")).toMatchObject({
      name: "חלב",
      quantity: 2,
      unit: "ליטר",
      department: "מוצרי חלב וביצים",
    });
    expect(parseIngredientLine("3 כוסות קמח")).toMatchObject({ name: "קמח", quantity: 3, unit: "כוס" });
    expect(parseIngredientLine("עגבניות")).toMatchObject({ quantity: 1, unit: "יחידה" });
  });
  it("puts spices before produce", () => {
    expect(guessDepartment("פלפל שחור")).toBe("תבלינים");
    expect(guessDepartment("פלפל אדום")).toBe("פירות וירקות");
  });
});

describe("parseSteps", () => {
  it("orders object steps numerically", () => {
    expect(parseSteps('{"2":"b","10":"c","1":"a"}')).toEqual(["a", "b", "c"]);
  });
});

describe("misc", () => {
  it("greets by hour", () => {
    expect(greeting(new Date(2026, 0, 1, 8))).toBe("בוקר טוב");
    expect(greeting(new Date(2026, 0, 1, 14))).toBe("צהריים טובים");
    expect(greeting(new Date(2026, 0, 1, 19))).toBe("ערב טוב");
    expect(greeting(new Date(2026, 0, 1, 23))).toBe("לילה טוב");
  });
  it("makes ISO date keys", () => {
    expect(dateKey(new Date(2026, 10, 3))).toBe("2026-11-03");
  });
});

describe("mergeItems", () => {
  it("merges unchecked items by name+unit and adds the quantities", () => {
    const list = [{ name: "חלב", unit: "ליטר", quantity: 1, checked: false }];
    const out = mergeItems(list, [
      { name: "חלב", unit: "ליטר", quantity: 2 },
      { name: "קמח", unit: "כוס", quantity: 1 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ quantity: 3 });
  });
  it("does not merge into checked items", () => {
    const list = [{ name: "חלב", unit: "ליטר", quantity: 1, checked: true }];
    expect(mergeItems(list, [{ name: "חלב", unit: "ליטר", quantity: 1 }])).toHaveLength(2);
  });
});

describe("displayUnit", () => {
  const { displayUnit } = require("../recipeUtils");
  it("keeps abbreviations, pluralises spoons and cups, drops plain units", () => {
    expect(displayUnit(1.5, 'ק"ג')).toBe('ק"ג');
    expect(displayUnit(1.5, "קילוגרם")).toBe('ק"ג');
    expect(displayUnit(3, "כף")).toBe("כפות");
    expect(displayUnit(1, "כף")).toBe("כף");
    expect(displayUnit(2, "כוסות")).toBe("כוסות");
    expect(displayUnit(4, "יחידה")).toBe("");
  });
});

describe("aisles and clean names", () => {
  const { guessDepartment, parseIngredientLine, displayUnit } = require("../recipeUtils");
  it("sends baking staples to their own aisle and oils to oils and sauces", () => {
    expect(guessDepartment("קמח")).toBe("יבשים ואפייה");
    expect(guessDepartment("אורז בסמטי")).toBe("יבשים ואפייה");
    expect(guessDepartment("ספגטי")).toBe("יבשים ואפייה");
    expect(guessDepartment("סוכר")).toBe("יבשים ואפייה");
    expect(guessDepartment("שמן זית")).toBe("שמנים ורטבים");
    expect(guessDepartment("טחינה")).toBe("ממרחים");
    expect(guessDepartment("שוקולד מריר")).toBe("ממתקים");
    expect(guessDepartment("שמנת מתוקה")).toBe("מוצרי חלב וביצים");
  });
  it("keeps the name clean and the clove as a unit", () => {
    expect(parseIngredientLine("2 שיני שום")).toMatchObject({ name: "שום", quantity: 2, unit: "שן" });
    expect(parseIngredientLine("צרור פטרוזיליה")).toMatchObject({ name: "פטרוזיליה", unit: "צרור" });
  });
  it("reads back naturally", () => {
    expect(displayUnit(2, "שן")).toBe("שיני");
    expect(displayUnit(1, "שן")).toBe("שן");
    expect(displayUnit(3, "צרור")).toBe("צרורות");
    expect(displayUnit(2, "קופסה")).toBe("קופסאות");
  });
});

describe("stepQuantity", () => {
  const { stepQuantity, quantityStep } = require("../recipeUtils");
  it("steps by a sensible amount for each unit", () => {
    expect(quantityStep("גרם")).toBe(50);
    expect(quantityStep('ק"ג')).toBe(0.5);
    expect(quantityStep("כוס")).toBe(0.25);
    expect(quantityStep("יחידה")).toBe(1);
    expect(quantityStep("שן")).toBe(1);
  });
  it("moves on the grid and snaps odd values to the next step", () => {
    expect(stepQuantity(2, "ליטר", 1)).toBe(2.5);
    expect(stepQuantity(2, "ליטר", -1)).toBe(1.5);
    expect(stepQuantity(7.5, "יחידה", 1)).toBe(8);
    expect(stepQuantity(7.5, "יחידה", -1)).toBe(7);
    expect(stepQuantity(250, "גרם", 1)).toBe(300);
    expect(stepQuantity(0.75, "כוס", 1)).toBe(1);
  });
  it("can reach zero, which callers treat as remove", () => {
    expect(stepQuantity(1, "יחידה", -1)).toBe(0);
  });
});

describe("shoppingListToText", () => {
  const { shoppingListToText } = require("../shopping");
  const items = [
    { name: "חלב", quantity: 2, unit: "ליטר", department: "מוצרי חלב וביצים", checked: false },
    { name: "עגבניות", quantity: 6, unit: "יחידה", department: "פירות וירקות", checked: false },
    { name: "קמח", quantity: 1, unit: "כוס", department: "יבשים ואפייה", checked: true },
    { name: "שום", quantity: 2, unit: "שן", department: "פירות וירקות", checked: false },
  ];
  it("lists what is still needed as a checklist, grouped by aisle in store order", () => {
    expect(shoppingListToText(items)).toBe(
      [
        "🛒 רשימת קניות",
        "",
        "*פירות וירקות*",
        "☐ עגבניות – 6",
        "☐ שום – 2 שיניים",
        "",
        "*מוצרי חלב וביצים*",
        "☐ חלב – 2 ליטרים",
      ].join("\n")
    );
  });
  it("is empty when everything is checked off or there is nothing", () => {
    expect(shoppingListToText(items.map((i) => ({ ...i, checked: true })))).toBe("");
    expect(shoppingListToText([])).toBe("");
  });
});

describe("normalizeMeals", () => {
  const { normalizeMeals, MEAL_PRESETS } = require("../mealSettings");
  it("keeps known meals in day order and never returns fewer than one", () => {
    expect(normalizeMeals(["ערב", "בוקר", "x"])).toEqual(["בוקר", "ערב"]);
    expect(normalizeMeals([])).toEqual(["בוקר", "צהריים", "ערב"]);
    expect(normalizeMeals(null)).toEqual(["בוקר", "צהריים", "ערב"]);
  });
  it("offers 2, 3 and 5 meal presets", () => {
    expect(MEAL_PRESETS.map((p) => p.meals.length)).toEqual([2, 3, 5]);
  });
});

describe("sourceInfo", () => {
  const { sourceInfo } = require("../recipeUtils");
  it.each([
    ["https://www.instagram.com/reel/C1abc/", "אינסטגרם", "logo-instagram"],
    ["https://vm.tiktok.com/ZMabc/", "טיקטוק", "logo-tiktok"],
    ["https://youtu.be/abc", "יוטיוב", "logo-youtube"],
    ["https://www.10dakot.co.il/recipe/x", "10dakot.co.il", "link-outline"],
  ])("%s", (url, label, icon) => {
    expect(sourceInfo(url)).toEqual({ url, label, icon });
  });

  it.each([null, "", "not a link", "javascript:alert(1)", "file:///etc/passwd"])(
    "ignores %s",
    (url) => {
      expect(sourceInfo(url)).toBeNull();
    }
  );
});
