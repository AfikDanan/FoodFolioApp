import React, { useMemo, useState } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { RecipeImage } from "./UI/kit";
import {
  autoCompletePicks,
  cookDayCandidates,
  coverFrom,
  distribute,
  slotKey,
} from "../util/planner";
import { buildTracks, simulate } from "../util/cookSession";
import { dateKey, dayName, longDate, shortDate, timeLabel } from "../util/recipeUtils";
import { recipeToShoppingItems } from "../util/shopping";
import { C, F, SCREEN_PAD } from "../constants/theme";

const STEPS = ["מתי", "מה מבשלים", "התוכנית"];
const DAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const COVERED_BG = "#d3e0d2";
// Batch cooking covers the main meals the person actually eats.
const BATCH_CANDIDATES = ["צהריים", "ערב"];
const WEEKS = 3;

function Stepper({ value, onDec, onInc, size = 36, radius = 12, label }) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        accessibilityLabel={label ? `הפחתת ${label}` : "הפחתה"}
        style={[styles.stepBtn, { width: size, height: size, borderRadius: radius, backgroundColor: C.chip }]}
        onPress={onDec}
      >
        <Ionicons name="remove" size={size / 2} color={C.ink} />
      </TouchableOpacity>
      <Text style={styles.stepValue}>{value}</Text>
      <TouchableOpacity
        accessibilityLabel={label ? `הוספת ${label}` : "הוספה"}
        style={[styles.stepBtn, { width: size, height: size, borderRadius: radius, backgroundColor: C.ink }]}
        onPress={onInc}
      >
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

const fridgeLine = (f) =>
  f >= 3 ? `נשמר ${f} ימים במקרר` : f > 0 ? "עדיף טרי, יום עד יומיים" : "לא מתאים לבישול מראש";

/**
 * "יום בישול": 1. pick the day (any day of the next three weeks) and how many
 * days it covers, 2. pick from ALL recipes, 3. see the split over the days and
 * either save the plan or start cooking now.
 * Props: recipes (normalized), meals (the person's meals), session (saved one or null),
 * onSave({ plan, prep, session }), onShopping(items, count), onCookNow({ picks, people }), toast.
 */
