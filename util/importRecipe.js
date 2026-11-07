import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { departments } from "../constants/recipeConstants";
import { apiPost, ApiError } from "./api";
import { guessDepartment, parseSteps } from "./recipeUtils";

// Kept as an alias so callers read naturally.
export { ApiError as ImportError };

const departmentNames = departments.map((d) => d.name);

// Normalise whatever the API (or the manual form) produced into a draft that
// the review step and the database both understand.
export function toDraft(raw) {
  const minutes = raw.total_minutes;
  const totalTime = raw.totalTime || (minutes ? `${minutes} דקות` : "לא צוין");
  return {
    title: String(raw.title || "").trim(),
    totalTime,
    servings: raw.servings || 4,
    ingredients: (raw.ingredients || [])
      .filter((i) => i && i.name)
      .map((i) => ({
        name: String(i.name),
        quantity: i.quantity ?? 1,
        optional: !!i.optional,
        unit: i.unit || "יחידה",
        department: departmentNames.includes(i.department)
          ? i.department
          : guessDepartment(String(i.name)),
      })),
    suggestedCategory: raw.suggested_category || null,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    fridgeDays: raw.fridge_days ?? null,
    estimatedIdx: (raw.ingredients || [])
      .filter((i) => i && i.name)
      .map((i, idx) => (i.estimated ? idx : null))
      .filter((idx) => idx !== null),
    steps: Array.isArray(raw.steps) ? raw.steps.map(String) : parseSteps(raw.instructions),
  };
}

async function postImport(body) {
  const data = await apiPost("/import", body);
  return toDraft(data.recipe);
}

// `categories` are the user's category names; the API may pick one for the recipe.
// Some sites refuse requests from servers (403). A phone is not blocked, so when
// the API cannot read the page we fetch it here and send the HTML instead.
const MAX_HTML_CHARS = 1_800_000;

async function fetchPageOnDevice(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new ApiError("fetch-blocked", String(res.status));
    return (await res.text()).slice(0, MAX_HTML_CHARS);
  } catch (e) {
    throw e instanceof ApiError ? e : new ApiError("fetch-blocked", e.message);
  } finally {
    clearTimeout(timer);
  }
}

export async function importFromUrl(url, categories = []) {
  try {
    return await postImport({ type: "url", url: String(url), categories });
  } catch (e) {
    if (e.code !== "fetch-blocked") throw e;
    const html = await fetchPageOnDevice(String(url));
    return postImport({ type: "html", url: String(url), html, categories });
  }
}

export const importFromText = (text, categories = []) =>
  postImport({ type: "text", text: String(text).trim(), categories });

// Downscale before upload: a 12 MP photo costs far more tokens and bandwidth
// than the model needs to read a recipe page.
export async function importFromImage(uri, categories = []) {
  const { base64 } = await manipulateAsync(uri, [{ resize: { width: 1600 } }], {
    compress: 0.7,
    format: SaveFormat.JPEG,
    base64: true,
  });
  return postImport({ type: "image", image: base64, categories });
}
