import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchAllRecipesWithCategories } from "../util/database";
import { Segmented, RecipeImage, useToast } from "../components/UI/kit";
import RecipePickerSheet from "../components/RecipePickerSheet";
import AutoFillSheet, { DEFAULT_FILL_OPTIONS } from "../components/AutoFillSheet";
import BatchCooking from "../components/BatchCooking";
import { addToShoppingList, recipeToShoppingItems } from "../util/shopping";
import { generateFill, slotKey } from "../util/planner";
import { useMeals } from "../util/mealSettings";
import { loadPlan, savePlan, loadCookSession, saveCookSession } from "../util/planStore";
import { dateKey, dayName, normalizeRecipe, nextDays, shortDate } from "../util/recipeUtils";
import { C, F, SCREEN_PAD } from "../constants/theme";

const dayLabel = (date, index) => (index === 1 ? "מחר" : dayName(date));

const omit = (obj, key) => {
  const next = { ...obj };
  delete next[key];
  return next;
};

function MealPlanningScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const meals = useMeals();
  const days = useMemo(() => nextDays(7), []);
  const [mode, setMode] = useState("daily");
  const [recipes, setRecipes] = useState([]);
  const [plan, setPlan] = useState({}); // { "YYYY-MM-DD|meal": recipeId }
  const [prep, setPrep] = useState({}); // { key: "fridge" | "freeze" }
  const [session, setSession] = useState(null); // the saved cooking day
  const [review, setReview] = useState(null); // { before, beforePrep, suggested, seed }
  const [picker, setPicker] = useState(null);
  const [fillOpen, setFillOpen] = useState(false);
  const [fillOptions, setFillOptions] = useState(DEFAULT_FILL_OPTIONS);

  const load = useCallback(async () => {
    const [rows, stored, cook] = await Promise.all([
      fetchAllRecipesWithCategories(),
      loadPlan(),
      loadCookSession(),
    ]);
    setRecipes((rows || []).map(normalizeRecipe));
    setPlan(stored.plan);
    setPrep(stored.prep);
    setSession(cook);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Home's AI card opens the sheet here.
  const fillToken = route.params?.openAutoFill;
  useEffect(() => {
    if (fillToken) {
      setMode("daily");
      setFillOpen(true);
    }
  }, [fillToken]);

  // Home's cooking-day card opens the cooking day here.
  const cookToken = route.params?.openCookDay;
  useEffect(() => {
    if (cookToken) setMode("prep");
  }, [cookToken]);

  const byId = (id) => recipes.find((r) => r.id === id);
  const inWeek = (key) => days.some((d) => key.startsWith(dateKey(d)));
  const slotsInWeek = 7 * meals.length;
  // Batch cooking needs a lunch or a dinner to cover.
  const canBatch = meals.includes("צהריים") || meals.includes("ערב");
  const isEnabled = (key) => meals.includes(key.split("|")[1]);
  const planned = Object.keys(plan).filter(
    (k) => inWeek(k) && isEnabled(k) && byId(plan[k])
  ).length;
  const emptyCount = slotsInWeek - planned;

  const commit = (nextPlan, nextPrep) => {
    setPlan(nextPlan);
    setPrep(nextPrep);
    savePlan(nextPlan, nextPrep);
  };

  const assign = (recipe) => {
    const { key, meal } = picker;
    setPicker(null);
    commit({ ...plan, [key]: recipe.id }, omit(prep, key));
    toast(`${recipe.title} שובץ ל${meal}`);
  };

  const remove = (key) => commit(omit(plan, key), omit(prep, key));

  const runFill = (seed, base = { plan, prep }) => {
    const { plan: filled, suggested } = generateFill({
      recipes,
      plan: base.plan,
      days,
      options: fillOptions,
      seed,
      meals,
    });
    commit(filled, base.prep);
    setReview({ before: base.plan, beforePrep: base.prep, suggested, seed });
    setFillOpen(false);
    setMode("daily");
  };

  const retry = () => runFill(review.seed + 1, { plan: review.before, prep: review.beforePrep });
  const undo = () => {
    commit(review.before, review.beforePrep);
    setReview(null);
  };

  const buildShoppingList = async () => {
    const keys = Object.keys(plan).filter((k) => inWeek(k) && isEnabled(k) && byId(plan[k]));
    if (!keys.length) return;
    await addToShoppingList(keys.flatMap((k) => recipeToShoppingItems(byId(plan[k]).row)));
    setReview(null);
    toast(`נוספו מרכיבים מ־${keys.length} ארוחות, ממוזגים לפי מוצר`);
    navigation.navigate("Shopping List");
  };

  // Saves the cooking day. Meals an earlier version of it filled are cleared first.
  const applyBatch = async ({ plan: batchPlan, prep: batchPrep, session: next }) => {
    const basePlan = { ...plan };
    const basePrep = { ...prep };
    for (const key of session?.slots || []) {
      delete basePlan[key];
      delete basePrep[key];
    }
    commit({ ...basePlan, ...batchPlan }, { ...basePrep, ...batchPrep });
    setReview(null); // the batch replaces any pending suggestions
    setSession(await saveCookSession(next));
    setMode("daily");
    toast(`יום הבישול נשמר, ${Object.keys(batchPlan).length} ארוחות שובצו בלוח`);
  };

  const cookNow = (params) => navigation.navigate("CookTogether", params);

  // Stay on the cooking day so the plan is not lost; the list is one tap away.
  const batchShopping = async (items, count) => {
    await addToShoppingList(items);
    toast(`נוספו מרכיבים ל־${count} מתכונים, מוכפלים לכמות הנדרשת`, {
      label: "לקניות",
      onPress: () => navigation.navigate("Shopping List"),
    });
  };

  const reviewCount = review ? Object.keys(review.suggested).length : 0;

  return (
    <View style={styles.root}>
      <View style={[styles.head, { paddingTop: insets.top + 10 }]}>
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>השבוע</Text>
            <Text style={styles.subtitle}>
              {shortDate(days[0])}–{shortDate(days[6])} · {planned} מתוך {slotsInWeek} ארוחות
            </Text>
          </View>
          {mode === "daily" && (
            <TouchableOpacity style={styles.aiBtn} onPress={() => setFillOpen(true)}>
              <Text style={styles.aiBtnText}>✦ מילוי אוטומטי</Text>
            </TouchableOpacity>
          )}
        </View>
        {canBatch && (
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { key: "daily", label: "לפי ימים", icon: "calendar-outline" },
              { key: "prep", label: "יום בישול", icon: "flame-outline" },
            ]}
          />
        )}
      </View>

      {mode === "prep" && canBatch ? (
        <BatchCooking
          recipes={recipes}
          session={session}
          onSave={applyBatch}
          onCookNow={cookNow}
          onShopping={batchShopping}
          toast={toast}
          meals={meals}
        />
      ) : (
        <>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {review && (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>
                  ✦ שובצו {reviewCount} ארוחות מתוך המתכונים שלך. המסומנות במסגרת הן ההצעות.
                </Text>
                <View style={styles.bannerBtns}>
                  <TouchableOpacity style={styles.bLight} onPress={() => setReview(null)}>
                    <Text style={styles.bLightText}>אישור</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.bOutline} onPress={retry}>
                    <Text style={styles.bOutlineText}>הצעה אחרת</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.bText} onPress={undo}>
                    <Text style={styles.bTextText}>ביטול</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {days.map((date, i) => (
              <View key={dateKey(date)} style={[styles.dayCard, i === 0 && styles.today]}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayName}>{dayLabel(date, i)}</Text>
                  <Text style={styles.dayDate}>{shortDate(date)}</Text>
                  {i === 0 && (
                    <View style={styles.todayBadge}>
                      <Text style={styles.todayBadgeText}>היום</Text>
                    </View>
                  )}
                  {session?.date === dateKey(date) && (
                    <View style={styles.cookBadge}>
                      <Ionicons name="flame" size={12} color={C.white} />
                      <Text style={styles.cookBadgeText}>יום בישול</Text>
                    </View>
                  )}
                </View>
                {meals.map((meal) => {
                  const key = slotKey(date, meal);
                  const r = byId(plan[key]);
                  const ai = !!review?.suggested[key];
                  const tag = prep[key];
                  return (
                    <View key={meal} style={styles.slotRow}>
                      <Text style={styles.mealLabel}>{meal}</Text>
                      {r ? (
                        <>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={[
                              styles.filled,
                              {
                                borderWidth: ai ? 1.5 : 1,
                                borderColor: ai ? C.accent : "transparent",
                                backgroundColor: ai ? C.accentSofter : C.paper,
                              },
                            ]}
                            onPress={() => navigation.navigate("RecipeDisplay", { recipeId: r.id })}
                          >
                            <RecipeImage recipe={r} style={styles.thumb} />
                            <Text style={styles.filledTitle} numberOfLines={1}>
                              {r.title}
                            </Text>
                            {ai && <Text style={styles.sparkle}>✦</Text>}
                            {!!tag && (
                              <View style={styles.prepTag}>
                                <Ionicons
                                  name={tag === "freeze" ? "snow-outline" : "cube-outline"}
                                  size={14}
                                  color={tag === "freeze" ? C.freezeFg : C.muted}
                                />
                                <Text
                                  style={[
                                    styles.prepText,
                                    { color: tag === "freeze" ? C.freezeFg : C.muted },
                                  ]}
                                >
                                  {tag === "freeze" ? "מקפיא" : "מוכן"}
                                </Text>
                              </View>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.remove} onPress={() => remove(key)}>
                            <Ionicons name="close" size={18} color={C.faint2} />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          style={styles.emptySlot}
                          onPress={() =>
                            setPicker({
                              key,
                              meal,
                              label: `${meal} · ${i === 0 ? "היום" : dayName(date)}`,
                            })
                          }
                        >
                          <Text style={styles.emptyText}>+ הוספה</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
                <View style={{ height: 7 }} />
              </View>
            ))}
          </ScrollView>

          <LinearGradient
            colors={["rgba(245,242,235,0)", C.paper]}
            locations={[0, 0.3]}
            style={styles.ctaWrap}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.cta, { opacity: planned ? 1 : 0.4 }]}
              onPress={buildShoppingList}
            >
              <Ionicons name="cart-outline" size={19} color={C.white} />
              <Text style={styles.ctaText}>רשימת קניות מ־{planned} ארוחות</Text>
            </TouchableOpacity>
          </LinearGradient>
        </>
      )}

      <RecipePickerSheet
        visible={!!picker}
        title={picker?.label || ""}
        recipes={recipes.map((r) => ({ ...r.row, id: r.id }))}
        onPick={(row) => assign(byId(row.id))}
        onClose={() => setPicker(null)}
      />
      <AutoFillSheet
        visible={fillOpen}
        onClose={() => setFillOpen(false)}
        recipeCount={recipes.length}
        emptyCount={emptyCount}
        options={fillOptions}
        onChange={setFillOptions}
        onGenerate={() => runFill((review?.seed ?? 0) + (emptyCount ? 0 : 1))}
      />
    </View>
  );
}

export default MealPlanningScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  head: { paddingHorizontal: SCREEN_PAD, gap: 14, paddingBottom: 14 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  title: { fontFamily: F.display900, fontSize: 30, color: C.ink },
  subtitle: { fontFamily: F.medium, fontSize: 14, color: C.muted },
  aiBtn: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    backgroundColor: C.accent,
    justifyContent: "center",
  },
  aiBtnText: { fontFamily: F.semi, fontSize: 14, color: C.white },
  content: { paddingHorizontal: SCREEN_PAD, paddingBottom: 110, gap: 14 },
  banner: { backgroundColor: C.ink, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  bannerText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.white },
  bannerBtns: { flexDirection: "row", gap: 8 },
  bLight: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: C.card, justifyContent: "center" },
  bLightText: { fontFamily: F.semi, fontSize: 13, color: C.ink },
  bOutline: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    justifyContent: "center",
  },
  bOutlineText: { fontFamily: F.semi, fontSize: 13, color: C.white },
  bText: { height: 34, paddingHorizontal: 14, justifyContent: "center" },
  bTextText: { fontFamily: F.semi, fontSize: 13, color: "rgba(255,255,255,0.75)" },
  dayCard: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, overflow: "hidden" },
  today: { borderWidth: 1.5, borderColor: C.accent },
  dayHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  dayName: { fontFamily: F.display700, fontSize: 17, color: C.ink },
  dayDate: { fontFamily: F.medium, fontSize: 13, color: C.muted },
  todayBadge: { backgroundColor: C.accentSoft, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2 },
  todayBadgeText: { fontFamily: F.semi, fontSize: 11, color: C.accent },
  cookBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.ink,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  cookBadgeText: { fontFamily: F.semi, fontSize: 11, color: C.white },
  slotRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, paddingStart: 14, paddingEnd: 10 },
  mealLabel: { width: 58, fontFamily: F.medium, fontSize: 13, color: C.muted },
  filled: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, padding: 4, borderRadius: 12, minWidth: 0 },
  thumb: { width: 34, height: 34, borderRadius: 9 },
  filledTitle: { flex: 1, fontFamily: F.semi, fontSize: 14, color: C.ink },
  sparkle: { color: C.accent, fontSize: 13 },
  prepTag: { flexDirection: "row", alignItems: "center", gap: 3, paddingEnd: 4 },
  prepText: { fontFamily: F.medium, fontSize: 11 },
  remove: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  emptySlot: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#ddd7ca",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  emptyText: { fontFamily: F.medium, fontSize: 14, color: C.faint },
  ctaWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 28,
    paddingHorizontal: SCREEN_PAD,
    paddingBottom: 14,
  },
  cta: {
    height: 52,
    borderRadius: 16,
    backgroundColor: C.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  ctaText: { fontFamily: F.semi, fontSize: 15, color: C.white },
});
