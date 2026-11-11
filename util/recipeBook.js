// Builds the PDF (as HTML for expo-print) and the plain-text fallback used to
// share one or several recipes. Pure functions, so they are unit tested.
//
// Each recipe also carries its exact data in a hidden block,
// "#FFREC1#<base64 JSON>#FFEND#", printed in white text. The page looks normal,
// but the PDF's text layer keeps the block, so when the PDF is shared back into
// FoodFolio the server restores the recipes as saved, without the model.
// '#' is not a base64 character, so the markers cannot appear inside the data.
import {
  categoryList,
  displayUnit,
  fridgeDays,
  formatQty,
  parseIngredients,
  parseJsonList,
  parseMinutes,
  parseQty,
  parseSteps,
  sourceInfo,
} from "./recipeUtils";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// UTF-8 + base64 by hand: Hermes and old JS engines differ on btoa/TextEncoder.
export function toBase64Utf8(text) {
  const bytes = [];
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      bytes.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 63),
        0x80 | ((c >> 6) & 63),
        0x80 | (c & 63)
      );
  }
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = bytes.slice(i, i + 3);
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64[n & 63] : "=";
  }
  return out;
}

/**
 * A stored recipe row (or one the detail screen adjusted) as plain data.
 * `row.ingredients` may be the stored JSON string or an array already.
 */
export function recipeData(row) {
  const ingredients = parseIngredients(row.ingredients)
    .filter((i) => i && i.name)
    .map((i) => ({
      name: String(i.name),
      quantity: Math.round(parseQty(i.quantity) * 100) / 100,
      unit: i.unit || "יחידה",
      department: i.department || "אחר",
      ...(i.optional ? { optional: true } : null),
    }));
  return {
    v: 1,
    title: String(row.title || "").trim(),
    servings: Number(row.servings) || 4,
    total_time: row.totalTime && row.totalTime !== "לא צוין" ? String(row.totalTime) : null,
    total_minutes: parseMinutes(row.totalTime),
    ingredients,
    steps: parseSteps(row.instructions),
    tags: parseJsonList(row.tags).map(String),
    fridge_days: fridgeDays(row) ?? null,
    category: categoryList(row)[0] || null,
    source_url: sourceInfo(row.source_url)?.url || null,
  };
}

function ingredientLine(i) {
  const q = Number(i.quantity);
  return [formatQty(q), displayUnit(q, i.unit), i.name].filter(Boolean).join(" ");
}

function recipeSection(row, index, total, image) {
  const d = recipeData(row);
  const meta = [d.category, d.total_time, `${d.servings} מנות`].filter(Boolean);
  const source = sourceInfo(d.source_url);
  return `
    <section class="recipe${index > 0 ? " break" : ""}" id="r${index}">
      ${image ? `<img src="${escapeHtml(image)}" class="photo" />` : ""}
      <h1>${escapeHtml(d.title)}</h1>
      <div class="meta">${meta.map(escapeHtml).join(" &#8226; ")}</div>
      ${d.tags.length ? `<div class="tags">${d.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>` : ""}
      <h2>מרכיבים</h2>
      <ul>${d.ingredients
        .map((i) => `<li>${escapeHtml(ingredientLine(i))}${i.optional ? " (אופציונלי)" : ""}</li>`)
        .join("")}</ul>
      <h2>אופן ההכנה</h2>
      <ol>${d.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
      ${
        source
          ? `<p class="source">המתכון המקורי: <a href="${escapeHtml(source.url)}">${escapeHtml(source.label)}</a></p>`
          : ""
      }
      <div class="ff-data" dir="ltr">#FFREC1#</div>
      <div class="ff-data" dir="ltr">${toBase64Utf8(JSON.stringify(d))}</div>
      <div class="ff-data" dir="ltr">#FFEND#</div>
      ${total > 1 ? `<div class="foot">${index + 1} / ${total}</div>` : ""}
    </section>`;
}

/**
 * HTML for one recipe or a recipe book. `images` maps recipe id -> data URI.
 */
export function recipesToHtml(rows, { images = {}, title } = {}) {
  const many = rows.length > 1;
  const bookTitle = title || (many ? `${rows.length} מתכונים מ-FoodFolio` : rows[0]?.title || "");
  const contents = many
    ? `<section class="cover">
         <div class="brand">FoodFolio</div>
         <h1>${escapeHtml(bookTitle)}</h1>
         <ol class="toc">${rows.map((r, i) => `<li><a href="#r${i}">${escapeHtml(r.title)}</a></li>`).join("")}</ol>
       </section>`
    : "";
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(bookTitle)}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; direction: rtl; text-align: right; color: #1d1d1b; margin: 0; }
      section { padding: 28px 44px; }
      .break, .cover + .recipe { page-break-before: always; break-before: page; }
      .cover { text-align: center; padding-top: 120px; }
      .brand { font-size: 14px; letter-spacing: 3px; color: #2f6b4f; margin-bottom: 12px; }
      .cover h1 { font-size: 30px; }
      .toc { text-align: right; display: inline-block; font-size: 17px; line-height: 1.9; margin-top: 24px; }
      .toc a { color: inherit; text-decoration: none; }
      .photo { width: 100%; max-height: 320px; object-fit: cover; border-radius: 14px; margin-bottom: 18px; }
      h1 { font-size: 26px; margin: 0 0 6px; }
      h2 { font-size: 19px; margin: 22px 0 8px; }
      .meta { color: #6b6b63; font-size: 14px; }
      .tags span { display: inline-block; font-size: 12px; background: #eef1ea; border-radius: 10px; padding: 2px 9px; margin: 8px 0 0 6px; }
      ul, ol { padding-right: 22px; margin: 0; }
      li { margin-bottom: 5px; font-size: 15px; line-height: 1.45; }
      .source { margin-top: 20px; font-size: 13px; color: #6b6b63; }
      .source a { color: #2f6b4f; }
      .foot { margin-top: 18px; font-size: 11px; color: #a3a39a; text-align: center; }
      .ff-data { color: #ffffff; font-size: 5px; line-height: 6px; word-break: break-all; font-family: monospace; }
    </style>
  </head>
  <body>
    ${contents}
    ${rows.map((r, i) => recipeSection(r, i, rows.length, images[r.id])).join("")}
  </body>
</html>`;
}

// Plain-text fallback for share targets that cannot take a PDF.
export function recipesToText(rows) {
  return rows
    .map((row) => {
      const d = recipeData(row);
      return [
        d.title,
        [d.total_time, `${d.servings} מנות`].filter(Boolean).join(" · "),
        "",
        "מרכיבים",
        ...d.ingredients.map((i) => `• ${ingredientLine(i)}`),
        "",
        "אופן ההכנה",
        ...d.steps.map((s, n) => `${n + 1}. ${s}`),
        ...(d.source_url ? ["", `המתכון המקורי: ${d.source_url}`] : []),
      ].join("\n");
    })
    .join("\n\n―――――\n\n");
}
