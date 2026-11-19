import { ingredientGroups, ingredientsToText, textToIngredients, parseIngredientLine } from "../recipeUtils";
import { annotateStep, stepIngredientsFor, stepStages } from "../stepQuantities";
import { recipesToText } from "../recipeBook";
import { mergeItems, recipeToShoppingItems } from "../shopping";

// A cake with sugar in the batter and in the topping.
const cake = [
  { name: "קמח", quantity: 2, unit: "כוס", department: "יבשים ואפייה", group: "לבצק" },
  { name: "סוכר", quantity: 1, unit: "כוס", department: "יבשים ואפייה", group: "לבצק" },
  { name: "ביצים", quantity: 3, unit: "יחידה", department: "מוצרי חלב וביצים", group: "לבצק" },
  { name: "שמנת מתוקה", quantity: 250, unit: 'מ"ל', department: "מוצרי חלב וביצים", group: "לקרם" },
  { name: "סוכר", quantity: 0.5, unit: "כוס", department: "יבשים ואפייה", group: "לקרם" },
];
const steps = [
  "מכינים את הבצק: מערבבים קמח, סוכר וביצים.",
  "אופים 30 דקות ומצננים.",
  "מקציפים את השמנת עם הסוכר לקרם יציב.",
  "מורחים את הקרם על העוגה.",
];

describe("parts of a dish", () => {
  it("groups ingredients by part, keeping their indexes", () => {
    const groups = ingredientGroups(cake);
    expect(groups.map((g) => g.name)).toEqual(["לבצק", "לקרם"]);
    expect(groups[1].items.map((x) => x.index)).toEqual([3, 4]);
    expect(ingredientGroups([{ name: "מלח" }])).toEqual([{ name: null, items: [{ ing: { name: "מלח" }, index: 0 }] }]);
  });

  it("round-trips through the edit text with headings ending in a colon", () => {
    const line = (i) => `${i.quantity} ${i.unit} ${i.name}`;
    const text = ingredientsToText(cake, line);
    expect(text.split("\n")[0]).toBe("לבצק:");
    expect(text).toContain("לקרם:\n250");
    const back = textToIngredients(text, parseIngredientLine);
    expect(back.map((i) => [i.name, i.group])).toEqual(cake.map((i) => [i.name, i.group]));
    expect(textToIngredients("2 כוס קמח\nלציפוי:\n1 כוס סוכר", parseIngredientLine).map((i) => i.group)).toEqual([
      undefined,
      "לציפוי",
    ]);
  });

  it("knows which part each step is in", () => {
    expect(stepStages(steps, cake)).toEqual(["לבצק", "לבצק", "לקרם", "לקרם"]);
    expect(stepStages(steps, [{ name: "סוכר" }])).toEqual([null, null, null, null]);
  });

  it("shows the amount of the right part inside a step", () => {
    const ings = stepIngredientsFor(cake);
    const stages = stepStages(steps, cake);
    const pills = (i) => annotateStep(steps[i], ings, stages[i]).filter((p) => typeof p !== "string").map((p) => p.qty);
    expect(pills(0)).toEqual(["2 כוסות", "1 כוס", "3 יחידות"]);
    expect(pills(2)).toEqual(["250 מ\"ל", "½ כוס"]);
    // Without knowing the part, a shared ingredient shows no amount rather than a wrong one.
    expect(annotateStep(steps[0], ings, null).filter((p) => typeof p !== "string").map((p) => p.qty)).toEqual([
      "2 כוסות",
      "3 יחידות",
    ]);
  });

  it("adds the parts up on the shopping list", () => {
    const items = mergeItems([], recipeToShoppingItems({ ingredients: JSON.stringify(cake) }));
    expect(items.find((i) => i.name === "סוכר").quantity).toBe(1.5);
    expect(items.filter((i) => i.name === "סוכר")).toHaveLength(1);
  });

  it("writes the parts in the shared text", () => {
    const text = recipesToText([
      { id: 1, title: "עוגה", servings: 8, ingredients: JSON.stringify(cake), instructions: JSON.stringify(steps) },
    ]);
    expect(text).toContain("לבצק:\n• 2 כוסות קמח");
    expect(text).toContain("לקרם:\n• 250 מ\"ל שמנת מתוקה");
  });
});
