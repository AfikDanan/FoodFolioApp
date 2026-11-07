import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";

const DEFAULT_CATEGORY_IMAGE = "../images/category_placeholder.jpg";
const DEFAULT_RECIPE_IMAGE = "../images/recipe_placeholder.jpg";
// The design's starter categories; the planner and batch cooking key off them.
const DEFAULT_CATEGORIES = ["ארוחות בוקר", "עיקריות", "תוספות", "סלטים", "מאפים", "קינוחים"];
let db;
let dbPromise;

// One connection for the whole app; reopening per query is slow and fails on web.
function getDb() {
  // The web preview has no persistent file storage in dev, so it uses memory.
  dbPromise ??= SQLite.openDatabaseAsync(Platform.OS === "web" ? ":memory:" : "recipes.db");
  return dbPromise;
}

async function initDB() {
  try {
    //await resetDatabase(); // Ensure this completes before proceeding
    db = await getDb();

    // Set journal mode to Write-Ahead Logging
    // WAL needs shared memory, which the browser build of SQLite does not have.
    if (Platform.OS !== "web") await db.runAsync(`PRAGMA journal_mode = WAL;`);

    // Create the recipes table
    try {
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS recipes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          ingredients TEXT NOT NULL,
          instructions TEXT NOT NULL,
          image TEXT DEFAULT '${DEFAULT_RECIPE_IMAGE}',
          totalTime TEXT
        );
      `);
      console.log("Recipes table created successfully");
    } catch (error) {
      console.error("Error creating recipes table:", error);
    }

    // Create the categories table
    try {
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY NOT NULL,
          name TEXT NOT NULL UNIQUE,
          image TEXT DEFAULT '${DEFAULT_CATEGORY_IMAGE}'
        );
      `);
      console.log("Categories table created successfully");
    } catch (error) {
      console.error("Error creating categories table:", error);
    }

    // Create the recipe_categories table
    try {
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS recipe_categories (
          recipeId INTEGER,
          categoryId INTEGER,
          PRIMARY KEY (recipeId, categoryId),
          FOREIGN KEY (recipeId) REFERENCES recipes(id) ON DELETE CASCADE,
          FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE
        );
      `);
      console.log("Recipe_categories table created successfully");
    } catch (error) {
      console.error("Error creating recipe_categories table:", error);
    }

    // await db.runAsync(`DROP TABLE IF EXISTS shopping_list;`);c

    // Create the shopping_list table
    try {
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS shopping_list (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          quantity REAL NOT NULL,
          unit TEXT NOT NULL,
          department TEXT DEFAULT 'אחר'
        );
      `);
      console.log("Shopping_list table created successfully");
    } catch (error) {
      console.error("Error creating shopping_list table:", error);
    }

    // Create the meal_plan table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS meal_plan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day TEXT NOT NULL,
        meal_type TEXT NOT NULL,
        recipe_id INTEGER NOT NULL,
        FOREIGN KEY (recipe_id) REFERENCES recipes (id)
      );
    `);

    await migrateSchema();

    for (const name of DEFAULT_CATEGORIES) {
      await db.runAsync("INSERT OR IGNORE INTO categories (name) VALUES (?);", [name]);
    }

    // Insert the default category
    try {
      await db.runAsync(
        `
        INSERT OR IGNORE INTO categories (name, image) VALUES (?, ?);
    `,
        ["מועדפים"]
      );
      console.log("Default category inserted successfully");
    } catch (error) {
      console.error("Error inserting default category:", error);
    }
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}

async function addColumnIfMissing(table, column, definition) {
  const cols = await db.getAllAsync(`PRAGMA table_info(${table});`);
  if (!cols.some((c) => c.name === column)) {
    await db.runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

async function migrateSchema() {
  try {
    await addColumnIfMissing("recipes", "servings", "INTEGER DEFAULT 4");
    await addColumnIfMissing("shopping_list", "checked", "INTEGER DEFAULT 0");
    await addColumnIfMissing("shopping_list", "from_recipes", "TEXT");
    await addColumnIfMissing("meal_plan", "prep_state", "TEXT");
    await addColumnIfMissing("recipes", "tags", "TEXT");
    await addColumnIfMissing("recipes", "fridge_days", "INTEGER");
    await addColumnIfMissing("recipes", "est_idx", "TEXT");
    await db.runAsync(
      "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);"
    );
  } catch (error) {
    console.error("Error migrating schema:", error);
  }
}

// Random per-install id, sent to the import API so it can rate-limit abuse.
async function getInstallId() {
  db = await getDb();
  const row = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = ?;", ["install_id"]);
  if (row) return row.value;
  const id = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join("");
  await db.runAsync("INSERT INTO app_meta (key, value) VALUES (?, ?);", ["install_id", id]);
  return id;
}

async function fetchAllRecipes() {
  try {
    db = await getDb();
    const rows = await db.getAllAsync("SELECT * FROM recipes;");
    return rows;
  } catch (error) {
    console.error("Error fetching recipes:", error);
  }
}

async function fetchRecipeById(id) {
  try {
    db = await getDb();
    const row = await db.getFirstAsync(
      `
      SELECT r.*, GROUP_CONCAT(c.name) AS categoryNames 
      FROM recipes r
      LEFT JOIN recipe_categories rc ON r.id = rc.recipeId
      LEFT JOIN categories c ON rc.categoryId = c.id
      WHERE r.id = ?
      GROUP BY r.id;
    `,
      [id]
    );
    return row;
  } catch (error) {
    console.error("Error fetching recipe with ID:", id, error);
  }
}

//update recipe

async function deleteRecipeById(id) {
  try {
    db = await getDb();
    await db.runAsync("DELETE FROM recipes WHERE id = ?;", [id]);
    console.log("Recipe deleted successfully");
  } catch (error) {
    console.error("Failed to delete recipe:", error);
  }
}

async function fetchAllCategories() {
  try {
    db = await getDb();
    const rows = await db.getAllAsync(
      "SELECT id, name, image FROM categories;"
    );
    return rows;
  } catch (error) {
    console.error("Failed to fetch categories", error);
  }
}

async function insertCategory(name, image = DEFAULT_CATEGORY_IMAGE) {
  try {
    db = await getDb();
    const existingCategory = await db.getFirstAsync(
      "SELECT id FROM categories WHERE name = ?",
      [name]
    );
    if (existingCategory) {
      console.log("Category already exists:", name, "ID:", existingCategory.id);
      return { success: true, id: existingCategory.id };
    }

    const result = await db.runAsync(
      "INSERT INTO categories (name, image) VALUES (?, ?);",
      [name, image]
    );
    if (result.lastInsertRowId) {
      console.log(
        "New category inserted:",
        name,
        "ID:",
        result.lastInsertRowId
      );
      return { success: true, id: result.lastInsertRowId };
    } else {
      console.log("Failed to obtain lastInsertRowId for new category:", name);
      return { success: false, id: null };
    }
  } catch (error) {
    console.error("Error inserting new category:", error);
    return { success: false, id: null };
  }
}

const deleteCategoryById = async (categoryId) => {
  try {
    db = await getDb();
    const result = await db.runAsync("DELETE FROM categories WHERE id = ?;", [
      categoryId,
    ]);
    if (result.rowsAffected === 0) {
      return { success: false, rowsAffected: result.rowsAffected };
    }
    return { success: true, rowsAffected: result.rowsAffected };
  } catch (error) {
    console.error("Error deleting category:", error);
    throw new Error("Failed to delete category");
  }
};

const insertRecipeWithCategories = async (recipe) => {
  try {
    db = await getDb();
    let ingredientsWithUnits;

    // Check if ingredients are already in array format
    if (Array.isArray(recipe.ingredients)) {
      ingredientsWithUnits = recipe.ingredients.map((ingredient) => ({
        ...ingredient,
        unit: ingredient.unit || "",
        // department: ingredient.department || "אחר", // Default department
      }));
    } else {
      // If ingredients are in string format, parse them
      try {
        const ingredients = JSON.parse(recipe.ingredients);
        ingredientsWithUnits = ingredients.map((ingredient) => ({
          ...ingredient,
          unit: ingredient.unit || "",
        }));
      } catch (error) {
        console.error("Failed to parse ingredients:", error);
        throw new Error("Invalid ingredients format");
      }
    }

    // const ingredientsJson = JSON.stringify(ingredientsWithUnits);
    // Set default image if not provided
    const image = recipe.image || null; // no photo: the UI draws a tinted placeholder

    // Insert recipe into recipes table
    const result = await db.runAsync(
      "INSERT INTO recipes (title, ingredients, instructions, image, totalTime, servings, tags, fridge_days, est_idx) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);",
      [
        recipe.title,
        JSON.stringify(recipe.ingredients),
        JSON.stringify(recipe.instructions),
        image,
        recipe.totalTime,
        recipe.servings || 4,
        JSON.stringify(recipe.tags || []),
        recipe.fridgeDays ?? null,
        JSON.stringify(recipe.estimatedIdx || []),
      ]
    );

    const recipeId = result.lastInsertRowId;
    console.log(`Recipe inserted with ID: ${recipeId}`);
    console.log("image", image);
    console.log("type of image", typeof image);
    // Insert categories associations if any
    if (
      recipe.categoryIds &&
      Array.isArray(recipe.categoryIds) &&
      recipe.categoryIds.length > 0
    ) {
      for (const categoryId of recipe.categoryIds) {
        await db.runAsync(
          "INSERT INTO recipe_categories (recipeId, categoryId) VALUES (?, ?);",
          [recipeId, categoryId]
        );
      }
    }
    return recipeId; // Return the new recipe ID after successful insertions
  } catch (error) {
    console.error("Failed to insert associate categories:", error);
    throw error; // Rethrow to handle errors in the calling function
  }
};

async function fetchAllRecipesWithCategories() {
  try {
    db = await getDb();
    const rows = await db.getAllAsync(`
      SELECT r.id, r.title, r.ingredients, r.instructions, r.image, r.totalTime, r.servings, r.tags, r.fridge_days, r.est_idx, GROUP_CONCAT(c.name) AS categoryNames
      FROM recipes r
      LEFT JOIN recipe_categories rc ON r.id = rc.recipeId
      LEFT JOIN categories c ON rc.categoryId = c.id
      GROUP BY r.id;
    `);
    return rows;
  } catch (error) {
    console.error("Error fetching recipes with categories", error);
    throw error;
  }
}

async function updateRecipeWithCategories(id, recipe, categoryIds) {
  try {
    db = await getDb();
    await db.runAsync(
      `
      UPDATE recipes SET title = ?, ingredients = ?, instructions = ?, image = ?, totalTime = ?, servings = ? WHERE id = ?;`,
      [
        recipe.title,
        recipe.ingredients,
        recipe.instructions,
        recipe.image,
        recipe.totalTime,
        recipe.servings || 4,
        id,
      ]
    );
    await db.runAsync(`DELETE FROM recipe_categories WHERE recipeId = ?;`, [
      id,
    ]);
    for (const categoryId of categoryIds) {
      await db.runAsync(
        `INSERT INTO recipe_categories (recipeId, categoryId) VALUES (?, ?);`,
        [id, categoryId]
      );
    }
    console.log("Recipe updated successfully with new category associations");
    return true; // Indicate success
  } catch (error) {
    console.error("Failed to update recipe:", error);
    return false; // Indicate failure
  }
}

const fetchRecipesByCategory = async (categoryId) => {
  try {
    db = await getDb();
    const recipes = await db.getAllAsync(
      "SELECT r.* FROM recipes r JOIN recipe_categories rc ON r.id = rc.recipeId WHERE rc.categoryId = ?;",
      [categoryId]
    );
    return recipes;
  } catch (error) {
    console.error("Error fetching recipes by category:", error);
    return null;
  }
};

const deleteRecipeFromCategory = async (recipeId, categoryId, callback) => {
  try {
    db = await getDb();
    await db.runAsync(
      "DELETE FROM recipe_categories WHERE recipeId = ? AND categoryId = ?;",
      [recipeId, categoryId]
    );
    console.log("Recipe deleted from category successfully");
    if (callback) {
      callback();
    }
  } catch (error) {
    console.error("Failed to delete recipe from category:", error);
  }
};

async function resetDatabase() {
  try {
    db = await getDb();
    await db.execAsync(`
      DROP TABLE IF EXISTS recipes;
      DROP TABLE IF EXISTS categories;
      DROP TABLE IF EXISTS recipe_categories;
    `);
    console.log("All specified tables were dropped successfully");
  } catch (error) {
    console.error("Error dropping tables: ", error);
    throw error;
  }
}

const addRecipeToCategory = async (categoryId, recipeId) => {
  try {
    db = await getDb();
    // Check if the association already exists to prevent duplicates
    const existingLink = await db.getFirstAsync(
      "SELECT * FROM recipe_categories WHERE recipeId = ? AND categoryId = ?;",
      [recipeId, categoryId]
    );
    if (!existingLink) {
      await db.runAsync(
        "INSERT INTO recipe_categories (recipeId, categoryId) VALUES (?, ?);",
        [recipeId, categoryId]
      );
      console.log("Recipe added to category successfully");
      return {
        success: true,
        message: "Recipe added to category successfully",
      };
    } else {
      console.log("Recipe already linked to this category");
      return {
        success: false,
        message: "Recipe already linked to this category",
      };
    }
  } catch (error) {
    console.error("Failed to add recipe to category:", error);
    return { success: false, message: "Failed to add recipe to category" };
  }
};

async function fetchShoppingList() {
  try {
    db = await getDb();
    const rows = await db.getAllAsync("SELECT * FROM shopping_list;");
    return rows;
  } catch (error) {
    console.error("Error fetching shopping list:", error);
    return [];
  }
}

async function saveShoppingList(list) {
  try {
    db = await getDb();
    await db.runAsync("DELETE FROM shopping_list;");
    for (const item of list) {
      await db.runAsync(
        "INSERT INTO shopping_list (name, quantity, unit, department, checked, from_recipes) VALUES (?, ?, ?, ?, ?, ?);",
        [
          item.name,
          item.quantity,
          item.unit,
          item.department || "אחר",
          item.checked ? 1 : 0,
          JSON.stringify(item.from || []),
        ]
      );
    }
  } catch (error) {
    console.error("Error saving shopping list:", error);
  }
}

async function clearShoppingList() {
  try {
    db = await getDb();
    await db.runAsync("DELETE FROM shopping_list;");
  } catch (error) {
    console.error("Error clearing shopping list:", error);
  }
}

async function deleteShoppingListItems(ids) {
  try {
    db = await getDb();
    for (const id of ids) {
      await db.runAsync("DELETE FROM shopping_list WHERE id = ?;", [id]);
    }
  } catch (error) {
    console.error("Error deleting shopping list items:", error);
  }
}

async function fetchMealPlan() {
  try {
    db = await getDb();
    const rows = await db.getAllAsync("SELECT * FROM meal_plan;");
    return rows;
  } catch (error) {
    console.error("Error fetching meal plan:", error);
  }
}

// `day` is an ISO date (YYYY-MM-DD). A slot holds one recipe, so replace it.
async function insertMealPlan(day, mealType, recipeId, prepState = null) {
  try {
    db = await getDb();
    await db.runAsync("DELETE FROM meal_plan WHERE day = ? AND meal_type = ?;", [
      day,
      mealType,
    ]);
    await db.runAsync(
      "INSERT INTO meal_plan (day, meal_type, recipe_id, prep_state) VALUES (?, ?, ?, ?);",
      [day, mealType, recipeId, prepState]
    );
  } catch (error) {
    console.error("Error inserting meal plan:", error);
  }
}

// Writes a whole plan snapshot: { "YYYY-MM-DD|meal": { id, prep } }.
async function replaceMealPlan(plan) {
  try {
    db = await getDb();
    await db.runAsync("DELETE FROM meal_plan;");
    for (const [key, slot] of Object.entries(plan)) {
      const [day, meal] = key.split("|");
      await db.runAsync(
        "INSERT INTO meal_plan (day, meal_type, recipe_id, prep_state) VALUES (?, ?, ?, ?);",
        [day, meal, slot.id, slot.prep || null]
      );
    }
  } catch (error) {
    console.error("Error replacing meal plan:", error);
  }
}

async function getMeta(key) {
  db = await getDb();
  const row = await db.getFirstAsync("SELECT value FROM app_meta WHERE key = ?;", [key]);
  return row ? row.value : null;
}

async function setMeta(key, value) {
  db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?);", [key, String(value)]);
}

async function deleteMealPlan() {
  try {
    db = await getDb();
    await db.runAsync("DELETE FROM meal_plan;");
    console.log("Meal plan deleted successfully");
  } catch (error) {
    console.error("Error deleting meal plan:", error);
  }
}

async function deleteSpecificMeal(day, mealType) {
  try {
    db = await getDb();
    await db.runAsync(
      "DELETE FROM meal_plan WHERE day = ? AND meal_type = ?;",
      [day, mealType]
    );
    console.log("Specific meal deleted successfully");
  } catch (error) {
    console.error("Error deleting specific meal:", error);
  }
}

export {
  initDB,
  getInstallId,
  getMeta,
  setMeta,
  replaceMealPlan,
  fetchRecipeById,
  fetchAllRecipes,
  deleteRecipeById,
  fetchAllCategories,
  insertCategory,
  deleteCategoryById,
  insertRecipeWithCategories,
  fetchAllRecipesWithCategories,
  updateRecipeWithCategories,
  fetchRecipesByCategory,
  deleteRecipeFromCategory,
  addRecipeToCategory,
  fetchShoppingList,
  saveShoppingList,
  clearShoppingList,
  deleteShoppingListItems,
  fetchMealPlan,
  insertMealPlan,
  deleteMealPlan,
  deleteSpecificMeal,
};
