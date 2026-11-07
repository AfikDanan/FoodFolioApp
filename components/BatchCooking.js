import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { RecipeImage } from "./UI/kit";
import {
  autoCompletePicks,
  batchCandidates,
  buildTimeline,
  coverDays,
  distribute,
  slotKey,
} from "../util/planner";
import { dayName, shortDate, timeLabel } from "../util/recipeUtils";
import { recipeToShoppingItems } from "../util/shopping";
import { C, F, SCREEN_PAD } from "../constants/theme";

const STEPS = ["מה מבשלים", "חלוקה לשבוע", "יום הבישול"];
const DAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
// Batch cooking covers the main meals the person actually eats.
const BATCH_CANDIDATES = ["צהריים", "ערב"];

const dayLabel = (date, i) => (i === 0 ? "היום" : i === 1 ? "מחר" : `יום ${DAY_LETTERS[date.getDay()]}`);

function Stepper({ value, onDec, onInc, size = 36, radius = 12 }) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={[styles.stepBtn, { width: size, height: size, borderRadius: radius, backgroundColor: C.chip }]} onPress={onDec}>
        <Ionicons name="remove" size={size / 2} color={C.ink} />
      </TouchableOpacity>
      <Text style={styles.stepValue}>{value}</Text>
      <TouchableOpacity style={[styles.stepBtn, { width: size, height: size, borderRadius: radius, backgroundColor: C.ink }]} onPress={onInc}>
        <Ionicons name="add" size={size / 2} color={C.white} />
      </TouchableOpacity>
    </View>
  );
}

