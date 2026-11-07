import { apiPost } from "./api";

/**
 * Ask the backend for up to three substitutes for one ingredient, calculated for
 * the amount used in this recipe. Returns [{ name, quantity, unit, note }].
 */
export async function fetchSubstitutes({ ingredient, quantity, unit, recipeTitle, others }) {
  const data = await apiPost("/substitute", {
    ingredient,
    quantity,
    unit,
    recipe_title: recipeTitle,
    other_ingredients: others,
  });
  return data.options;
}
