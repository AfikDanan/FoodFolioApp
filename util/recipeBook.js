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
  timeLabel,
  tintFor,
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

// The app's design language (constants/theme.js), as CSS for the PDF.
const T = {
  paper: "#f5f2eb",
  card: "#fffdf9",
  ink: "#1f221d",
  muted: "#6d7067",
  faint: "#8a8c84",
  line: "#e6e1d6",
  chip: "#ece7dc",
  accent: "#2f6b46",
  accentSofter: "#eef1ea",
};

function qtyLabel(i) {
  const q = Number(i.quantity);
  return [formatQty(q), displayUnit(q, i.unit, true)].filter(Boolean).join(" ");
}

function hero(row, d, image) {
  const inner = image
    ? `<img src="${escapeHtml(image)}" alt="" />`
    : `<div class="hero-mark">${escapeHtml(d.title.slice(0, 1))}</div>`;
  return `<div class="hero" style="background:${tintFor(row.id, d.title)}">${inner}</div>`;
}

function recipeSection(row, index, total, image) {
  const d = recipeData(row);
  const source = sourceInfo(d.source_url);
  const stats = [
    ["זמן כולל", d.total_minutes ? timeLabel(d.total_minutes) : d.total_time || "לא צוין"],
    ["מנות", String(d.servings)],
    ...(d.fridge_days ? [["במקרר", `עד ${d.fridge_days} ימים`]] : []),
  ];
  return `
    <section class="recipe" id="r${index}">
      ${hero(row, d, image)}
      <div class="sheet">
        ${d.category ? `<div class="eyebrow">${escapeHtml(d.category)}</div>` : ""}
        <h1>${escapeHtml(d.title)}</h1>
        ${
          d.tags.length
            ? `<div class="tags">${d.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>`
            : ""
        }
        <div class="stats">${stats
          .map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${escapeHtml(v)}</div></div>`)
          .join("")}</div>
        <div class="cols">
          <div>
            <h2>מרכיבים</h2>
            <div class="card ings">${d.ingredients
              .map(
                (i) => `<div class="ing${i.optional ? " opt" : ""}">
                  <span class="dot"></span>
                  <span class="name">${escapeHtml(i.name)}${i.optional ? `<small>אופציונלי</small>` : ""}</span>
                  ${qtyLabel(i) ? `<span class="qty">${escapeHtml(qtyLabel(i))}</span>` : ""}
                </div>`
              )
              .join("")}</div>
          </div>
          <div>
            <h2>אופן ההכנה</h2>
            <ol class="steps">${d.steps
              .map((st, n) => `<li><span class="num">${n + 1}</span><span class="txt">${escapeHtml(st)}</span></li>`)
              .join("")}</ol>
          </div>
        </div>
        ${
          source
            ? `<a class="source" href="${escapeHtml(source.url)}">
                 <span>למתכון המקורי ב${escapeHtml(source.label)}</span>
                 <span class="url">${escapeHtml(source.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60))}</span>
               </a>`
            : ""
        }
        <div class="foot"><span class="brand">FoodFolio</span>${total > 1 ? `<span dir="ltr">${index + 1} / ${total}</span>` : ""}</div>
        <div class="ff-data" dir="ltr">#FFREC1#</div>
        <div class="ff-data" dir="ltr">${toBase64Utf8(JSON.stringify(d))}</div>
        <div class="ff-data" dir="ltr">#FFEND#</div>
      </div>
    </section>`;
}

function cover(rows, bookTitle, images) {
  return `
    <section class="cover">
      <div class="brand big">FoodFolio</div>
      <h1>${escapeHtml(bookTitle)}</h1>
      <div class="sub">${rows.length} מתכונים</div>
      <div class="toc">${rows
        .map((r, i) => {
          const d = recipeData(r);
          const thumb = images[r.id]
            ? `<img src="${escapeHtml(images[r.id])}" alt="" />`
            : `<span>${escapeHtml(d.title.slice(0, 1))}</span>`;
          const meta = [d.category, d.total_minutes ? timeLabel(d.total_minutes) : d.total_time]
            .filter(Boolean)
            .map(escapeHtml)
            .join(" · ");
          return `<a class="toc-row" href="#r${i}">
            <span class="thumb" style="background:${tintFor(r.id, d.title)}">${thumb}</span>
            <span class="toc-text"><b>${escapeHtml(d.title)}</b>${meta ? `<small>${meta}</small>` : ""}</span>
            <span class="toc-n">${i + 1}</span>
          </a>`;
        })
        .join("")}</div>
    </section>`;
}

function fontFaces(fonts) {
  return Object.entries(fonts)
    .map(
      ([weight, uri]) =>
        `@font-face { font-family: "Heebo"; font-weight: ${Number(weight)}; src: url("${escapeHtml(uri)}") format("truetype"); }`
    )
    .join("\n");
}

/**
 * HTML for one recipe or a recipe book, in the app's look.
 * `images` maps recipe id -> data URI. `fonts` maps a weight (400, 600, 900)
 * -> a data URI of that Heebo file, so the PDF does not depend on the network.
 */
export function recipesToHtml(rows, { images = {}, fonts = {}, title } = {}) {
  const many = rows.length > 1;
  const bookTitle = title || (many ? "המתכונים שלי" : rows[0]?.title || "");
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(bookTitle)}</title>
    <style>
      ${fontFaces(fonts)}
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      html, body { margin: 0; background: ${T.paper}; color: ${T.ink}; }
      body { font-family: "Heebo", "Arial Hebrew", Arial, sans-serif; direction: rtl; text-align: right; font-size: 14px; line-height: 1.5; }
      /* 296mm, not 297: a rounding overflow would add a blank page. */
      section { width: 210mm; min-height: 296mm; background: ${T.paper}; display: flex; flex-direction: column; }
      section + section { page-break-before: always; break-before: page; }
      a { color: inherit; text-decoration: none; }

      .cover { padding: 34mm 22mm 20mm; }
      .brand { font-weight: 900; color: ${T.accent}; letter-spacing: 0.5px; }
      .brand.big { font-size: 22px; margin-bottom: 26px; }
      .cover h1 { font-size: 46px; font-weight: 900; line-height: 1.05; margin: 0; }
      .cover .sub { color: ${T.muted}; font-size: 16px; margin: 10px 0 30px; }
      .toc { display: flex; flex-direction: column; gap: 10px; }
      .toc-row { display: flex; align-items: center; gap: 14px; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 16px; padding: 10px 12px; break-inside: avoid; }
      .thumb { width: 52px; height: 52px; border-radius: 12px; overflow: hidden; flex: none; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 22px; color: rgba(31,34,29,0.35); }
      .thumb img { width: 100%; height: 100%; object-fit: cover; }
      .toc-text { flex: 1; display: flex; flex-direction: column; }
      .toc-text b { font-weight: 700; font-size: 16px; }
      .toc-text small { color: ${T.muted}; font-size: 12.5px; }
      .toc-n { color: ${T.faint}; font-weight: 600; font-size: 13px; }

      .hero { height: 88mm; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; }
      .hero img { width: 100%; height: 100%; object-fit: cover; }
      .hero-mark { font-size: 120px; font-weight: 900; color: rgba(31,34,29,0.12); line-height: 1; }
      .sheet { flex: 1; display: flex; flex-direction: column; position: relative; margin-top: -22px; background: ${T.paper}; border-radius: 22px 22px 0 0; padding: 22px 16mm 14mm; }
      .eyebrow { color: ${T.accent}; font-weight: 600; font-size: 13px; }
      h1 { font-size: 34px; font-weight: 900; line-height: 1.1; margin: 4px 0 10px; }
      .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
      .tags span { background: ${T.chip}; border-radius: 999px; padding: 2px 11px; font-size: 12px; font-weight: 500; }
      .stats { display: flex; gap: 10px; margin-bottom: 20px; }
      .stat { flex: 1; background: ${T.card}; border: 1px solid ${T.line}; border-radius: 16px; padding: 10px 14px; }
      .stat .k { color: ${T.muted}; font-size: 12px; }
      .stat .v { font-weight: 700; font-size: 18px; }
      .cols { display: grid; grid-template-columns: 0.95fr 1.25fr; gap: 22px; align-items: start; }
      h2 { font-size: 19px; font-weight: 700; margin: 0 0 10px; }
      .card { background: ${T.card}; border: 1px solid ${T.line}; border-radius: 18px; }
      .ing { display: flex; align-items: center; gap: 10px; padding: 9px 14px; break-inside: avoid; }
      .ing + .ing { border-top: 1px solid ${T.line}; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: ${T.accent}; flex: none; }
      .ing.opt .dot { background: transparent; border: 1.5px solid ${T.faint}; }
      .name { flex: 1; font-size: 14px; }
      .name small { display: block; color: ${T.faint}; font-size: 11px; }
      .qty { background: ${T.chip}; border-radius: 999px; padding: 2px 10px; font-weight: 700; font-size: 12px; white-space: nowrap; }
      .steps { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
      .steps li { display: flex; gap: 12px; align-items: flex-start; break-inside: avoid; }
      .num { width: 26px; height: 26px; border-radius: 50%; background: ${T.ink}; color: #fff; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; flex: none; margin-top: 1px; }
      .txt { font-size: 14.5px; line-height: 1.6; }
      .source { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 22px; background: ${T.accentSofter}; border-radius: 14px; padding: 10px 14px; color: ${T.accent}; font-weight: 600; font-size: 13px; break-inside: avoid; }
      .source .url { direction: ltr; color: ${T.muted}; font-weight: 400; font-size: 11.5px; }
      .foot { display: flex; justify-content: space-between; margin-top: auto; padding-top: 18px; color: ${T.faint}; font-size: 11px; }
      .foot .brand { font-size: 12px; }
      .ff-data { color: ${T.paper}; font-size: 5px; line-height: 6px; word-break: break-all; font-family: monospace; }
    </style>
  </head>
  <body>
    ${many ? cover(rows, bookTitle, images) : ""}
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
