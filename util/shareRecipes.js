import { Share } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { hasPhoto } from "./recipeUtils";
import { recipesToHtml, recipesToText } from "./recipeBook";

// Photos are shrunk before they go into the PDF so a book of many recipes stays
// small enough to send on WhatsApp and to import back (the API takes ≤ 4.4 MB).
async function photoFor(row, width) {
  if (!hasPhoto(row.image)) return null;
  try {
    const { base64 } = await manipulateAsync(row.image, [{ resize: { width } }], {
      compress: 0.6,
      format: SaveFormat.JPEG,
      base64: true,
    });
    return `data:image/jpeg;base64,${base64}`;
  } catch (e) {
    console.warn("Could not add a recipe photo to the PDF", e);
    return null;
  }
}

const fileName = (name) =>
  String(name || "recipes").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) || "recipes";

/**
 * Share one or several recipes as a single PDF. Falls back to plain text when
 * the PDF cannot be made or shared. `rows` are recipe rows as the database
 * returns them (ingredients and instructions may be JSON strings).
 */
export async function shareRecipes(rows, { title } = {}) {
  if (!rows.length) return;
  const many = rows.length > 1;
  const width = rows.length > 6 ? 500 : many ? 700 : 900;
  try {
    const images = {};
    for (const row of rows) {
      const photo = await photoFor(row, width);
      if (photo) images[row.id] = photo;
    }
    const html = recipesToHtml(rows, { images, title });
    const { uri } = await Print.printToFileAsync({ html });
    // Share from our own cache folder: the print output location is not always readable by the share sheet.
    const name = title || (many ? `${rows.length} מתכונים - FoodFolio` : rows[0].title);
    const target = `${FileSystem.cacheDirectory}${fileName(name)}.pdf`;
    await FileSystem.deleteAsync(target, { idempotent: true });
    await FileSystem.copyAsync({ from: uri, to: target });
    await Sharing.shareAsync(target, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: name,
    });
  } catch (e) {
    console.warn("Share recipes as PDF failed", e);
    // Plain text works with every share target.
    await Share.share({ message: recipesToText(rows) });
  }
}
