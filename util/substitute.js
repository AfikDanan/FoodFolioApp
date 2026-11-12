import { apiPost } from "./api";

/**
 * Ask the backend for up to three substitutes for one ingredient, calculated for
 * the amount used in this recipe. `constraints` are the household's dietary
 * preferences in words. Returns [{ name, quantity, unit, note }].
 */
export async function fetchSubstitutes({ ingredient, quantity, unit, recipeTitle, others, constraints }) {
  const data = await apiPost("/substitute", {
    ingredient,
    quantity,
    unit,
    recipe_title: recipeTitle,
    other_ingredients: others,
    // Dietary requirements every suggestion has to meet, for example ["צמחוני"].
    constraints: (constraints || []).slice(0, 12).map((c) => String(c).slice(0, 60)),
  });
  return data.options;
}
