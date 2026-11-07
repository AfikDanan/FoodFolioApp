import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchAllRecipesWithCategories } from "../util/database";
import { RoundButton, RecipeImage, useToast } from "../components/UI/kit";
import RecipePickerSheet from "../components/RecipePickerSheet";
import { slotKey } from "../util/planner";
import { useMeals } from "../util/mealSettings";
import { loadPlan, savePlan } from "../util/planStore";
import { greeting, longDate, nextDays, normalizeRecipe, timeLabel } from "../util/recipeUtils";
import { C, F, SCREEN_PAD } from "../constants/theme";

const meta = (r) => [r.time ? timeLabel(r.time) : null, r.cat[0]].filter(Boolean).join(" · ");

function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const meals = useMeals();
  // The hero card is dinner when it is part of the day, else the last meal of the day.
  const heroMeal = meals.includes("ערב") ? "ערב" : meals[meals.length - 1];
  const [recipes, setRecipes] = useState([]);
  const [plan, setPlan] = useState({});
  const [prep, setPrep] = useState({});
  const [pickerMeal, setPickerMeal] = useState(null);
  const today = new Date();

  const load = useCallback(async () => {
    const [rows, stored] = await Promise.all([fetchAllRecipesWithCategories(), loadPlan()]);
    setRecipes((rows || []).map(normalizeRecipe));
    setPlan(stored.plan);
    setPrep(stored.prep);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const byId = (id) => recipes.find((r) => r.id === id);
  const openRecipe = (r) => navigation.navigate("RecipeDisplay", { recipeId: r.id });
  const slot = (meal) => byId(plan[slotKey(today, meal)]);
  const dinner = slot(heroMeal);
  const recent = [...recipes].sort((a, b) => b.id - a.id).slice(0, 6);
  const filled = nextDays(7).reduce(
    (n, d) => n + meals.filter((m) => byId(plan[slotKey(d, m)])).length,
    0
  );
  const emptySlots = 7 * meals.length - filled;

  const assign = (recipe, meal) => {
    const key = slotKey(today, meal);
    const nextPlan = { ...plan, [key]: recipe.id };
    const nextPrep = { ...prep };
    delete nextPrep[key];
    setPlan(nextPlan);
    setPrep(nextPrep);
    savePlan(nextPlan, nextPrep);
    toast(`${recipe.title} שובץ ל${meal}`);
  };

  // "✦ הציעו לי": a main dish that is not already somewhere in the plan.
  const suggestDinner = () => {
    const used = new Set(Object.values(plan));
    const mains = recipes.filter((r) => r.cat.includes("עיקריות"));
    const pool = mains.length ? mains : recipes;
    const pick = pool.find((r) => !used.has(r.id)) || pool[0];
    if (pick) assign(pick, heroMeal);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 10 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ gap: 2 }}>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.date}>{longDate(today)}</Text>
          </View>
          <RoundButton icon="settings-outline" onPress={() => navigation.navigate("Settings")} />
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.search}
          onPress={() => navigation.navigate("All Recipes", { focusSearch: Date.now() })}
        >
          <Ionicons name="search" size={19} color={C.ink} />
          <Text style={styles.searchText}>חיפוש ב־{recipes.length} מתכונים</Text>
        </TouchableOpacity>

        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>
              {heroMeal === "ערב" ? "הערב" : `היום · ${heroMeal}`}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Meal Plan")}>
              <Text style={styles.link}>לתכנון השבוע</Text>
            </TouchableOpacity>
          </View>

          {dinner ? (
            <TouchableOpacity activeOpacity={0.9} onPress={() => openRecipe(dinner)}>
              <RecipeImage recipe={dinner.row} style={styles.hero}>
                <LinearGradient
                  colors={["rgba(20,22,18,0)", "rgba(20,22,18,0.82)"]}
                  style={styles.heroFade}
                >
                  <Text style={styles.heroMeta}>
                    {[dinner.time ? timeLabel(dinner.time) : null, `${dinner.servings} מנות`]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  <Text style={styles.heroTitle} numberOfLines={2}>
                    {dinner.title}
                  </Text>
                  <TouchableOpacity
                    style={styles.heroBtn}
                    onPress={() => navigation.navigate("CookingMode", { recipeId: dinner.id })}
                  >
                    <Ionicons name="flame-outline" size={17} color={C.ink} />
                    <Text style={styles.heroBtnText}>מתחילים לבשל</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </RecipeImage>
            </TouchableOpacity>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {heroMeal === "ערב"
                  ? "עוד לא הוחלט מה אוכלים הערב"
                  : `עוד לא הוחלט מה אוכלים ב${heroMeal}`}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {recipes.length > 0 && (
                  <TouchableOpacity style={styles.solidBtn} onPress={suggestDinner}>
                    <Text style={styles.solidBtnText}>✦ הציעו לי מהמתכונים שלי</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.outlineBtn} onPress={() => setPickerMeal(heroMeal)}>
                  <Text style={styles.outlineBtnText}>אבחר לבד</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.list}>
            {meals.map((meal, i) => {
              const r = slot(meal);
              return (
                <TouchableOpacity
                  key={meal}
                  activeOpacity={0.7}
                  style={[styles.listRow, i > 0 && styles.listDivider]}
                  onPress={() => (r ? openRecipe(r) : setPickerMeal(meal))}
                >
                  <Text style={styles.mealLabel}>{meal}</Text>
                  {r ? (
                    <>
                      <RecipeImage recipe={r.row} style={styles.thumb} />
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {r.title}
                      </Text>
                      <Ionicons name="chevron-back" size={18} color={C.faint2} />
                    </>
                  ) : (
                    <Text style={styles.addSlot}>+ שבצו מתכון</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.aiCard}
          onPress={() => navigation.navigate("Meal Plan", { openAutoFill: Date.now() })}
        >
          <View style={styles.aiTile}>
            <Text style={styles.aiTileText}>✦</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.aiTitle}>תכננו את השבוע אוטומטית</Text>
            <Text style={styles.aiSub}>
              {emptySlots
                ? `${emptySlots} משבצות ריקות השבוע. ממלאים מתוך המתכונים שלך.`
                : "השבוע מלא. אפשר לבקש הצעה אחרת."}
            </Text>
          </View>
          <Ionicons name="chevron-back" size={18} color={C.accent} />
        </TouchableOpacity>

        {recent.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>נוספו לאחרונה</Text>
              <TouchableOpacity onPress={() => navigation.navigate("All Recipes")}>
                <Text style={styles.link}>לכל המתכונים</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.bleed}
              contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, gap: 12 }}
            >
              {recent.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  activeOpacity={0.85}
                  style={styles.recentCard}
                  onPress={() => openRecipe(r)}
                >
                  <RecipeImage recipe={r.row} style={styles.recentImg} />
                  <Text style={styles.recentTitle}>{r.title}</Text>
                  <Text style={styles.recentMeta}>{meta(r)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      <RecipePickerSheet
        visible={!!pickerMeal}
        title={pickerMeal ? `${pickerMeal} · היום` : ""}
        recipes={recipes.map((r) => ({ ...r.row, id: r.id }))}
        onPick={(row) => {
          const meal = pickerMeal;
          setPickerMeal(null);
          assign(byId(row.id), meal);
        }}
        onClose={() => setPickerMeal(null)}
      />
    </View>
  );
}

export default HomeScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  content: { paddingHorizontal: SCREEN_PAD, paddingBottom: 28, gap: 22 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  greeting: { fontFamily: F.medium, fontSize: 15, color: C.muted },
  date: { fontFamily: F.display900, fontSize: 30, lineHeight: 33, color: C.ink },
  search: {
    height: 48,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  searchText: { fontFamily: F.body, fontSize: 15, color: C.faint },
  section: { gap: 12 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  sectionTitle: { fontFamily: F.display700, fontSize: 20, color: C.ink },
  link: { fontFamily: F.semi, fontSize: 14, color: C.accent },
  hero: { height: 250, borderRadius: 22 },
  heroFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 60,
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 10,
  },
  heroMeta: { fontFamily: F.medium, fontSize: 13, color: "rgba(255,255,255,0.85)" },
  heroTitle: { fontFamily: F.display900, fontSize: 28, lineHeight: 31, color: C.white },
  heroBtn: {
    alignSelf: "flex-start",
    height: 40,
    borderRadius: 20,
    backgroundColor: C.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  heroBtnText: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  empty: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: C.line4,
    borderRadius: 22,
    paddingVertical: 26,
    paddingHorizontal: 20,
    gap: 14,
    alignItems: "flex-start",
  },
  emptyTitle: { fontFamily: F.display700, fontSize: 22, lineHeight: 26, color: C.ink },
  solidBtn: {
    height: 40,
    borderRadius: 20,
    backgroundColor: C.accent,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  solidBtnText: { fontFamily: F.semi, fontSize: 14, color: C.white },
  outlineBtn: {
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line4,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  outlineBtnText: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  list: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  listDivider: { borderTopWidth: 1, borderTopColor: C.line2 },
  mealLabel: { width: 60, fontFamily: F.semi, fontSize: 13, color: C.muted },
  thumb: { width: 36, height: 36, borderRadius: 10 },
  rowTitle: { flex: 1, fontFamily: F.semi, fontSize: 15, color: C.ink },
  addSlot: { flex: 1, fontFamily: F.medium, fontSize: 15, color: C.accent },
  aiCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: C.accentSoft,
  },
  aiTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  aiTileText: { color: C.white, fontSize: 20 },
  aiTitle: { fontFamily: F.bold, fontSize: 16, color: C.ink },
  aiSub: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: C.muted2 },
  bleed: { marginHorizontal: -SCREEN_PAD },
  recentCard: { width: 148, gap: 8 },
  recentImg: { width: 148, height: 120, borderRadius: 16 },
  recentTitle: { fontFamily: F.semi, fontSize: 14, lineHeight: 18, color: C.ink },
  recentMeta: { fontFamily: F.body, fontSize: 12, color: C.muted, marginTop: -4 },
});