function Chip({ label, on, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: on ? C.ink : C.card, borderColor: on ? C.ink : C.line3 }]}
    >
      <Text style={[styles.chipText, { color: on ? C.white : C.ink }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * "בישול מרוכז": pick dishes, see how they spread over the week, get a cook-day
 * timeline. Props: recipes (normalized), days (7 Dates), onApply({ plan, prep, cookKey }),
 * onShopping(items), toast(fn).
 */
function BatchCooking({ recipes, days, onApply, onShopping, toast, meals: dayMeals, bottomInset = 0 }) {
  const BATCH_MEALS = BATCH_CANDIDATES.filter((m) => dayMeals.includes(m));
  const [step, setStep] = useState(0);
  const [cookIndex, setCookIndex] = useState(0);
  const [people, setPeople] = useState(2);
  const [meals, setMeals] = useState({ צהריים: true, ערב: true });
  const [picks, setPicks] = useState({});

  const chosenMeals = BATCH_MEALS.filter((m) => meals[m]);
  const cover = useMemo(() => coverDays(days, cookIndex), [days, cookIndex]);
  const need = cover.length * chosenMeals.length;
  const picked = Object.entries(picks)
    .map(([id, k]) => ({ r: recipes.find((x) => x.id === Number(id)), k }))
    .filter((x) => x.r && x.k > 0);
  const have = picked.reduce((a, x) => a + x.k, 0);
  const candidates = useMemo(() => batchCandidates(recipes), [recipes]);
  const slots = useMemo(
    () => distribute({ picks: picked, cover, meals: chosenMeals }),
    [picks, cover, meals] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const { items: timeline, kitchenMinutes } = useMemo(
    () => buildTimeline({ picks: picked, people, slots }),
    [picks, people, slots] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const setK = (id, k) => setPicks((p) => ({ ...p, [id]: Math.max(0, k) }));
  const pct = need ? Math.min(100, Math.round((have / need) * 100)) : 0;
  const range = cover.length
    ? `${DAY_LETTERS[cover[0].getDay()]}–${DAY_LETTERS[cover[cover.length - 1].getDay()]}`
    : "";

  const apply = () => {
    const plan = {};
    const prep = {};
    for (const s of slots) {
      if (!s.r) continue;
      const key = slotKey(s.date, s.meal);
      plan[key] = s.r.id;
      prep[key] = s.freeze ? "freeze" : "fridge";
    }
    onApply({ plan, prep, cookKey: slotKey(days[cookIndex], "ערב").split("|")[0] });
  };

  const addCookShopping = () => {
    const items = picked.flatMap((x) =>
      recipeToShoppingItems(x.r.row, (x.k * people) / x.r.servings)
    );
    if (items.length) onShopping(items, picked.length);
  };

  const ctaLabel =
    step === 0
      ? have
        ? "לחלוקה לשבוע"
        : "בחרו לפחות מתכון אחד"
      : step === 1
        ? "לתכנון יום הבישול"
        : "שיבוץ בלוח השבוע";
  const next = () => {
    if (!have) return;
    if (step < 2) setStep(step + 1);
    else apply();
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: 110 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.steps}>
          {STEPS.map((label, i) => (
            <TouchableOpacity
              key={label}
              style={{ flex: 1, gap: 6 }}
              onPress={() => (i === 0 || have) && setStep(i)}
            >
              <View style={[styles.bar, { backgroundColor: i <= step ? C.accent : C.line3 }]} />
              <Text style={[styles.stepLabel, { color: i <= step ? C.ink : C.faint }]}>
                {i + 1}. {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {step === 0 && (
          <>
            <Text style={styles.body}>
              מבשלים פעם אחת, אוכלים כל השבוע. בוחרים מה לבשל, והמנות מתחלקות לצהריים ולערב לפי
              כמה זמן כל מנה מחזיקה במקרר.
            </Text>
            <View style={styles.card}>
              <View style={{ gap: 8 }}>
                <Text style={styles.fieldLabel}>יום הבישול</Text>
                <View style={styles.row6}>
                  {[0, 1, 2].map((i) => (
                    <View key={i} style={{ flex: 1 }}>
                      <Chip label={dayLabel(days[i], i)} on={cookIndex === i} onPress={() => setCookIndex(i)} />
                    </View>
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 14 }}>
                <View style={{ flex: 1, gap: 8 }}>
                  <Text style={styles.fieldLabel}>ארוחות לכסות</Text>
                  <View style={styles.row6}>
                    {BATCH_MEALS.map((m) => (
                      <View key={m} style={{ flex: 1 }}>
                        <Chip label={m} on={meals[m]} onPress={() => setMeals((x) => ({ ...x, [m]: !x[m] }))} />
                      </View>
                    ))}
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  <Text style={styles.fieldLabel}>סועדים</Text>
                  <Stepper value={people} onDec={() => setPeople(Math.max(1, people - 1))} onInc={() => setPeople(people + 1)} />
                </View>
              </View>
            </View>

            <View style={styles.coverage}>
              <View style={styles.coverRow}>
                <Text style={styles.coverTitle}>
                  {have} מתוך {need} ארוחות מכוסות
                </Text>
                <Text style={styles.coverRange}>{range}</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }]} />
              </View>
              {have < need && (
                <TouchableOpacity
                  style={styles.autoBtn}
                  onPress={() => {
                    setPicks(autoCompletePicks({ recipes, picks, need }));
                    toast("✦ נבחרו מנות שמחזיקות טוב במקרר");
                  }}
                >
                  <Text style={styles.autoBtnText}>✦ השלמה אוטומטית</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.h2}>מה מבשלים</Text>
            <View style={styles.list}>
              {candidates.length === 0 && (
                <Text style={styles.empty}>אין עדיין מתכונים בקטגוריות עיקריות, תוספות או סלטים</Text>
              )}
              {candidates.map((r, i) => {
                const k = picks[r.id] || 0;
                const f = r.fridge;
                return (
                  <View
                    key={r.id}
                    style={[styles.listRow, i > 0 && styles.divider, k > 0 && { backgroundColor: C.accentSofter }]}
                  >
                    <RecipeImage recipe={r} style={styles.thumb46} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {r.title}
                      </Text>
                      <View style={styles.fridgeRow}>
                        <Ionicons name="snow-outline" size={13} color={f >= 3 ? C.muted2 : C.warnText} />
                        <Text style={[styles.fridge, { color: f >= 3 ? C.muted2 : C.warnText }]}>
                          {f >= 3
                            ? `נשמר ${f} ימים במקרר`
                            : f > 0
                              ? "עדיף טרי, יום עד יומיים"
                              : "לא מתאים לבישול מראש"}
                        </Text>
                      </View>
                    </View>
                    {k > 0 ? (
                      <View style={{ alignItems: "center", gap: 3 }}>
                        <Stepper value={k} size={28} radius={9} onDec={() => setK(r.id, k - 1)} onInc={() => setK(r.id, k + 1)} />
                        <Text style={styles.portions}>ארוחות · {k * people} מנות</Text>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.addBtn} onPress={() => setK(r.id, 2)}>
                        <Text style={styles.addBtnText}>+ בחירה</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.body}>
              ✦ מנות שמחזיקות פחות זמן מוגשות ראשונות. מה שלא יחזיק עד היום שלו עובר למקפיא, עם
              תזכורת להפשיר ערב קודם.
            </Text>
            {cover.map((date, i) => (
              <View key={i} style={styles.distCard}>
                <View style={styles.dayHead}>
                  <Text style={styles.distDay}>
                    {i === 0 ? `${dayName(date)} · יום הבישול` : dayName(date)}
                  </Text>
                  <Text style={styles.dayDate}>{shortDate(date)}</Text>
                </View>
                {slots
                  .filter((s) => s.date === date)
                  .map((s) => (
                    <View key={s.meal} style={styles.distRow}>
                      <Text style={styles.mealLabel}>{s.meal}</Text>
                      {s.r ? (
                        <>
                          <RecipeImage recipe={s.r} style={styles.thumb30} />
                          <Text style={styles.distTitle} numberOfLines={1}>
                            {s.r.title}
                          </Text>
                          <View
                            style={[
                              styles.tag,
                              { backgroundColor: s.freeze ? C.freezeBg : C.chip },
                            ]}
                          >
                            <Ionicons
                              name={s.freeze ? "snow-outline" : "cube-outline"}
                              size={13}
                              color={s.freeze ? C.freezeFg : C.muted2}
                            />
                            <Text style={[styles.tagText, { color: s.freeze ? C.freezeFg : C.muted2 }]}>
                              {s.freeze ? "מהמקפיא" : "מהמקרר"}
                            </Text>
                          </View>
                        </>
                      ) : (
                        <Text style={styles.uncovered}>לא מכוסה, אפשר להוסיף עוד מנה</Text>
                      )}
                    </View>
                  ))}
              </View>
            ))}
          </>
        )}

        {step === 2 && (
          <>
            <View style={styles.stats}>
              {[
                [timeLabel(kitchenMinutes), "במטבח"],
                [String(have), "קופסאות"],
                [String(picked.length), "מתכונים"],
              ].map(([v, l]) => (
                <View key={l} style={styles.stat}>
                  <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                    {v}
                  </Text>
                  <Text style={styles.statLabel}>{l}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.h2}>✦ סדר העבודה</Text>
            <View>
              {timeline.map((t, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 12 }}>
                  <View style={styles.timeCol}>
                    <Text style={styles.time}>{t.at}</Text>
                    <View
                      style={[styles.connector, { backgroundColor: i < timeline.length - 1 ? C.line4 : "transparent" }]}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 3, paddingBottom: 18 }}>
                    <Text style={styles.tlTitle}>{t.title}</Text>
                    <Text style={styles.tlText}>{t.text}</Text>
                  </View>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.secondary} onPress={addCookShopping}>
              <Ionicons name="cart-outline" size={20} color={C.ink} />
              <Text style={styles.secondaryText}>רשימת קניות ליום הבישול</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <LinearGradient
        colors={["rgba(245,242,235,0)", C.paper]}
        locations={[0, 0.3]}
        style={[styles.ctaWrap, { paddingBottom: 14 + bottomInset }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.cta, { opacity: have ? 1 : 0.4 }]}
          onPress={next}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

export default BatchCooking;

const styles = StyleSheet.create({
  content: { paddingHorizontal: SCREEN_PAD, gap: 14 },
  steps: { flexDirection: "row", gap: 6 },
  bar: { height: 4, borderRadius: 2 },
  stepLabel: { fontFamily: F.semi, fontSize: 12 },
  body: { fontFamily: F.body, fontSize: 14, lineHeight: 21, color: C.muted2 },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 14, gap: 14 },
  fieldLabel: { fontFamily: F.semi, fontSize: 13, color: C.muted2 },
  row6: { flexDirection: "row", gap: 6 },
  chip: { height: 36, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  chipText: { fontFamily: F.semi, fontSize: 13 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: { alignItems: "center", justifyContent: "center" },
  stepValue: { fontFamily: F.bold, fontSize: 17, color: C.ink, minWidth: 16, textAlign: "center" },
  coverage: { backgroundColor: C.accentSoft, borderRadius: 18, padding: 14, gap: 8 },
  coverRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  coverTitle: { fontFamily: F.bold, fontSize: 17, color: C.ink },
  coverRange: { fontFamily: F.medium, fontSize: 13, color: C.muted2 },
  track: { height: 6, borderRadius: 3, backgroundColor: "rgba(0,0,0,0.08)", overflow: "hidden", alignItems: "flex-start" },
  fill: { height: 6, borderRadius: 3, backgroundColor: C.accent },
  autoBtn: {
    alignSelf: "flex-start",
    marginTop: 4,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: C.accent,
    justifyContent: "center",
  },
  autoBtnText: { fontFamily: F.semi, fontSize: 13, color: C.white },
  h2: { fontFamily: F.display700, fontSize: 18, color: C.ink, marginTop: 4 },
  list: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, overflow: "hidden" },
  empty: { fontFamily: F.body, fontSize: 14, color: C.muted, padding: 16 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12 },
  divider: { borderTopWidth: 1, borderTopColor: C.line2 },
  thumb46: { width: 46, height: 46, borderRadius: 12 },
  rowTitle: { fontFamily: F.semi, fontSize: 15, lineHeight: 19, color: C.ink },
  fridgeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  fridge: { fontFamily: F.medium, fontSize: 12 },
  portions: { fontFamily: F.medium, fontSize: 11, color: C.muted },
  addBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line4,
    justifyContent: "center",
  },
  addBtnText: { fontFamily: F.semi, fontSize: 13, color: C.ink },
  distCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    paddingTop: 10,
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
  },
  dayHead: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  distDay: { fontFamily: F.display700, fontSize: 16, color: C.ink },
  dayDate: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  distRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 3 },
  mealLabel: { width: 58, fontFamily: F.medium, fontSize: 13, color: C.muted },
  thumb30: { width: 30, height: 30, borderRadius: 8 },
  distTitle: { flex: 1, fontFamily: F.semi, fontSize: 14, color: C.ink },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, height: 24, paddingHorizontal: 8, borderRadius: 12 },
  tagText: { fontFamily: F.semi, fontSize: 11 },
  uncovered: { flex: 1, fontFamily: F.medium, fontSize: 14, color: C.warnText },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 12, gap: 2 },
  statValue: { fontFamily: F.bold, fontSize: 19, color: C.ink },
  statLabel: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  timeCol: { width: 44, alignItems: "center" },
  time: { fontFamily: F.bold, fontSize: 13, color: C.ink, fontVariant: ["tabular-nums"], writingDirection: "ltr" },
  connector: { flex: 1, width: 2, marginVertical: 6 },
  tlTitle: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  tlText: { fontFamily: F.body, fontSize: 14, lineHeight: 21, color: C.muted2 },
  secondary: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryText: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  ctaWrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 28, paddingHorizontal: SCREEN_PAD },
  cta: { height: 52, borderRadius: 16, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  ctaText: { fontFamily: F.semi, fontSize: 15, color: C.white },
});
