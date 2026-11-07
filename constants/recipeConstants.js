export const departments = [
  { name: "פירות וירקות", image: require("../images/fruits.png") },
  { name: "בשר ועוף", image: require("../images/chicken.png") },
  { name: "דגים", image: require("../images/fish.png") },
  { name: "תבלינים", image: require("../images/spices.png") },
  { name: "מוצרי חלב וביצים", image: require("../images/milk-eggs.png") },
  { name: "ממרחים", image: require("../images/sauces.png") },
  { name: "קפה ותה", image: require("../images/coffee.png") },
  { name: "ממתקים", image: require("../images/sweets.png") },
  { name: "אלכוהול", image: require("../images/alcohol.png") },
  { name: "שימורים", image: require("../images/cans.png") },
  { name: "לחם", image: require("../images/bread.png") },
  // No illustration yet: DepartmentIcon draws a placeholder glyph until `image` is set.
  { name: "יבשים ואפייה", image: null, icon: "leaf" },
  { name: "שמנים ורטבים", image: require("../images/sauces.png") },
  { name: "אחר", image: require("../images/other.png") },
];

export const daysOfWeek = [
  "יום א'",
  "יום ב'",
  "יום ג'",
  "יום ד'",
  "יום ה'",
  "יום ו'",
  "יום ש'",
];

export const mealTypes = ["בוקר", "ביניים 1", "צהריים", "ביניים 2", "ערב"];

export const originalDaysOfWeek = [
  "יום ראשון",
  "יום שני",
  "יום שלישי",
  "יום רביעי",
  "יום חמישי",
  "יום שישי",
  "יום שבת",
];

export const mealTypeMap = {
  "ארוחת בוקר": "בוקר",
  "ארוחת ביניים 1": "ביניים 1",
  "ארוחת צהריים": "צהריים",
  "ארוחת ביניים 2": "ביניים 2",
  "ארוחת ערב": "ערב",
};
