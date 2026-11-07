import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Sheet, Chip, RecipeImage } from "./UI/kit";
import { C, F } from "../constants/theme";
import { categoryList, recipeTimeLabel } from "../util/recipeUtils";

// Bottom sheet that lets the user pick one recipe, optionally filtered by category.
function RecipePickerSheet({ visible, title, recipes, onPick, onClose }) {
  const [category, setCategory] = useState(null);

  useEffect(() => {
    if (visible) setCategory(null);
  }, [visible]);

  const categories = useMemo(() => {
    const set = new Set();
    recipes.forEach((r) => categoryList(r).forEach((c) => set.add(c)));
    return [...set];
  }, [recipes]);

  const shown = category
    ? recipes.filter((r) => categoryList(r).includes(category))
    : recipes;

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>{title}</Text>
      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chips}
          contentContainerStyle={{ gap: 8 }}
        >
          <Chip label="הכל" on={!category} dark onPress={() => setCategory(null)} />
          {categories.map((c) => (
            <Chip
              key={c}
              label={c}
              on={category === c}
              dark
              onPress={() => setCategory(c)}
            />
          ))}
        </ScrollView>
      )}
      <ScrollView style={{ flexGrow: 0 }}>
        {shown.length === 0 && <Text style={styles.empty}>אין מתכונים להצגה</Text>}
        {shown.map((r) => (
          <TouchableOpacity
            key={r.id}
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => onPick(r)}
          >
            <RecipeImage recipe={r} style={styles.thumb} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {r.title}
              </Text>
              <Text style={styles.rowMeta}>
                {[recipeTimeLabel(r), categoryList(r)[0]].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Ionicons name="chevron-back" size={18} color={C.faint2} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Sheet>
  );
}

export default RecipePickerSheet;

const styles = StyleSheet.create({
  title: { fontFamily: F.display700, fontSize: 22, color: C.ink },
  chips: { flexGrow: 0, marginVertical: 12 },
  empty: { fontFamily: F.body, color: C.muted, textAlign: "center", paddingVertical: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  thumb: { width: 48, height: 48, borderRadius: 12 },
  rowTitle: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  rowMeta: { fontFamily: F.body, fontSize: 12, color: C.muted },
});
