import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Vibration } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useKeepAwake } from "expo-keep-awake";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchAllRecipesWithCategories } from "../util/database";
import { useToast } from "../components/UI/kit";
import StepText from "../components/StepText";
import { usePrefs } from "../util/prefs";
import { loadCookRun, saveCookRun } from "../util/planStore";
import { normalizeRecipe, timeLabel } from "../util/recipeUtils";
import {
  allDone,
  buildTracks,
  completeStep,
  currentTrack,
  hmm,
  minutesLeft,
  mmss,
  simulate,
  skipTimer,
  startRun,
  tickRun,
  timerLeft,
  toggleTimer,
  upcoming,
} from "../util/cookSession";
import { C, F } from "../constants/theme";

const MUTED = "#b9b6ab";
const SOFT = "rgba(255,255,255,0.1)";

const clockAt = (startMs, minutes) => {
  const d = new Date(startMs + minutes * 60000);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function Badge({ n, color, size = 20 }) {
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontFamily: F.bold, fontSize: size * 0.6, color: C.cookBg }}>{n}</Text>
    </View>
  );
}

// ---- Before starting: one lane per recipe, and the order of work -----------
function KitchenPlan({ tracks, plan, startMs, onStart }) {
  const total = Math.max(1, plan.total);
  const key = plan.order.filter(
    (o) => o.si === 0 || o.kind === "passive" || o.si === tracks[o.ti].steps.length - 1
  );
  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: 16 }}>
        <View style={{ gap: 4 }}>
          <Text style={styles.planTitle}>
            {tracks.length} מתכונים במקביל, מוכנים עד {clockAt(startMs, plan.total)}
          </Text>
          <Text style={styles.sub}>
            {timeLabel(Math.round(plan.total))} במטבח. מתחילים מהמתכון שלוקח הכי הרבה זמן, ובזמן
            שהוא מתבשל עובדים על האחרים.
          </Text>
        </View>

        <View style={styles.chart}>
          {tracks.map((t, ti) => (
            <View key={t.id} style={{ gap: 6 }}>
              <View style={styles.laneHead}>
                <Badge n={t.n} color={t.color} size={18} />
                <Text style={styles.laneName} numberOfLines={1}>
                  {t.title}
                </Text>
              </View>
              <View style={styles.laneTrack}>
                {plan.lanes[ti].map((seg, i) => (
                  <View
                    key={i}
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      start: `${(seg.start / total) * 100}%`,
                      width: `${Math.max(1.5, ((seg.end - seg.start) / total) * 100)}%`,
                      borderRadius: 5,
                      backgroundColor: t.color,
                      opacity: seg.kind === "active" ? 1 : 0.35,
                    }}
                  />
                ))}
              </View>
            </View>
          ))}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { opacity: 1 }]} />
              <Text style={styles.legendText}>עובדים על זה</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { opacity: 0.35 }]} />
              <Text style={styles.legendText}>מתבשל לבד</Text>
            </View>
          </View>
        </View>

        <Text style={styles.h2}>סדר העבודה</Text>
        <View style={{ gap: 10 }}>
          {key.map((o, i) => (
            <View key={i} style={styles.orderRow}>
              <Text style={styles.orderTime}>{clockAt(startMs, o.at)}</Text>
              <Badge n={tracks[o.ti].n} color={tracks[o.ti].color} size={18} />
              <Text style={styles.orderText} numberOfLines={2}>
                {tracks[o.ti].steps[o.si].text}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <TouchableOpacity activeOpacity={0.9} style={styles.cta} onPress={onStart}>
        <Ionicons name="flame" size={20} color={C.cookBg} />
        <Text style={styles.ctaText}>מתחילים לבשל</Text>
      </TouchableOpacity>
    </>
  );
}

const statusOf = (s, now, isCurrent) => {
  const left = timerLeft(s, now);
  if (s.phase === "done") return { text: "סיימנו", dir: "rtl" };
  if (left !== null) return { text: mmss(left), dir: "ltr" };
  return { text: isCurrent ? "עכשיו" : "בתור", dir: "rtl" };
};

// ---- Option A: one step at a time -------------------------------------------
function Guided({ tracks, run, now, current, onPick, onDone, onSkip, onPause, onPrev, canPrev }) {
  const upNext = current >= 0 ? upcoming(tracks, run, current, now) : [];
  const waiting = run
    .map((s, ti) => ({ s, ti }))
    .filter((x) => x.s.phase === "waiting" || x.s.phase === "paused")
    .sort((a, b) => timerLeft(a.s, now) - timerLeft(b.s, now));
  const t = current >= 0 ? tracks[current] : null;
  const step = t ? t.steps[run[current].i] : null;

  return (
    <>
      <View style={styles.chips}>
        {tracks.map((tr, ti) => {
          const s = run[ti];
          const on = ti === current;
          const st = statusOf(s, now, on);
          return (
            <TouchableOpacity
              key={tr.id}
              accessibilityLabel={`${tr.title}, ${on ? "השלב הנוכחי" : st.text}`}
              activeOpacity={0.8}
              disabled={s.phase !== "ready"}
              onPress={() => onPick(ti)}
              style={[
                styles.chip,
                { backgroundColor: on ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)", borderColor: on ? tr.color : "transparent" },
              ]}
            >
              <View style={styles.chipTop}>
                <Badge n={tr.n} color={tr.color} size={16} />
                <Text style={styles.chipName} numberOfLines={1}>
                  {tr.short}
                </Text>
              </View>
              <Text
                style={[styles.chipStatus, { color: on ? tr.color : C.cookFg, writingDirection: st.dir }]}
              >
                {st.text}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {t ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: 12 }}>
          <View style={{ gap: 10 }}>
            <View style={styles.rowCenter}>
              <Badge n={t.n} color={t.color} />
              <Text style={[styles.curName, { color: t.color }]} numberOfLines={1}>
                {t.title}
              </Text>
              <Text style={styles.sub}>
                שלב {run[current].i + 1} מתוך {t.steps.length}
              </Text>
            </View>
            <StepText large dark style={styles.bigStep} text={step.text} ingredients={t.ingredients} />
            {step.kind === "passive" && (
              <View style={styles.passiveNote}>
                <Ionicons name="timer-outline" size={18} color={MUTED} />
                <Text style={styles.passiveText}>
                  אחרי השלב הזה זה מתבשל לבד {step.minutes} דקות, ואפשר לעבור לשאר המתכונים.
                </Text>
              </View>
            )}
          </View>
          {upNext.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={styles.h3}>אחר כך</Text>
              {upNext.map((u, i) => (
                <View key={i} style={styles.upRow}>
                  <Badge n={tracks[u.ti].n} color={tracks[u.ti].color} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={styles.upWhen}>
                      {u.when === "next" ? (
                        "מיד אחרי השלב הזה"
                      ) : (
                        <Text>
                          כשהטיימר של {tracks[u.ti].short} מסתיים, בעוד{" "}
                          <Text style={{ writingDirection: "ltr" }}>{mmss(u.ms)}</Text>
                        </Text>
                      )}
                    </Text>
                    <Text style={styles.upText} numberOfLines={2}>
                      {tracks[u.ti].steps[u.si].text}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 14, paddingTop: 10 }}>
          <Text style={styles.waitTitle}>הכל מתבשל, אפשר לנשום</Text>
          <Text style={styles.sub}>המתכון הבא מחכה לטיימר שלו. עד אז אפשר לנקות או להכין את השולחן.</Text>
          {waiting.map(({ s, ti }) => (
            <View key={ti} style={styles.waitRow}>
              <Badge n={tracks[ti].n} color={tracks[ti].color} />
              <Text style={styles.waitName} numberOfLines={1}>
                {tracks[ti].short}
              </Text>
              <Text style={styles.waitTime}>{mmss(timerLeft(s, now))}</Text>
              <TouchableOpacity style={styles.iconBtn} accessibilityLabel="השהיית הטיימר" onPress={() => onPause(ti)}>
                <Ionicons name={s.phase === "paused" ? "play" : "pause"} size={18} color={C.cookFg} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallBtn} onPress={() => onSkip(ti)}>
                <Text style={styles.smallBtnText}>מוכן כבר</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          disabled={!canPrev}
          accessibilityLabel="השלב הקודם"
          style={[styles.prev, !canPrev && { opacity: 0.35 }]}
          onPress={onPrev}
        >
          <Ionicons name="arrow-forward" size={24} color={C.cookFg} />
        </TouchableOpacity>
        {t && (
          <TouchableOpacity activeOpacity={0.9} style={styles.next} onPress={() => onDone(current)}>
            <Text style={styles.nextText}>
              {step.kind === "passive" ? `סיימתי, מפעילים טיימר` : "סיימתי, הלאה"}
            </Text>
            <Ionicons name="arrow-back" size={20} color={C.cookBg} />
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}

// ---- Option B: every recipe on one board -----------------------------------
function Board({ tracks, run, now, current, onDone, onSkip, onPause }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingBottom: 16 }}>
      {tracks.map((t, ti) => {
        const s = run[ti];
        if (s.phase === "done") {
          return (
            <View key={t.id} style={[styles.card, { opacity: 0.6 }]}>
              <View style={styles.rowCenter}>
                <Badge n={t.n} color={t.color} />
                <Text style={styles.cardName}>{t.title}</Text>
                <Ionicons name="checkmark" size={18} color={t.color} />
              </View>
            </View>
          );
        }
        const step = t.steps[s.i];
        const left = timerLeft(s, now);
        const ready = s.phase === "ready";
        return (
          <View
            key={t.id}
            style={[
              styles.card,
              ready && ti === current && { backgroundColor: "rgba(255,255,255,0.12)", borderColor: t.color },
            ]}
          >
            <View style={styles.rowCenter}>
              <Badge n={t.n} color={t.color} />
              <Text style={styles.cardName} numberOfLines={1}>
                {t.title}
              </Text>
              <Text style={styles.sub}>
                שלב {s.i + 1} מתוך {t.steps.length}
              </Text>
            </View>
            <View style={styles.bar}>
              <View
                style={{
                  height: 4,
                  borderRadius: 2,
                  width: `${(s.i / t.steps.length) * 100}%`,
                  backgroundColor: t.color,
                }}
              />
            </View>
            <StepText dark style={styles.cardStep} text={step.text} ingredients={t.ingredients} />
            {left !== null ? (
              <View style={styles.rowCenter}>
                <Ionicons name="time-outline" size={16} color={MUTED} />
                <Text style={[styles.sub, { flex: 1 }]}>מתבשל לבד</Text>
                <Text style={styles.cardTimer}>{mmss(left)}</Text>
                <TouchableOpacity style={styles.iconBtn} accessibilityLabel="השהיית הטיימר" onPress={() => onPause(ti)}>
                  <Ionicons name={s.phase === "paused" ? "play" : "pause"} size={18} color={C.cookFg} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallBtn} onPress={() => onSkip(ti)}>
                  <Text style={styles.smallBtnText}>מוכן כבר</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.rowCenter}>
                <Text style={[styles.waitsYou, { color: t.color }]}>
                  {s.fromTimer ? "מחכה לך, הטיימר הסתיים" : "מחכה לך"}
                </Text>
                <TouchableOpacity style={styles.doneBtn} onPress={() => onDone(ti)}>
                  <Ionicons name="checkmark" size={18} color={C.cookBg} />
                  <Text style={styles.doneBtnText}>
                    {step.kind === "passive" ? "סיימתי, מפעילים טיימר" : "סיימתי את השלב"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

/**
 * Cooking several recipes at once. route.params.picks: { recipeId: meals }, people.
 * Shows the kitchen plan first, then the guided queue or the recipe board.
 */
function CookTogetherScreen({ navigation, route }) {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const prefs = usePrefs();
  const { picks = {}, people = 2 } = route.params || {};
  const signature = useMemo(
    () => JSON.stringify([Object.entries(picks).sort(), people]),
    [picks, people]
  );
  const [tracks, setTracks] = useState(null);
  const [phase, setPhase] = useState("plan"); // plan | run
  const [run, setRun] = useState(null);
  const [history, setHistory] = useState([]);
  const [preferred, setPreferred] = useState(null);
  const [view, setView] = useState(null); // null = the default from settings
  const [now, setNow] = useState(Date.now());
  const [openedAt] = useState(Date.now());
  const runRef = useRef(null);
  runRef.current = run;

  useEffect(() => {
    let alive = true;
    (async () => {
      const rows = (await fetchAllRecipesWithCategories()) || [];
      const recipes = rows.map(normalizeRecipe);
      const items = Object.entries(picks)
        .map(([id, k]) => {
          const r = recipes.find((x) => x.id === Number(id));
          return r ? { r, factor: (k * people) / r.servings } : null;
        })
        .filter(Boolean);
      const built = buildTracks(items);
      if (!alive) return;
      setTracks(built);
      const saved = await loadCookRun();
      // A session left more than 12 hours ago is stale, not something to resume.
      const fresh = saved && Date.now() - (saved.at || 0) < 12 * 3600 * 1000;
      if (alive && fresh && saved.signature === signature && saved.run?.length === built.length) {
        setRun(saved.run);
        setPhase("run");
      }
    })();
    return () => {
      alive = false;
    };
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = useMemo(() => (tracks ? simulate(tracks) : null), [tracks]);

  // Remember the place in the session.
  const persist = useCallback(
    (next) => {
      saveCookRun(next && !allDone(next) ? { signature, run: next, at: Date.now() } : null).catch(() => {});
    },
    [signature]
  );

  const update = useCallback(
    (next, { record = true } = {}) => {
      if (record) setHistory((h) => [...h.slice(-30), runRef.current]);
      setRun(next);
      persist(next);
    },
    [persist]
  );

  // One tick a second moves the clocks and starts the next step when a timer ends.
  useEffect(() => {
    if (phase !== "run") return undefined;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const cur = runRef.current;
      if (!cur) return;
      const { run: next, finished } = tickRun(tracks, cur, t);
      if (finished.length) {
        update(next, { record: false });
        try {
          Vibration.vibrate([0, 500, 250, 500, 250, 500]);
        } catch (e) {
          // no vibration on this device
        }
        toast(`⏰ ${tracks[finished[0]].short}: הטיימר הסתיים`);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, tracks, update, toast]);

  if (!tracks || !plan) return <View style={styles.root} />;

  if (tracks.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12, justifyContent: "center", alignItems: "center", gap: 14 }]}>
        <Text style={styles.finishTitle}>אין שלבי הכנה</Text>
        <Text style={[styles.sub, { textAlign: "center" }]}>
          למתכונים שנבחרו אין שלבי הכנה, ולכן אין מה להפעיל. אפשר להוסיף שלבים בעריכת המתכון.
        </Text>
        <TouchableOpacity style={[styles.cta, { alignSelf: "stretch" }]} onPress={() => navigation.goBack()}>
          <Text style={styles.ctaText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const view_ = view || prefs.cookView;
  const start = () => {
    update(startRun(tracks), { record: false });
    setNow(Date.now());
    setPhase("run");
  };
  const current = run ? currentTrack(tracks, run, preferred) : -1;
  const finished = run ? allDone(run) : false;
  const left = run ? minutesLeft(tracks, run, now) : plan.total;
  const elapsedMin = Math.max(0, Math.round((now - openedAt) / 60000));

  const onDone = (ti) => {
    setPreferred(null);
    update(completeStep(tracks, run, ti, Date.now()));
  };
  const onSkip = (ti) => update(skipTimer(tracks, run, ti, Date.now()));
  const onPause = (ti) => update(toggleTimer(run, ti, Date.now()), { record: false });
  const onPrev = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setRun(prev);
    persist(prev);
  };
  const close = () => navigation.goBack();
  const finish = () => {
    persist(null);
    navigation.goBack();
  };
  const changeView = (v) => {
    setView(v);
  };

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 8 },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.time}>
          {phase === "run" && !finished ? (
            left < 60 ? (
              `נותרו כ־${Math.max(1, Math.round(left))} דקות`
            ) : (
              <Text>
                נותרו כ־<Text style={{ writingDirection: "ltr" }}>{hmm(left)}</Text> שעות
              </Text>
            )
          ) : (
            `סך הכל ${timeLabel(Math.round(plan.total))}`
          )}
        </Text>
        {phase === "run" && !finished && (
          <View accessibilityRole="radiogroup" style={styles.switch}>
            {[
              ["guided", "מודרך"],
              ["board", "לוח"],
            ].map(([k, label]) => (
              <TouchableOpacity
                key={k}
                accessibilityState={{ selected: view_ === k }}
                onPress={() => changeView(k)}
                style={[styles.switchBtn, view_ === k && { backgroundColor: C.cookFg }]}
              >
                <Text style={[styles.switchText, view_ === k && { color: C.cookBg }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TouchableOpacity style={styles.closeBtn} accessibilityLabel="יציאה מהבישול" onPress={close}>
          <Ionicons name="close" size={20} color={C.cookFg} />
        </TouchableOpacity>
      </View>

      {phase === "plan" && <KitchenPlan tracks={tracks} plan={plan} startMs={Date.now()} onStart={start} />}

      {phase === "run" && finished && (
        <View style={styles.finished}>
          <Ionicons name="checkmark-circle" size={72} color="#5cc487" />
          <Text style={styles.finishTitle}>הכל מוכן, בתיאבון</Text>
          <Text style={styles.sub}>
            בישלתם {tracks.length} מתכונים תוך {elapsedMin} דקות.
          </Text>
          <TouchableOpacity style={styles.cta} onPress={finish}>
            <Text style={styles.ctaText}>סיום</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === "run" && !finished && view_ === "guided" && (
        <Guided
          tracks={tracks}
          run={run}
          now={now}
          current={current}
          onPick={setPreferred}
          onDone={onDone}
          onSkip={onSkip}
          onPause={onPause}
          onPrev={onPrev}
          canPrev={history.length > 0}
        />
      )}
      {phase === "run" && !finished && view_ === "board" && (
        <Board
          tracks={tracks}
          run={run}
          now={now}
          current={current}
          onDone={onDone}
          onSkip={onSkip}
          onPause={onPause}
        />
      )}
    </View>
  );
}

export default CookTogetherScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.cookBg, paddingHorizontal: 20, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  time: { flex: 1, fontFamily: F.medium, fontSize: 14, color: MUTED },
  switch: { flexDirection: "row", height: 44, borderRadius: 22, backgroundColor: SOFT },
  switchBtn: { height: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: "center" },
  switchText: { fontFamily: F.semi, fontSize: 14, color: C.cookFg },
  closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: SOFT, alignItems: "center", justifyContent: "center" },
  sub: { fontFamily: F.body, fontSize: 13, lineHeight: 19, color: MUTED },
  planTitle: { fontFamily: F.display900, fontSize: 26, lineHeight: 32, color: C.cookFg },
  chart: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 18, padding: 14, gap: 12 },
  laneHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  laneName: { flex: 1, fontFamily: F.semi, fontSize: 14, color: C.cookFg },
  laneTrack: { height: 12, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.08)" },
  legend: { flexDirection: "row", gap: 18, marginTop: 2 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 14, height: 8, borderRadius: 4, backgroundColor: C.cookFg },
  legendText: { fontFamily: F.medium, fontSize: 12, color: MUTED },
  h2: { fontFamily: F.display700, fontSize: 18, color: C.cookFg },
  h3: { fontFamily: F.semi, fontSize: 14, color: MUTED },
  orderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  orderTime: { width: 44, fontFamily: F.bold, fontSize: 14, color: C.cookFg, writingDirection: "ltr", textAlign: "left" },
  orderText: { flex: 1, fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.cookFg },
  cta: {
    height: 60,
    borderRadius: 18,
    backgroundColor: C.cookFg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaText: { fontFamily: F.semi, fontSize: 17, color: C.cookBg },
  chips: { flexDirection: "row", gap: 6 },
  chip: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 8,
    justifyContent: "center",
    gap: 4,
  },
  chipTop: { flexDirection: "row", alignItems: "center", gap: 5 },
  chipName: { flex: 1, fontFamily: F.semi, fontSize: 13, color: C.cookFg },
  chipStatus: { fontFamily: F.bold, fontSize: 14, textAlign: "right" },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  curName: { flex: 1, fontFamily: F.semi, fontSize: 14 },
  bigStep: { fontFamily: F.display500, fontSize: 26, lineHeight: 42, color: C.cookFg },
  passiveNote: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  passiveText: { flex: 1, fontFamily: F.body, fontSize: 13, lineHeight: 19, color: MUTED },
  upRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: 10,
    minHeight: 58,
  },
  upWhen: { fontFamily: F.body, fontSize: 12, color: MUTED },
  upText: { fontFamily: F.medium, fontSize: 15, color: C.cookFg },
  waitTitle: { fontFamily: F.display700, fontSize: 24, color: C.cookFg },
  waitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: 10,
    minHeight: 64,
  },
  waitName: { flex: 1, fontFamily: F.semi, fontSize: 15, color: C.cookFg },
  waitTime: { fontFamily: F.bold, fontSize: 20, color: C.cookFg, writingDirection: "ltr" },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: SOFT, alignItems: "center", justifyContent: "center" },
  smallBtn: { height: 44, paddingHorizontal: 12, borderRadius: 14, backgroundColor: SOFT, justifyContent: "center" },
  smallBtnText: { fontFamily: F.semi, fontSize: 13, color: C.cookFg },
  footer: { flexDirection: "row", gap: 10 },
  prev: { width: 64, height: 60, borderRadius: 18, backgroundColor: SOFT, alignItems: "center", justifyContent: "center" },
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
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1.5,
    borderColor: "transparent",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  cardName: { flex: 1, fontFamily: F.semi, fontSize: 15, color: C.cookFg },
  bar: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.12)", flexDirection: "row" },
  cardStep: { fontFamily: F.body, fontSize: 15, lineHeight: 26, color: C.cookFg, minHeight: 44 },
  cardTimer: { fontFamily: F.bold, fontSize: 24, color: C.cookFg, writingDirection: "ltr" },
  waitsYou: { flex: 1, fontFamily: F.semi, fontSize: 13 },
  doneBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: C.cookFg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  doneBtnText: { fontFamily: F.semi, fontSize: 14, color: C.cookBg },
  finished: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  finishTitle: { fontFamily: F.display900, fontSize: 28, color: C.cookFg },
});
