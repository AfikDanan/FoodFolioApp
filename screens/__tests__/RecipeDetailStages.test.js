import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import RecipeDetailScreen from "../RecipeDetailScreen";

jest.mock("../../util/database", () => ({
  fetchRecipeById: jest.fn(async () => ({
    id: 7,
    title: "עוגת קרם",
    servings: 8,
    totalTime: "60 דקות",
    categoryNames: "קינוחים",
    ingredients: JSON.stringify([
      { name: "קמח", quantity: 2, unit: "כוס", department: "יבשים ואפייה", group: "לבצק" },
      { name: "סוכר", quantity: 1, unit: "כוס", department: "יבשים ואפייה", group: "לבצק" },
      { name: "סוכר", quantity: 0.5, unit: "כוס", department: "יבשים ואפייה", group: "לקרם" },
    ]),
    instructions: JSON.stringify({ 1: "מכינים את הבצק עם הסוכר.", 2: "מקציפים את הקרם עם הסוכר." }),
    tags: "[]",
    est_idx: "[]",
  })),
  deleteRecipeById: jest.fn(),
}));
jest.mock("../../util/substitute", () => ({ fetchSubstitutes: jest.fn() }));
jest.mock("../../util/shareRecipes", () => ({ shareRecipes: jest.fn() }));
jest.mock("../../util/shopping", () => ({ addToShoppingList: jest.fn() }));
jest.mock("../../util/prefs", () => {
  const { normalizePrefs } = jest.requireActual("../../util/prefs");
  return { usePrefs: () => normalizePrefs({ stepQuantities: true }) };
});
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));

it("shows the parts of the dish and each part's own amounts", async () => {
  const screen = render(
    <RecipeDetailScreen
      navigation={{ navigate: jest.fn(), goBack: jest.fn() }}
      route={{ params: { recipeId: 7 } }}
    />
  );
  await waitFor(() => expect(screen.getByText("לבצק")).toBeTruthy());
  expect(screen.getByText("לקרם")).toBeTruthy();
  expect(screen.getAllByText("סוכר")).toHaveLength(2);
  // Once in the list and once inside the step of that part, never the 1½ total.
  expect(screen.getAllByText("1 כוס")).toHaveLength(2);
  expect(screen.getAllByText("½ כוס")).toHaveLength(2);
  expect(screen.queryByText("1½ כוסות")).toBeNull();
});
