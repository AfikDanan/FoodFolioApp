import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchRecipeById, deleteRecipeById } from "../util/database";
import {
  RoundButton,
  Checkbox,
  QuantityStepper,
  RecipeImage,
  Sheet,
  useToast,
} from "../components/UI/kit";
import { fetchSubstitutes } from "../util/substitute";
import { addToShoppingList } from "../util/shopping";
import {
  displayUnit,
  formatQty,
  hasPhoto,
  parseIngredients,
  parseJsonList,
  parseQty,
  parseSteps,
  quantityStep,
  recipeTimeLabel,
  stepQuantity,
} from "../util/recipeUtils";
import { C, F, SCREEN_PAD } from "../constants/theme";

const HERO_HEIGHT = 330;

function RecipeDetailScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { recipeId, selectedCategory } = route.params;
  const [recipe, setRecipe] = useState(null);
  const [servings, setServings] = useState(4);
  const [checked, setChecked] = useState({});
  const [subs, setSubs] = useState({}); // { index: { name, unit, ratio } }
  const [subSheet, setSubSheet] = useState(null); // { index, loading, options, error }
  const [mult, setMult] = useState({}); // { index: multiplier } from the + / - controls
  const [editing, setEditing] = useState(null); // index of the row showing its stepper
  const [addSheet, setAddSheet] = useState(null); // { picked: { index: true } }

  useEffect(() => {
    let alive = true;
    fetchRecipeById(recipeId).then((data) => {
      if (!alive || !data) return;
      const names = data.categoryNames ? data.categoryNames.split(",") : [];
      setRecipe({ ...data, category: selectedCategory || names[0] || "ללא קטגוריה" });
      setServings(data.servings || 4);
    });
    return () => {
      alive = false;
    };
  }, [recipeId, selectedCategory]);

  const base = recipe?.servings || 4;
  const factor = servings / base;
  const ingredients = useMemo(() => (recipe ? parseIngredients(recipe.ingredients) : []), [recipe]);
  const steps = useMemo(() => (recipe ? parseSteps(recipe.instructions) : []), [recipe]);
  const tags = recipe ? parseJsonList(recipe.tags) : [];
  const estimated = recipe ? parseJsonList(recipe.est_idx) : [];

  if (!recipe) {
    return <View style={styles.root} />;
  }

  // The amount shown for ingredient `index`: the recipe amount, scaled by servings,
  // by a substitute's ratio and by any + / - taps (the base is what servings alone give).
  const baseQty = (index) =>
    parseQty(ingredients[index].quantity) * factor * (subs[index] ? subs[index].ratio : 1);
  const qtyOf = (index) => baseQty(index) * (mult[index] ?? 1);
  const unitOf = (index) => (subs[index] ? subs[index].unit : ingredients[index].unit);
  const nameOf = (index) => (subs[index] ? subs[index].name : ingredients[index].name);

  const lineFor = (ing, index) => {
    const q = qtyOf(index);
    return {
      qty: [formatQty(q), displayUnit(q, unitOf(index), true)].filter(Boolean).join(" "),
      name: nameOf(index) + (ing.optional && !subs[index] ? " (אופציונלי)" : ""),
    };
  };

  const changeQty = (index, direction) => {
    const next = stepQuantity(qtyOf(index), unitOf(index), direction);
    if (next < quantityStep(unitOf(index))) return; // never below one step
    setMult((m) => ({ ...m, [index]: next / baseQty(index) }));
  };

  const openSubstitutes = async (index) => {
    const ing = ingredients[index];
    setSubSheet({ index, loading: true, options: [], error: false });
    try {
      const options = await fetchSubstitutes({
        ingredient: ing.name,
        quantity: qtyOf(index),
        unit: unitOf(index),
        recipeTitle: recipe.title,
        others: ingredients.filter((_, i) => i !== index).map((i) => i.name),
      });
      setSubSheet({ index, loading: false, options, error: false });
    } catch (e) {
      setSubSheet({ index, loading: false, options: [], error: true });
    }
  };

  const applySubstitute = (option) => {
    const index = subSheet.index;
    const original = parseQty(ingredients[index].quantity) * factor;
    setSubs((prev) => ({
      ...prev,
      [index]: {
        name: option.name,
        unit: option.unit,
        ratio: original ? option.quantity / original : 1,
      },
    }));
    setMult((m) => {
      const next = { ...m };
      delete next[index];
      return next;
    });
    setSubSheet(null);
    toast("הוחלף ל" + option.name);
  };

  const openAddSheet = () =>
    setAddSheet({ picked: Object.fromEntries(ingredients.map((_, i) => [i, true])) });

  const pickedCount = addSheet ? Object.values(addSheet.picked).filter(Boolean).length : 0;

  const addPicked = async () => {
    const items = ingredients
      .map((ing, i) => ({
        name: nameOf(i),
        quantity: qtyOf(i),
        unit: unitOf(i) || "יחידה",
        department: ing.department || "אחר",
        keep: !!addSheet.picked[i],
      }))
      .filter((item) => item.keep && item.name)
      .map(({ keep, ...item }) => item);
    setAddSheet(null);
    if (!items.length) return;
    await addToShoppingList(items);
    toast(`${items.length} מרכיבים נוספו לרשימת הקניות`);
  };

  const confirmDelete = () => {
    Alert.alert("מחיקת מתכון", "האם אתה בטוח שברצונך למחוק את המתכון?", [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחיקה",
        style: "destructive",
        onPress: async () => {
          await deleteRecipeById(recipe.id);
          navigation.reset({ index: 0, routes: [{ name: "Home" }] });
        },
      },
    ]);
  };

  const generatePdf = async () => {
    let imageTag = "";
    if (hasPhoto(recipe.image)) {
      try {
        const b64 = await FileSystem.readAsStringAsync(recipe.image, { encoding: "base64" });
        imageTag = `<img src="data:image/png;base64,${b64}" class="recipe-image" />`;
      } catch (error) {
        console.error("Failed to convert image to base64:", error);
      }
    }
    const html = `
      <html dir="rtl" lang="he">
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; direction: rtl; text-align: right; }
            .container { padding: 20px 50px; }
            .title { font-size: 24px; font-weight: bold; text-align: center; margin-bottom: 20px; }
            .meta-info { text-align: center; margin-bottom: 20px; }
            .heading { font-size: 20px; font-weight: bold; margin-bottom: 10px; }
            .ingredient-item { margin-bottom: 5px; }
            .recipe-image { width: 100%; height: auto; margin-bottom: 20px; }
            ol { padding-right: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            ${imageTag}
            <div class="title">${recipe.title}</div>
            <div class="meta-info">${recipe.category} &#8226; ${recipe.totalTime || "לא צוין"} &#8226; ${servings} מנות</div>
            <div class="heading">מרכיבים</div>
            ${ingredients
              .map((i, idx) => {
                const l = lineFor(i, idx);
                return `<div class="ingredient-item">${l.qty} ${l.name}</div>`;
              })
              .join("")}
            <div class="heading" style="margin-top:20px">הוראות הכנה</div>
            <ol>${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
          </div>
        </body>
      </html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      // Share from our own cache folder: the print output location is not always readable by the share sheet.
      const safeName = (recipe.title || "recipe").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) || "recipe";
      const target = `${FileSystem.cacheDirectory}${safeName}.pdf`;
      await FileSystem.deleteAsync(target, { idempotent: true });
      await FileSystem.copyAsync({ from: uri, to: target });
      await Sharing.shareAsync(target, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: recipe.title,
      });
    } catch (e) {
      console.warn("Share recipe as PDF failed", e);
      // Fall back to plain text, which every share target accepts.
      const text = [
        recipe.title,
        "",
        "מרכיבים",
        ...ingredients.map((i, idx) => {
          const l = lineFor(i, idx);
          return `• ${l.qty} ${l.name}`.replace(/\s+/g, " ");
        }),
        "",
        "הוראות הכנה",
        ...steps.map((s, n) => `${n + 1}. ${s}`),
      ].join("\n");
      try {
        await Share.share({ message: text });
      } catch (err) {
        Alert.alert("השיתוף נכשל", String(err?.message || e?.message || err));
      }
    }
  };

  const time = recipeTimeLabel(recipe) || recipe.totalTime || "לא צוין";

  return (
    <View style={styles.root}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <RecipeImage recipe={recipe} style={{ height: HERO_HEIGHT }} />

        <View style={styles.sheet}>
          <Text style={styles.category}>{recipe.category}</Text>
          <Text style={styles.title}>{recipe.title}</Text>
          {tags.length > 0 && (
            <View style={styles.tags}>
              {tags.map((t) => (
                <View key={t} style={styles.tagPill}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.statRow}>
            <View style={[styles.stat, { flex: 1 }]}>
              <Text style={styles.statLabel}>זמן כולל</Text>
              <Text style={styles.statValue}>{time}</Text>
            </View>
            <View style={[styles.stat, styles.servingsCard, { flex: 1.4 }]}>
              <View style={{ gap: 2 }}>
                <Text style={styles.statLabel}>מנות</Text>
                <Text style={styles.statValue}>{servings}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: C.chip }]}
                  onPress={() => setServings(Math.max(1, servings - 1))}
                >
                  <Ionicons name="remove" size={18} color={C.ink} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: C.ink }]}
                  onPress={() => setServings(servings + 1)}
                >
                  <Ionicons name="add" size={18} color={C.white} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {servings !== base && (
            <View style={styles.scaleNote}>
              <Text style={styles.scaleText}>
                ✦ הכמויות חושבו מחדש מ־{base} ל־{servings} מנות
              </Text>
              <TouchableOpacity onPress={() => setServings(base)}>
                <Text style={styles.scaleReset}>איפוס</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>מרכיבים</Text>
            <TouchableOpacity onPress={openAddSheet}>
              <Text style={styles.sectionLink}>+ לרשימת הקניות</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            {ingredients.length === 0 && <Text style={styles.empty}>אין מרכיבים</Text>}
            {ingredients.map((ing, i) => {
              const l = lineFor(ing, i);
              const on = !!checked[i];
              const sub = subs[i];
              const open = editing === i;
              const toggle = () => setChecked((c) => ({ ...c, [i]: !c[i] }));
              return (
                <View key={i} style={[styles.ingRow, i > 0 && styles.divider]}>
                  <View style={styles.ingMain}>
                    <Checkbox checked={on} onPress={toggle} />
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={toggle}
                      style={[{ flex: 1, gap: 1 }, on && { opacity: 0.45 }]}
                    >
                      <Text style={styles.ingText}>{l.name}</Text>
                      {estimated.includes(i) && !sub && mult[i] === undefined && (
                        <Text style={styles.estimated}>כמות משוערת, לא נאמרה בסרטון</Text>
                      )}
                      {!!sub && (
                        <Text style={styles.subbed}>
                          ✦ במקום {ing.name} ·{" "}
                          <Text
                            style={{ textDecorationLine: "underline" }}
                            onPress={() =>
                              setSubs((prev) => {
                                const next = { ...prev };
                                delete next[i];
                                return next;
                              })
                            }
                          >
                            החזרה
                          </Text>
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={[styles.qtyPill, open && styles.qtyPillOn]}
                      onPress={() => setEditing(open ? null : i)}
                    >
                      <Text style={[styles.qtyPillText, mult[i] !== undefined && { color: C.accent }]}>
                        {l.qty}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {open && (
                    <View style={styles.editRow}>
                      <QuantityStepper
                        label={l.qty}
                        onDec={() => changeQty(i, -1)}
                        onInc={() => changeQty(i, 1)}
                      />
                      {!sub && (
                        <TouchableOpacity style={styles.subPill} onPress={() => openSubstitutes(i)}>
                          <Ionicons name="swap-horizontal" size={14} color={C.muted2} />
                          <Text style={styles.subPillText}>תחליף</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>אופן ההכנה</Text>
          <View style={{ gap: 16 }}>
            {steps.map((s, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{s}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.floating, { top: insets.top + 8 }]} pointerEvents="box-none">
        <RoundButton
          icon="arrow-forward"
          bg="rgba(255,253,249,0.92)"
          onPress={() => navigation.goBack()}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <RoundButton icon="share-outline" bg="rgba(255,253,249,0.92)" onPress={generatePdf} />
          <RoundButton
            icon="create-outline"
            bg="rgba(255,253,249,0.92)"
            onPress={() => navigation.navigate("EditRecipe", { recipeId: recipe.id })}
          />
          <RoundButton icon="trash-outline" bg="rgba(255,253,249,0.92)" onPress={confirmDelete} />
        </View>
      </View>

      <Sheet visible={!!addSheet} onClose={() => setAddSheet(null)}>
        {addSheet && (
          <View style={{ gap: 14 }}>
            <View style={styles.pickHead}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.sheetTitle}>הוספה לרשימת הקניות</Text>
                <Text style={styles.sheetSub}>בחרו אילו מרכיבים להוסיף</Text>
              </View>
              <TouchableOpacity
                onPress={() =>
                  setAddSheet({
                    picked: Object.fromEntries(ingredients.map((_, i) => [i, pickedCount === 0])),
                  })
                }
              >
                <Text style={styles.sectionLink}>{pickedCount === 0 ? "בחירת הכל" : "ניקוי"}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickList} showsVerticalScrollIndicator={false}>
              {ingredients.map((ing, i) => {
                const l = lineFor(ing, i);
                const toggle = () =>
                  setAddSheet((a) => ({ picked: { ...a.picked, [i]: !a.picked[i] } }));
                return (
                  <TouchableOpacity
                    key={i}
                    activeOpacity={0.7}
                    style={[styles.pickRow, i > 0 && styles.divider]}
                    onPress={toggle}
                  >
                    <Checkbox checked={!!addSheet.picked[i]} onPress={toggle} />
                    <Text style={styles.pickName}>{nameOf(i)}</Text>
                    <Text style={styles.pickQty}>{l.qty}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={pickedCount === 0}
              style={[styles.pickCta, pickedCount === 0 && { opacity: 0.4 }]}
              onPress={addPicked}
            >
              <Text style={styles.pickCtaText}>
                {pickedCount === 0 ? "בחרו מרכיב אחד לפחות" : `הוספת ${pickedCount} מרכיבים`}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </Sheet>

      <Sheet visible={!!subSheet} onClose={() => setSubSheet(null)}>
        {subSheet && (
          <View style={{ gap: 14 }}>
            <View style={{ gap: 2 }}>
              <Text style={styles.sheetTitle}>תחליף ל{ingredients[subSheet.index]?.name}</Text>
              <Text style={styles.sheetSub}>הכמויות מחושבות לכמות במתכון הזה</Text>
            </View>
            {subSheet.loading && (
              <ActivityIndicator color={C.accent} style={{ paddingVertical: 24 }} />
            )}
            {subSheet.error && (
              <Text style={styles.sheetSub}>לא הצלחנו להביא הצעות כרגע, נסו שוב בעוד רגע.</Text>
            )}
            {subSheet.options.map((o) => (
              <TouchableOpacity
                key={o.name}
                activeOpacity={0.8}
                style={styles.option}
                onPress={() => applySubstitute(o)}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.optionTitle}>
                    {[formatQty(o.quantity), o.unit === "יחידה" ? "" : o.unit, o.name]
                      .filter(Boolean)
                      .join(" ")}
                  </Text>
                  <Text style={styles.optionNote}>{o.note}</Text>
                </View>
                <Text style={styles.optionApply}>החלפה</Text>
              </TouchableOpacity>
            ))}
            <Text style={styles.sheetFoot}>✦ ההצעות נוצרות לפי המתכון והכמות. כדאי לטעום ולהתאים.</Text>
          </View>
        )}
      </Sheet>

      <LinearGradient
        colors={["rgba(245,242,235,0)", C.paper]}
        locations={[0, 0.4]}
        style={[styles.cta, { paddingBottom: Math.max(insets.bottom, 16) }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.ctaBtn}
          onPress={() => navigation.navigate("CookingMode", { recipeId: recipe.id, servings })}
        >
          <Ionicons name="flame-outline" size={22} color={C.white} />
          <Text style={styles.ctaText}>מצב בישול</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

export default RecipeDetailScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  floating: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sheet: {
    marginTop: -28,
    backgroundColor: C.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 24,
    paddingHorizontal: SCREEN_PAD,
    gap: 14,
  },
  category: { fontFamily: F.medium, fontSize: 13, color: C.accent },
  title: { fontFamily: F.display900, fontSize: 30, lineHeight: 34, color: C.ink },
  statRow: { flexDirection: "row", gap: 10 },
  stat: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  statLabel: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  statValue: { fontFamily: F.bold, fontSize: 18, color: C.ink },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tagPill: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: C.chip,
    justifyContent: "center",
  },
  tagText: { fontFamily: F.medium, fontSize: 12, color: C.ink },
  servingsCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingStart: 14,
    paddingEnd: 8,
  },
  stepBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  estimated: { fontFamily: F.medium, fontSize: 12, color: C.warnText },
  subbed: { fontFamily: F.medium, fontSize: 12, color: C.accent },
  subPill: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line3,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  subPillText: { fontFamily: F.medium, fontSize: 12, color: C.muted2 },
  sheetTitle: { fontFamily: F.display700, fontSize: 22, color: C.ink },
  sheetSub: { fontFamily: F.body, fontSize: 14, color: C.muted },
  sheetFoot: { fontFamily: F.body, fontSize: 12, color: C.faint },
  option: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionTitle: { fontFamily: F.semi, fontSize: 16, color: C.ink },
  optionNote: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: C.muted },
  optionApply: { fontFamily: F.semi, fontSize: 13, color: C.accent },
  scaleNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.accentSoft,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  scaleText: { fontFamily: F.medium, fontSize: 13, color: C.ink, flex: 1 },
  scaleReset: { fontFamily: F.semi, fontSize: 13, color: C.accent },
  sectionRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 8 },
  sectionTitle: { fontFamily: F.display700, fontSize: 21, color: C.ink },
  sectionLink: { fontFamily: F.semi, fontSize: 14, color: C.accent },
  card: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line },
  empty: { fontFamily: F.body, color: C.muted, padding: 14 },
  ingRow: { paddingVertical: 11, paddingHorizontal: 14, gap: 10 },
  ingMain: { flexDirection: "row", alignItems: "center", gap: 12 },
  qtyPill: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: C.chip,
    justifyContent: "center",
  },
  qtyPillOn: { backgroundColor: C.accentSoft },
  qtyPillText: { fontFamily: F.bold, fontSize: 13, color: C.ink },
  editRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingStart: 34 },
  pickHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  pickList: { maxHeight: 360, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 14 },
  pickName: { flex: 1, fontFamily: F.medium, fontSize: 15, color: C.ink },
  pickQty: { fontFamily: F.semi, fontSize: 13, color: C.muted },
  pickCta: { height: 54, borderRadius: 16, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  pickCtaText: { fontFamily: F.semi, fontSize: 16, color: C.white },
  divider: { borderTopWidth: 1, borderTopColor: C.line2 },
  ingText: { fontFamily: F.body, fontSize: 15, color: C.ink },
  ingQty: { fontFamily: F.bold },
  stepRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stepNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { fontFamily: F.bold, fontSize: 14, color: C.white },
  stepText: { flex: 1, fontFamily: F.body, fontSize: 16, lineHeight: 26, color: C.ink },
  cta: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 28, paddingHorizontal: SCREEN_PAD },
  ctaBtn: {
    height: 56,
    borderRadius: 18,
    backgroundColor: C.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaText: { fontFamily: F.semi, fontSize: 17, color: C.white },
});
