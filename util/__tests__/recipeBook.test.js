import { escapeHtml, recipeData, recipesToHtml, recipesToText, toBase64Utf8 } from "../recipeBook";

const ROWS = [
  {
    id: 1,
    title: "שקשוקה ירוקה",
    servings: 2,
    totalTime: "25 דקות",
    ingredients: JSON.stringify([
      { name: "ביצים", quantity: 4, unit: "יחידה", department: "מוצרי חלב וביצים" },
      { name: "תרד", quantity: 200, unit: "גרם", department: "פירות וירקות" },
      { name: "שמנת מתוקה", quantity: "1/2", unit: "כוס", department: "מוצרי חלב וביצים", optional: true },
    ]),
    instructions: JSON.stringify({ 1: "מחממים מחבת עם שמן זית.", 2: "מוסיפים תרד ומבשלים 5 דקות.", 3: "שוברים ביצים ומכסים 8 דקות." }),
    tags: JSON.stringify(["צמחוני", "מחבת אחת"]),
    categoryNames: "ארוחות בוקר",
    source_url: "https://www.instagram.com/reel/C1abc/",
  },
  {
    id: 2,
    title: 'עוגת גזר "של סבתא" <מיוחדת>',
    servings: 12,
    totalTime: "שעה",
    ingredients: JSON.stringify([
      { name: "קמח", quantity: 2, unit: "כוס", department: "יבשים ואפייה" },
      { name: "גזר", quantity: 3, unit: "יחידה", department: "פירות וירקות" },
    ]),
    instructions: JSON.stringify({ 1: "מערבבים הכל.", 2: "אופים 40 דקות ב-180 מעלות." }),
    tags: "[]",
    categoryNames: "קינוחים",
  },
  {
    id: 3,
    title: "סלט עדשים 🥗",
    servings: 4,
    totalTime: "לא צוין",
    ingredients: JSON.stringify([{ name: "עדשים ירוקות", quantity: 1, unit: "כוס", department: "יבשים ואפייה" }]),
    instructions: JSON.stringify(["מבשלים עדשים 20 דקות."]),
    tags: null,
    categoryNames: null,
  },
];

const decode = (b64) => JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
const blocks = (html) => [...html.matchAll(/#FFREC1#<\/div>\s*<div[^>]*>([A-Za-z0-9+/=]+)<\/div>/g)].map((m) => m[1]);

describe("toBase64Utf8", () => {
  it.each(["", "a", "ab", "abc", "שלום עולם", "🥗 emoji", 'quotes " and \\ backslash'])("%s", (s) => {
    expect(toBase64Utf8(s)).toBe(Buffer.from(s, "utf8").toString("base64"));
  });
});

describe("recipeData", () => {
  it("turns a stored row into clean data", () => {
    const d = recipeData(ROWS[0]);
    expect(d).toMatchObject({
      v: 1,
      title: "שקשוקה ירוקה",
      servings: 2,
      total_time: "25 דקות",
      total_minutes: 25,
      category: "ארוחות בוקר",
      source_url: "https://www.instagram.com/reel/C1abc/",
      tags: ["צמחוני", "מחבת אחת"],
      steps: ["מחממים מחבת עם שמן זית.", "מוסיפים תרד ומבשלים 5 דקות.", "שוברים ביצים ומכסים 8 דקות."],
    });
    expect(d.ingredients[2]).toEqual({
      name: "שמנת מתוקה",
      quantity: 0.5,
      unit: "כוס",
      department: "מוצרי חלב וביצים",
      optional: true,
    });
  });

  it("drops a missing time and source", () => {
    const d = recipeData(ROWS[2]);
    expect(d.total_time).toBeNull();
    expect(d.source_url).toBeNull();
    expect(d.category).toBeNull();
  });
});

describe("recipesToHtml", () => {
  it("embeds every recipe's data so the PDF can be imported back", () => {
    const html = recipesToHtml(ROWS);
    const found = blocks(html).map(decode);
    expect(found.map((d) => d.title)).toEqual(ROWS.map((r) => r.title));
    expect(found[0]).toEqual(recipeData(ROWS[0]));
  });

  it("escapes recipe text", () => {
    const html = recipesToHtml(ROWS);
    expect(html).toContain("&lt;מיוחדת&gt;");
    expect(html).not.toContain("<מיוחדת>");
  });

  it("adds a contents page only for several recipes", () => {
    expect(recipesToHtml(ROWS)).toContain('class="toc"');
    expect(recipesToHtml([ROWS[0]])).not.toContain('class="toc"');
  });

  it("links the original post", () => {
    expect(recipesToHtml([ROWS[0]])).toContain('href="https://www.instagram.com/reel/C1abc/"');
  });

  it("uses a photo when given", () => {
    expect(recipesToHtml([ROWS[0]], { images: { 1: "data:image/jpeg;base64,AAAA" } })).toContain(
      'src="data:image/jpeg;base64,AAAA"'
    );
  });

  // Writes the HTML for the backend's PDF fixture: FF_BOOK_HTML=/path npx jest recipeBook
  if (process.env.FF_BOOK_HTML) {
    it("writes the fixture html", () => {
      require("fs").writeFileSync(process.env.FF_BOOK_HTML, recipesToHtml(ROWS));
    });
  }
});

describe("recipesToText", () => {
  it("lists each recipe with its source", () => {
    const text = recipesToText(ROWS.slice(0, 2));
    expect(text).toContain("• 4 ביצים");
    expect(text).toContain("1. מחממים מחבת עם שמן זית.");
    expect(text).toContain("המתכון המקורי: https://www.instagram.com/reel/C1abc/");
    expect(text).toContain("―――――");
  });
});

test("escapeHtml", () => {
  expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});