function BatchCooking({ recipes, meals: dayMeals, session, onSave, onShopping, onCookNow, toast, bottomInset = 0 }) {
  const BATCH_MEALS = BATCH_CANDIDATES.filter((m) => dayMeals.includes(m));
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);
  const grid = useMemo(() => {
    const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
    return Array.from({ length: WEEKS * 7 }, (_, i) =>
      new Date(first.getFullYear(), first.getMonth(), first.getDate() + i)
    );
  }, [today]);
  const parse = (key) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const [step, setStep] = useState(0);
  const [cookDate, setCookDate] = useState(() => (session ? parse(session.date) : today));
  const [count, setCount] = useState(session?.days || 5);
  const [people, setPeople] = useState(session?.people || 2);
  const [meals, setMeals] = useState(() =>
    Object.fromEntries(BATCH_MEALS.map((m) => [m, !session || session.meals.includes(m)]))
  );
  const [picks, setPicks] = useState(() =>
    session ? Object.fromEntries(Object.entries(session.picks).map(([id, k]) => [Number(id), k])) : {}
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(null);
  const [shopped, setShopped] = useState(!!session?.shopping);

  const chosenMeals = BATCH_MEALS.filter((m) => meals[m]);
  const cover = useMemo(() => coverFrom(cookDate, count), [cookDate, count]);
  const coverKeys = useMemo(() => new Set(cover.map(dateKey)), [cover]);
  const need = cover.length * chosenMeals.length;
  const picked = Object.entries(picks)
    .map(([id, k]) => ({ r: recipes.find((x) => x.id === Number(id)), k }))
    .filter((x) => x.r && x.k > 0);
  const have = picked.reduce((a, x) => a + x.k, 0);
  const candidates = useMemo(() => cookDayCandidates(recipes), [recipes]);
  const categories = useMemo(() => {
    const counts = {};
    recipes.forEach((r) => r.cat.forEach((c) => (counts[c] = (counts[c] || 0) + 1)));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [recipes]);
  const shown = useMemo(() => {
    const q = query.trim();
    return candidates.filter(
      (r) => (!category || r.cat.includes(category)) && (!q || r.title.includes(q))
    );
  }, [candidates, query, category]);
  const slots = useMemo(
    () => distribute({ picks: picked, cover, meals: chosenMeals }),
    [picks, cover, meals] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const kitchenMinutes = useMemo(() => {
    const tracks = buildTracks(picked.map((x) => ({ r: x.r, factor: (x.k * people) / x.r.servings })));
    return tracks.length ? Math.round(simulate(tracks).total) : 0;
  }, [picks, people]); // eslint-disable-line react-hooks/exhaustive-deps

  const setK = (id, k) => setPicks((p) => ({ ...p, [id]: Math.max(0, k) }));
  const pct = need ? Math.min(100, Math.round((have / need) * 100)) : 0;
  const frozen = slots.filter((s) => s.freeze).length;
  const isToday = dateKey(cookDate) === dateKey(today);
  const dayWord = isToday ? "היום" : dayName(cookDate);

  const build = () => {
    const plan = {};
    const prep = {};
    for (const s of slots) {
      if (!s.r) continue;
      const key = slotKey(s.date, s.meal);
      plan[key] = s.r.id;
      prep[key] = s.freeze ? "freeze" : "fridge";
    }
    const session = {
      date: dateKey(cookDate),
      days: count,
      meals: chosenMeals,
      people,
      picks: Object.fromEntries(picked.map((x) => [x.r.id, x.k])),
      slots: Object.keys(plan),
      shopping: shopped,
    };
    return { plan, prep, session };
  };

  const addCookShopping = () => {
    const items = picked.flatMap((x) =>
      recipeToShoppingItems(x.r.row, (x.k * people) / x.r.servings)
    );
    if (!items.length) return;
    setShopped(true);
    onShopping(items, picked.length);
  };

  const next = () => {
    if (step === 0) {
      if (!chosenMeals.length) return toast("בחרו לפחות ארוחה אחת לכסות");
      setStep(1);
    } else if (step === 1) {
      if (have) setStep(2);
    }
  };

  const ctaLabel =
    step === 0 ? "לבחירת המתכונים" : have ? "לחלוקה לשבוע" : "בחרו לפחות מתכון אחד";

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: step === 2 ? 190 : step === 1 ? 190 : 110 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.steps}>
          {STEPS.map((label, i) => (
            <TouchableOpacity
              key={label}
              style={{ flex: 1, gap: 6 }}
              onPress={() => (i === 0 || (i === 1 && chosenMeals.length) || (i === 2 && have)) && setStep(i)}
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
              מבשלים פעם אחת, אוכלים כמה ימים. בוחרים באיזה יום מבשלים, וכמה ימים האוכל צריך
              להספיק.
            </Text>
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>יום הבישול</Text>
              <View style={styles.calHead}>
                {DAY_LETTERS.map((l) => (
                  <Text key={l} style={styles.calLetter}>
                    {l}
                  </Text>
                ))}
              </View>
              <View style={styles.calGrid}>
                {grid.map((d) => {
                  const key = dateKey(d);
                  const past = d < today;
                  const cook = key === dateKey(cookDate);
                  const covered = coverKeys.has(key) && !cook;
                  const isTodayCell = key === dateKey(today);
                  return (
                    <TouchableOpacity
                      key={key}
                      disabled={past}
                      accessibilityLabel={`${dayName(d)} ${shortDate(d)}`}
                      accessibilityState={{ selected: cook, disabled: past }}
                      activeOpacity={0.8}
                      onPress={() => setCookDate(d)}
                      style={[
                        styles.calCell,
                        covered && { backgroundColor: COVERED_BG },
                        isTodayCell && !cook && styles.calToday,
                        cook && { backgroundColor: C.ink },
                      ]}
                    >
                      <Text
                        style={[
                          styles.calNum,
                          past && { color: C.faint2 },
                          cook && { color: C.white },
                        ]}
                      >
                        {d.getDate()}
                      </Text>
                      {cook && <Ionicons name="flame" size={11} color={C.white} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.calNote}>
                מבשלים ב{isToday ? "יום " : ""}
                {longDate(cookDate).split(",")[0]}, והאוכל מכסה {count} {count === 1 ? "יום" : "ימים"}.
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.settingRow}>
                <Text style={styles.fieldLabel}>כמה ימים מכסים</Text>
                <Stepper
                  value={count}
                  label="ימים"
                  onDec={() => setCount(Math.max(1, count - 1))}
                  onInc={() => setCount(Math.min(7, count + 1))}
                />
              </View>
              <View style={{ gap: 8 }}>
                <Text style={styles.fieldLabel}>ארוחות לכסות</Text>
                <View style={styles.row6}>
                  {BATCH_MEALS.map((m) => (
                    <View key={m} style={{ flex: 1 }}>
                      <Chip label={m} on={meals[m]} onPress={() => setMeals((x) => ({ ...x, [m]: !x[m] }))} />
                    </View>
                  ))}
                </View>
              </View>
              <View style={styles.settingRow}>
                <Text style={styles.fieldLabel}>סועדים</Text>
                <Stepper
                  value={people}
                  label="סועדים"
                  onDec={() => setPeople(Math.max(1, people - 1))}
                  onInc={() => setPeople(people + 1)}
                />
              </View>
            </View>

            <View style={styles.coverage}>
              <Text style={styles.coverTitle}>{need} ארוחות לבשל</Text>
              <Text style={styles.coverRange}>
                {shortDate(cover[0])}–{shortDate(cover[cover.length - 1])} · {chosenMeals.join(" ו")}
              </Text>
            </View>
          </>
        )}

        {step === 1 && (
          <>
            <TouchableOpacity style={styles.summary} onPress={() => setStep(0)}>
              <Text style={styles.summaryText}>
                {dayWord} {shortDate(cookDate)} · {count} {count === 1 ? "יום" : "ימים"} · {people} סועדים
              </Text>
              <Text style={styles.summaryEdit}>שינוי</Text>
            </TouchableOpacity>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={C.ink} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={`חיפוש ב־${recipes.length} מתכונים`}
                placeholderTextColor={C.faint}
                accessibilityLabel="חיפוש מתכון"
              />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.bleed}
              contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, gap: 8 }}
            >
              <Chip label={`הכל ${recipes.length}`} on={!category} onPress={() => setCategory(null)} />
              {categories.map(([c, n]) => (
                <Chip key={c} label={`${c} ${n}`} on={category === c} onPress={() => setCategory(c)} />
              ))}
            </ScrollView>
            <Text style={styles.note}>
              כל המתכונים שלך נמצאים כאן. מה שנשמר היטב במקרר מופיע ראשון.
            </Text>
            <View style={styles.list}>
              {shown.length === 0 && <Text style={styles.empty}>לא נמצאו מתכונים</Text>}
              {shown.map((r, i) => {
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
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {[r.time ? timeLabel(r.time) : null, r.cat[0]].filter(Boolean).join(" · ")}
                      </Text>
                      <View style={styles.fridgeRow}>
                        <Ionicons name="snow-outline" size={13} color={f >= 3 ? C.muted2 : C.warnText} />
                        <Text style={[styles.fridge, { color: f >= 3 ? C.muted2 : C.warnText }]}>
                          {fridgeLine(f)}
                        </Text>
                      </View>
                    </View>
                    {k > 0 ? (
                      <View style={{ alignItems: "center", gap: 3 }}>
                        <Stepper
                          value={k}
                          size={32}
                          radius={10}
                          label={r.title}
                          onDec={() => setK(r.id, k - 1)}
                          onInc={() => setK(r.id, k + 1)}
                        />
                        <Text style={styles.portions}>{k} ארוחות · {k * people} מנות</Text>
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

        {step === 2 && (
          <>
            <View style={styles.stats}>
              {[
                [timeLabel(kitchenMinutes + 20) || "0", "במטבח"],
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
            <Text style={styles.body}>
              ✦ מנות שמחזיקות פחות זמן מוגשות ראשונות.
              {frozen ? ` ${frozen} מהן עוברות למקפיא, עם תזכורת להפשיר ערב קודם.` : ""}
            </Text>
            <Text style={styles.h2}>חלוקה לשבוע</Text>
            {cover.map((date, i) => (
              <View key={dateKey(date)} style={styles.distCard}>
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
                          <View style={[styles.tag, { backgroundColor: s.freeze ? C.freezeBg : C.chip }]}>
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
            <TouchableOpacity style={styles.secondary} onPress={addCookShopping}>
              <Ionicons name={shopped ? "checkmark" : "cart-outline"} size={20} color={C.ink} />
              <Text style={styles.secondaryText}>
                {shopped ? "המרכיבים נוספו לקניות, להוסיף שוב" : "הוספת מרכיבים לרשימת הקניות"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <LinearGradient
        colors={["rgba(245,242,235,0)", C.paper]}
        locations={[0, 0.25]}
        style={[styles.ctaWrap, { paddingBottom: 14 + bottomInset }]}
        pointerEvents="box-none"
      >
        {step === 1 && have > 0 && (
          <View style={styles.tray}>
            <View style={styles.trayRow}>
              <Text style={styles.trayText}>
                {picked.length} {picked.length === 1 ? "מתכון" : "מתכונים"} · {Math.min(have, need)} מתוך {need} ארוחות
              </Text>
              {have < need && (
                <TouchableOpacity
                  onPress={() => {
                    setPicks(autoCompletePicks({ recipes, picks, need }));
                    toast("✦ נבחרו מנות שמחזיקות טוב במקרר");
                  }}
                >
                  <Text style={styles.autoText}>✦ השלמה אוטומטית</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct}%` }]} />
            </View>
          </View>
        )}
        {step < 2 ? (
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.cta, { opacity: step === 1 && !have ? 0.4 : 1 }]}
            onPress={next}
          >
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ gap: 8 }}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.cta}
              onPress={() => onSave(build())}
            >
              <Text style={styles.ctaText}>
                {isToday ? "שמירה להיום" : `שמירה ל${dayName(cookDate)}`}
              </Text>
            </TouchableOpacity>
            <Text style={styles.ctaNote}>
              ביום הבישול יחכה בדף הבית הכפתור ״מתחילים לבשל״.
            </Text>
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.ctaGhost}
              onPress={() => {
                onSave(build());
                onCookNow({ picks: Object.fromEntries(picked.map((x) => [x.r.id, x.k])), people });
              }}
            >
              <Ionicons name="flame-outline" size={18} color={C.ink} />
              <Text style={styles.ctaGhostText}>לבשל כבר עכשיו</Text>
            </TouchableOpacity>
          </View>
        )}
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
  coverTitle: { fontFamily: F.bold, fontSize: 20, color: C.ink },
  coverRange: { fontFamily: F.medium, fontSize: 13, color: C.muted2 },
  track: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.2)", overflow: "hidden", alignItems: "flex-start" },
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
  statValue: { fontFamily: F.bold, fontSize: 16, color: C.ink },
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
  calHead: { flexDirection: "row" },
  calLetter: { flex: 1, textAlign: "center", fontFamily: F.medium, fontSize: 12, color: C.muted },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: {
    width: `${100 / 7}%`,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  calToday: { borderWidth: 1.5, borderColor: C.ink },
  calNum: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  calNote: { fontFamily: F.body, fontSize: 13, color: C.muted2 },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 44,
    borderRadius: 22,
    backgroundColor: C.accentSoft,
    paddingHorizontal: 16,
  },
  summaryText: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  summaryEdit: { fontFamily: F.semi, fontSize: 14, color: C.accent },
  searchBox: {
    height: 48,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, padding: 0, textAlign: "right" },
  bleed: { marginHorizontal: -SCREEN_PAD, flexGrow: 0 },
  note: { fontFamily: F.body, fontSize: 13, color: C.muted2 },
  rowMeta: { fontFamily: F.body, fontSize: 12, color: C.muted },
  tray: { backgroundColor: C.ink, borderRadius: 16, padding: 12, gap: 8, marginBottom: 8 },
  trayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  trayText: { flex: 1, fontFamily: F.semi, fontSize: 14, color: C.white },
  autoText: { fontFamily: F.semi, fontSize: 13, color: "#9fd6b4" },
  ctaNote: { fontFamily: F.body, fontSize: 12, color: C.muted2, textAlign: "center" },
  ctaGhost: {
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line4,
    backgroundColor: C.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaGhostText: { fontFamily: F.semi, fontSize: 15, color: C.ink },
});
