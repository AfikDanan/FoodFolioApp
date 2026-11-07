import { useEffect, useState } from "react";
import { fetchShoppingList, saveShoppingList } from "./database";
import { departments } from "../constants/recipeConstants";
import { displayUnit, formatQty, parseIngredients, parseQty } from "./recipeUtils";

const departmentNames = departments.map((d) => d.name);

let uncheckedCount = 0;
const listeners = new Set();

function publish(list) {
  uncheckedCount = list.filter((i) => !i.checked).length;
  listeners.forEach((fn) => fn(uncheckedCount));
}

export function useUncheckedCount() {
  const [count, setCount] = useState(uncheckedCount);
  useEffect(() => {
    listeners.add(setCount);
    setCount(uncheckedCount);
    return () => listeners.delete(setCount);
  }, []);
  return count;
}

export async function loadShoppingList() {
  const rows = (await fetchShoppingList()) || [];
  const list = rows.map((r) => ({
    id: r.id,
    name: r.name,
    quantity: Number(r.quantity) || 1,
    unit: r.unit,
    department: departmentNames.includes(r.department) ? r.department : "אחר",
    checked: !!r.checked,
  }));
  publish(list);
  return list;
}

export async function persistShoppingList(list) {
  await saveShoppingList(list);
  publish(list);
}

// Unchecked items merge by name + unit and their quantities add up.
export function mergeItems(list, incoming) {
  const out = list.map((i) => ({ ...i }));
  for (const item of incoming) {
    if (!item.name) continue;
    const match = out.find((o) => !o.checked && o.name === item.name && o.unit === item.unit);
    if (match) {
      match.quantity += item.quantity;
    } else {
      out.push({ checked: false, ...item });
    }
  }
  return out;
}

export async function addToShoppingList(items) {
  const merged = mergeItems(await loadShoppingList(), items);
  await persistShoppingList(merged);
  return merged;
}

// Ingredients of a stored recipe row, scaled by `factor`.
export function recipeToShoppingItems(recipe, factor = 1) {
  return parseIngredients(recipe.ingredients)
    .map((ing) => ({
      name: ing.name,
      quantity: parseQty(ing.quantity) * factor,
      unit: ing.unit || "יחידה",
      department: ing.department || "אחר",
    }))
    .filter((i) => i.name);
}

// A checklist to paste into WhatsApp or Notes: what is still needed, by aisle.
// "☐" shows as a box everywhere; the *asterisks* make aisle headings bold in WhatsApp.
export function shoppingListToText(items) {
  const open = items.filter((i) => !i.checked);
  if (!open.length) return "";
  const blocks = departments
    .map((d) => ({ name: d.name, items: open.filter((i) => i.department === d.name) }))
    .filter((g) => g.items.length > 0)
    .map((g) => {
      const lines = g.items.map((i) => {
        const qty = [formatQty(i.quantity), displayUnit(i.quantity, i.unit, true)]
          .filter(Boolean)
          .join(" ");
        return `☐ ${i.name} – ${qty}`;
      });
      return [`*${g.name}*`, ...lines].join("\n");
    });
  return ["🛒 רשימת קניות", "", blocks.join("\n\n")].join("\n");
}
