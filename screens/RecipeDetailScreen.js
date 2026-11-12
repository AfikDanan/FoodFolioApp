import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
import StepText from "../components/StepText";
import { fetchSubstitutes } from "../util/substitute";
import { dietConflicts, dietParts, hasDiet, suitsDiet } from "../util/diet";
import { usePrefs } from "../util/prefs";
import { amountLabel } from "../util/stepQuantities";
import { shareRecipes } from "../util/shareRecipes";
import { addToShoppingList } from "../util/shopping";
import {
  displayUnit,
  formatQty,
  parseIngredients,
  parseJsonList,
  parseQty,
  parseSteps,
  quantityStep,
  recipeTimeLabel,
  sourceInfo,
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
  const [replacingAll, setReplacingAll] = useState(false);
  const diet = usePrefs().diet;

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
  // { index: reason } for ingredients that do not suit the dietary preferences.
  const conflicts = useMemo(
    () => dietConflicts(ingredients.map((i) => i.name), diet),
    [ingredients, diet]
  );

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

  // Ingredients still flagged: a replaced one is settled.
  const flagged = Object.keys(conflicts)
    .map(Number)
    .filter((i) => !subs[i]);

  // Suggestions for one ingredient, without anything the household does not eat.
  const loadSubstitutes = async (index) => {
    const ing = ingredients[index];
    const otherNames = ingredients.map((_, i) => i).filter((i) => i !== index).map(nameOf);
    const options = await fetchSubstitutes({
      ingredient: ing.name,
      quantity: qtyOf(index),
      unit: unitOf(index),
      recipeTitle: recipe.title,
      others: otherNames,
      constraints: dietParts(diet),
    });
    return options.filter((o) => suitsDiet(o.name, diet, otherNames));
  };

  const openSubstitutes = async (index) => {
    setSubSheet({ index, loading: true, options: [], error: false });
    try {
      const options = await loadSubstitutes(index);
      setSubSheet({ index, loading: false, options, error: false });
    } catch (e) {
      setSubSheet({ index, loading: false, options: [], error: true });
    }
  };

  const setSubstitute = (index, option) => {
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
  };

  const applySubstitute = (option) => {
    setSubstitute(subSheet.index, option);
    setSubSheet(null);
    toast("הוחלף ל" + option.name);
  };

  // One tap for every flagged ingredient: take the best suggestion for each.
  const replaceAllFlagged = async () => {
    if (replacingAll) return;
    setReplacingAll(true);
    let replaced = 0;
    let missed = 0;
    for (const index of flagged) {
      try {
        const [best] = await loadSubstitutes(index);
        if (best) {
          setSubstitute(index, best);
          replaced += 1;
        } else {
          missed += 1;
        }
      } catch (e) {
        missed += 1;
      }
    }
    setReplacingAll(false);
    const done = replaced === 1 ? "מרכיב אחד הוחלף" : `${replaced} מרכיבים הוחלפו`;
    if (!replaced) toast("לא מצאנו תחליפים מתאימים כרגע, נסו שוב בעוד רגע");
    else if (missed) toast(`${done}. ל${missed === 1 ? "מרכיב אחד" : `־${missed} מרכיבים`} לא נמצא תחליף`);
    else toast(`${done}. אפשר לבטל כל החלפה ברשימה`);
  };

  // What the steps show next to each ingredient: the amount on screen now, and
  // the new name when the ingredient was replaced.
  const stepIngredients = ingredients.map((ing, i) => {
    const hasAmount = String(ing.quantity ?? "").trim() !== "";
    const amount = hasAmount || subs[i] ? amountLabel(qtyOf(i), unitOf(i)) : "";
    return {
      name: ing.name,
      label: subs[i] ? [subs[i].name, amount].filter(Boolean).join(" · ") : amount,
    };
  });

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

  // Share what is on screen: the current servings, quantities and substitutions.
  const generatePdf = async () => {
    try {
      await shareRecipes([
        {
          ...recipe,
          servings,
          ingredients: ingredients.map((ing, i) => ({
            ...ing,
            name: nameOf(i),
            quantity: qtyOf(i),
            unit: unitOf(i) || "יחידה",
          })),
        },
      ]);
    } catch (err) {
      Alert.alert("השיתוף נכשל", String(err?.message || err));
    }
  };

  const time = recipeTimeLabel(recipe) || recipe.totalTime || "לא צוין";
  const source = sourceInfo(recipe.source_url);

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

          {!!source && (
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.sourceRow}
              onPress={() =>
                Linking.openURL(source.url).catch(() => toast("לא הצלחנו לפתוח את הקישור"))
              }
            >
              <Ionicons name={source.icon} size={18} color={C.ink} />
              <Text style={styles.sourceText} numberOfLines={1}>
                למתכון המקורי ב{source.label}
              </Text>
              <Ionicons name="open-outline" size={16} color={C.muted} />
            </TouchableOpacity>
          )}

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

          {flagged.length > 0 && (
            <View style={styles.dietBanner}>
              <View style={styles.dietHead}>
                <Ionicons name="warning-outline" size={22} color={C.warnFg} style={{ marginTop: 1 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.dietTitle}>
                    {flagged.length === 1
                      ? "מרכיב אחד לא מתאים לך"
                      : `${flagged.length} מרכיבים לא מתאימים לך`}
                  </Text>
                  <Text style={styles.dietSub}>לפי ההעדפות שלך: {dietParts(diet).join(", ")}.</Text>
                </View>
              </View>
              <View style={styles.dietActions}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={replacingAll}
                  style={[styles.dietPrimary, replacingAll && { opacity: 0.7 }]}
                  onPress={flagged.length === 1 ? () => openSubstitutes(flagged[0]) : replaceAllFlagged}
                >
                  {replacingAll ? (
                    <ActivityIndicator color={C.white} size="small" />
                  ) : (
                    <Ionicons name="swap-horizontal" size={16} color={C.white} />
                  )}
                  <Text style={styles.dietPrimaryText}>
                    {replacingAll
                      ? "מחפש תחליפים"
                      : flagged.length === 1
                      ? "החלפת המרכיב"
                      : flagged.length === 2
                      ? "החלפת שניהם"
                      : "החלפת כולם"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.dietSecondary}
                  onPress={() => navigation.navigate("Settings")}
                >
                  <Text style={styles.dietSecondaryText}>שינוי ההעדפות</Text>
                </TouchableOpacity>
              </View>
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
              const reason = !sub ? conflicts[i] : null;
              const toggle = () => setChecked((c) => ({ ...c, [i]: !c[i] }));
              return (
                <View
                  key={i}
                  style={[
                    styles.ingRow,
                    i > 0 && styles.divider,
                    !!reason && styles.ingFlagged,
                    i === 0 && styles.ingFirst,
                    i === ingredients.length - 1 && styles.ingLast,
                  ]}
                >
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
                  {!!reason && (
                    <View style={styles.flagRow}>
                      <View style={styles.flagTag}>
                        <Text style={styles.flagTagText}>{reason}</Text>
                      </View>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.flagBtn}
                        onPress={() => openSubstitutes(i)}
                      >
                        <Ionicons name="swap-horizontal" size={16} color={C.white} />
                        <Text style={styles.flagBtnText}>החלפה</Text>
                      </TouchableOpacity>
                    </View>
                  )}
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
                <StepText style={styles.stepText} text={s} ingredients={stepIngredients} />
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
              <Text style={styles.sheetSub}>
                {hasDiet(diet)
                  ? "מתאימים להעדפות שלך, בכמות שהמתכון הזה צריך"
                  : "הכמויות מחושבות לכמות במתכון הזה"}
              </Text>
            </View>
            {subSheet.loading && (
              <ActivityIndicator color={C.accent} style={{ paddingVertical: 24 }} />
            )}
            {subSheet.error && (
              <Text style={styles.sheetSub}>לא הצלחנו להביא הצעות כרגע, נסו שוב בעוד רגע.</Text>
            )}
            {!subSheet.loading && !subSheet.error && subSheet.options.length === 0 && (
              <Text style={styles.sheetSub}>
                לא מצאנו תחליף מתאים למרכיב הזה. אפשר לוותר עליו, או לנסות שוב בעוד רגע.
              </Text>
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
          onPress={() => navigation.navigate("CookingMode", { recipeId: recipe.id, servings, stepIngredients })}
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
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  sourceText: { flex: 1, fontFamily: F.medium, fontSize: 15, color: C.ink },
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
  ingFlagged: { backgroundColor: "#fbf4e8" },
  ingFirst: { borderTopLeftRadius: 17, borderTopRightRadius: 17 },
  ingLast: { borderBottomLeftRadius: 17, borderBottomRightRadius: 17 },
  flagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingStart: 34,
  },
  flagTag: {
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: "#f0dcc0",
    justifyContent: "center",
  },
  flagTagText: { fontFamily: F.semi, fontSize: 12, color: C.warnFg },
  flagBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: C.ink,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  flagBtnText: { fontFamily: F.semi, fontSize: 14, color: C.white },
  dietBanner: { backgroundColor: C.warnBg, borderRadius: 18, padding: 14, gap: 12, marginTop: 8 },
  dietHead: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  dietTitle: { fontFamily: F.bold, fontSize: 16, color: C.warnFg },
  dietSub: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: C.warnFg },
  dietActions: { flexDirection: "row", gap: 8 },
  dietPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.warnFg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  dietPrimaryText: { fontFamily: F.semi, fontSize: 14, color: C.white },
  dietSecondary: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#b98f63",
    alignItems: "center",
    justifyContent: "center",
  },
  dietSecondaryText: { fontFamily: F.semi, fontSize: 14, color: C.warnFg },
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
  stepText: { flex: 1, fontFamily: F.body, fontSize: 16, lineHeight: 28, color: C.ink },
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
