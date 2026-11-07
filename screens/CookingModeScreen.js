import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useKeepAwake } from "expo-keep-awake";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchRecipeById } from "../util/database";
import { RoundButton, useToast } from "../components/UI/kit";
import { parseSteps } from "../util/recipeUtils";
import { C, F } from "../constants/theme";

const MINUTES_RE = /(\d+)\s*דקות/;

const clock = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

function CookingModeScreen({ navigation, route }) {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [recipe, setRecipe] = useState(null);
  const [step, setStep] = useState(0);
  // Each step keeps its own timer: { left: seconds, running: bool }
  const [timers, setTimers] = useState({});

  useEffect(() => {
    fetchRecipeById(route.params.recipeId).then(setRecipe);
  }, [route.params.recipeId]);

  const steps = useMemo(() => (recipe ? parseSteps(recipe.instructions) : []), [recipe]);

  const timersRef = useRef(timers);
  timersRef.current = timers;

  const anyRunning = Object.values(timers).some((t) => t.running);
  useEffect(() => {
    if (!anyRunning) return undefined;
    const id = setInterval(() => {
      let finished = false;
      const next = {};
      for (const [k, t] of Object.entries(timersRef.current)) {
        if (t.running && t.left > 0) {
          const left = t.left - 1;
          if (left === 0) finished = true;
          next[k] = { left, running: left > 0 };
        } else {
          next[k] = t;
        }
      }
      setTimers(next);
      if (finished) toast("⏰ הטיימר הסתיים");
    }, 1000);
    return () => clearInterval(id);
  }, [anyRunning, toast]);

  if (!recipe) return <View style={styles.root} />;

  const text = steps[step] || "";
  const match = text.match(MINUTES_RE);
  const total = match ? parseInt(match[1], 10) * 60 : null;
  const timer = timers[step];
  const left = timer ? timer.left : total;
  const isLast = step === steps.length - 1;

  const timerAction = () => {
    if (!timer || timer.left === 0) {
      setTimers((t) => ({ ...t, [step]: { left: total, running: true } }));
    } else {
      setTimers((t) => ({ ...t, [step]: { ...timer, running: !timer.running } }));
    }
  };

  const timerLabel = !timer
    ? "הפעלת טיימר"
    : timer.left === 0
    ? "שוב"
    : timer.running
    ? "השהיה"
    : "המשך";
  const timerIcon = timer?.running ? "pause" : timer?.left === 0 ? "refresh" : "play";

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 14 }]}>
      <View style={styles.header}>
        <Text style={styles.recipeTitle} numberOfLines={1}>
          {recipe.title}
        </Text>
        <RoundButton
          icon="close"
          bg="rgba(255,255,255,0.1)"
          color={C.cookFg}
          onPress={() => navigation.goBack()}
        />
      </View>

      <View style={styles.progress}>
        {steps.map((_, i) => (
          <View
            key={i}
            style={[styles.bar, { backgroundColor: i <= step ? C.cookFg : "rgba(255,255,255,0.18)" }]}
          />
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
        <Text style={styles.stepLabel}>
          שלב {step + 1} מתוך {steps.length}
        </Text>
        <Text style={styles.stepText}>{text}</Text>
      </ScrollView>

      {total !== null && (
        <TouchableOpacity style={styles.timerBox} onPress={timerAction} activeOpacity={0.8}>
          <Text style={styles.digits}>{clock(left)}</Text>
          <View style={styles.timerBtn}>
            <Ionicons name={timerIcon} size={18} color={C.cookFg} />
            <Text style={styles.timerBtnText}>{timerLabel}</Text>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          disabled={step === 0}
          style={[styles.prev, step === 0 && { opacity: 0.35 }]}
          onPress={() => setStep((s) => s - 1)}
        >
          <Ionicons name="arrow-forward" size={24} color={C.cookFg} />
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.next}
          onPress={() => (isLast ? navigation.goBack() : setStep((s) => s + 1))}
        >
          <Text style={styles.nextText}>{isLast ? "סיום, בתיאבון" : "השלב הבא"}</Text>
          <Ionicons name="arrow-back" size={20} color={C.cookBg} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default CookingModeScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.cookBg, paddingHorizontal: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  recipeTitle: { flex: 1, fontFamily: F.medium, fontSize: 14, color: C.cookFg, opacity: 0.6 },
  progress: { flexDirection: "row", gap: 5, marginTop: 18 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  body: { paddingTop: 36, gap: 12, flexGrow: 1 },
  stepLabel: { fontFamily: F.semi, fontSize: 14, color: "#55c17e" },
  stepText: { fontFamily: F.display500, fontSize: 30, lineHeight: 42, color: C.cookFg },
  timerBox: { alignSelf: "center", alignItems: "center", gap: 6, marginBottom: 28 },
  digits: {
    fontFamily: F.bold,
    fontSize: 56,
    letterSpacing: 1,
    color: C.cookFg,
    fontVariant: ["tabular-nums"],
    writingDirection: "ltr",
  },
  timerBtn: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timerBtnText: { fontFamily: F.semi, fontSize: 15, color: C.cookFg },
  footer: { flexDirection: "row", gap: 10 },
  prev: {
    width: 64,
    height: 60,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  next: {
    flex: 1,
    height: 60,
    borderRadius: 18,
    backgroundColor: C.cookFg,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  nextText: { fontFamily: F.semi, fontSize: 17, color: C.cookBg },
});
