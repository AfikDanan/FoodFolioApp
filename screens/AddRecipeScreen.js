import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as ExpoImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fetchAllCategories,
  insertRecipeWithCategories,
} from "../util/database";
import {
  importFromUrl,
  importFromImage,
  importFromPdf,
  importFromText,
  toDraft,
} from "../util/importRecipe";
import { isSocialUrl } from "../util/share";
import {
  displayUnit,
  formatQty,
  parseIngredientLine,
  parseQty,
  stepsToObject,
  tintFor,
} from "../util/recipeUtils";
import {
  RoundButton,
  Segmented,
  Chip,
  Checkbox,
  DepartmentIcon,
  useToast,
} from "../components/UI/kit";
import { C, F, SCREEN_PAD } from "../constants/theme";

const SOCIAL_ERRORS = ["needs-caption", "social-no-recipe"];

const STAGES = [
  "קורא את התוכן",
  "מחלץ מרכיבים והוראות",
  "ממיר יחידות ומשייך מחלקות בסופר",
  "מכין את המתכון לבדיקה",
];

const TITLES = {
  form: "מתכון חדש",
  importing: "רגע…",
  review: "בדיקה לפני שמירה",
  multi: "מתכונים מהקובץ",
  error: "לא זוהה מתכון",
};

const ERRORS = {
  "no-recipe": { title: "לא זוהה מתכון", sub: "אפשר לנסות שוב, או להזין את המתכון ידנית." },
  "rate-limited": { title: "הגעתם למגבלת הייבוא להיום", sub: "אפשר להזין את המתכון ידנית, או לנסות שוב מחר." },
  "fetch-blocked": {
    title: "האתר לא מאפשר קריאה אוטומטית",
    sub: "אפשר להעתיק את טקסט המתכון מהאתר ולהדביק אותו כאן, או לצלם מסך ולייבא כתמונה.",
  },
  "needs-caption": {
    title: "לא הצלחנו לקרוא את הפוסט",
    sub: "כנראה שזה פוסט מחשבון פרטי: גם אם אתם עוקבים אחריו, FoodFolio לא רואה אותו. העתיקו את הכיתוב באינסטגרם או בטיקטוק וחזרו לכאן, או צלמו מסך של המתכון.",
  },
  "social-no-recipe": {
    title: "לא מצאנו מתכון בטקסט של הפוסט",
    sub: "לפעמים המתכון נמצא בתגובות או בסרטון עצמו. אפשר להעתיק אותו ולהדביק כאן, או לצלם מסך ולייבא כתמונה.",
  },
  "bad-file": {
    title: "לא הצלחנו לקרוא את הקובץ",
    sub: "אפשר לשתף לכאן קובץ PDF של מתכונים. אם זה PDF סרוק, צלמו אותו ויבאו כתמונה.",
  },
  "too-large": {
    title: "הקובץ גדול מדי",
    sub: "אפשר לשתף פחות מתכונים בכל פעם, או לייבא את המתכון כתמונה.",
  },
  network: { title: "אין חיבור לשרת", sub: "בדקו את החיבור לאינטרנט ונסו שוב." },
  failed: { title: "הייבוא נכשל", sub: "משהו השתבש בצד שלנו. אפשר לנסות שוב, או להזין ידנית." },
};

function AddRecipeScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [tab, setTab] = useState("link");
  const [phase, setPhase] = useState("form"); // form | importing | review | error
  const [stage, setStage] = useState(0);
  const [url, setUrl] = useState("");
  const [pasted, setPasted] = useState("");
  const [photo, setPhoto] = useState(null);
  const [manual, setManual] = useState({ title: "", ingredients: "", steps: "" });
  const [draft, setDraft] = useState(null);
  // Several recipes from one PDF: the drafts and which of them to save.
  const [drafts, setDrafts] = useState([]);
  const [keep, setKeep] = useState(new Set());
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errorCode, setErrorCode] = useState(null);
  const stageTimer = useRef(null);

  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const handledShare = useRef(null);

  useEffect(() => {
    fetchAllCategories().then((c) => {
      setCategories(c || []);
      setCategoriesLoaded(true);
    });
    return () => clearInterval(stageTimer.current);
  }, []);

  // Something was shared into the app (Instagram, TikTok, a browser...): import it right away.
  useEffect(() => {
    const shared = route?.params?.shared;
    const stamp = route?.params?.at;
    if (!shared || !categoriesLoaded || handledShare.current === stamp) return;
    handledShare.current = stamp;
    const names = categories.map((c) => c.name);
    if (shared.pdf) {
      runImport(() => importFromPdf(shared.pdf, names));
    } else if (shared.url) {
      setTab("link");
      setUrl(shared.url);
      setPasted(shared.text || "");
      runImport(() => importFromUrl(shared.url, names, shared.text), shared.url);
    } else if ((shared.text || "").length >= 20) {
      setTab("link");
      setPasted(shared.text);
      runImport(() => importFromText(shared.text, names));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.at, categoriesLoaded]);

  const canSubmit =
    (tab === "link" && (url.trim().length > 0 || pasted.trim().length >= 20)) ||
    (tab === "photo" && !!photo) ||
    (tab === "manual" && manual.title.trim().length > 0);

  // `fromUrl` is the link being imported, used to word errors for Instagram and TikTok.
  const runImport = async (work, fromUrl = null) => {
    setPhase("importing");
    setStage(0);
    clearInterval(stageTimer.current);
    // Stages are request milestones, not real backend progress: advance while
    // we wait, but never past the last "preparing" stage until the reply lands.
    stageTimer.current = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 2)), 1600);
    try {
      let result = await work();
      clearInterval(stageTimer.current);
      setStage(STAGES.length);
      if (Array.isArray(result)) {
        if (result.length === 0) throw Object.assign(new Error("empty"), { code: "no-recipe" });
        if (result.length > 1) {
          setDrafts(result);
          setKeep(new Set(result.map((_, i) => i)));
          setPhase("multi");
          return;
        }
        result = result[0];
      }
      setDraft({ ...result, sourceUrl: fromUrl || result.sourceUrl || null });
      const suggested = categories.find((c) => c.name === result.suggestedCategory);
      setCategoryId(suggested ? suggested.id : null);
      setPhase("review");
    } catch (e) {
      clearInterval(stageTimer.current);
      const code = e.code || "failed";
      // A social post we could read but that holds no recipe usually has it in the
      // video or the comments: the fix is the same as for an unreadable post.
      setErrorCode(isSocialUrl(fromUrl) && code === "no-recipe" ? "social-no-recipe" : code);
      setPhase("error");
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    if (tab === "link") {
      const names = categories.map((c) => c.name);
      runImport(() =>
        url.trim()
          ? importFromUrl(url.trim(), names, pasted)
          : importFromText(pasted, names),
        url.trim() || null
      );
    } else if (tab === "photo") {
      runImport(() => importFromImage(photo, categories.map((c) => c.name)));
    } else {
      const ingredients = manual.ingredients
        .split("\n")
        .filter((l) => l.trim())
        .map(parseIngredientLine)
        .filter((i) => i.name);
      setDraft(
        toDraft({
          title: manual.title,
          ingredients: ingredients.length
            ? ingredients
            : [{ name: "מרכיב", quantity: 1, unit: "יחידה" }],
          instructions: stepsToObject(manual.steps.split("\n").filter((l) => l.trim())),
          tags: [
            ...(ingredients.some((i) => ["בשר ועוף", "דגים"].includes(i.department))
              ? []
              : ["צמחוני"]),
            ...(ingredients.length > 0 && ingredients.length <= 5 ? ["מהיר"] : []),
          ],
        })
      );
      setPhase("review");
    }
  };

  const pickPhoto = async (fromCamera) => {
    const perm = fromCamera
      ? await ExpoImagePicker.requestCameraPermissionsAsync()
      : await ExpoImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = fromCamera
      ? await ExpoImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ExpoImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  };

  const categoryIdFor = (d) => categories.find((c) => c.name === d.suggestedCategory)?.id;

  const saveMany = async () => {
    const chosen = drafts.filter((_, i) => keep.has(i));
    if (!chosen.length || saving) return;
    setSaving(true);
    let saved = 0;
    for (const d of chosen) {
      try {
        const id = categoryIdFor(d);
        await insertRecipeWithCategories({
          title: d.title.trim(),
          ingredients: d.ingredients,
          instructions: stepsToObject(d.steps),
          totalTime: d.totalTime,
          servings: d.servings,
          tags: d.tags,
          fridgeDays: d.fridgeDays,
          estimatedIdx: d.estimatedIdx,
          sourceUrl: d.sourceUrl || null,
          categoryIds: id ? [id] : [],
        });
        saved += 1;
      } catch (e) {
        console.error("Error saving recipe from PDF:", e);
      }
    }
    toast(
      saved === chosen.length ? `${saved} מתכונים נשמרו` : `נשמרו ${saved} מתוך ${chosen.length} מתכונים`
    );
    navigation.reset({ index: 0, routes: [{ name: "Home", params: { screen: "All Recipes" } }] });
  };

  const save = async () => {
    if (!draft.title.trim() || saving) return;
    setSaving(true);
    try {
      const id = await insertRecipeWithCategories({
        title: draft.title.trim(),
        ingredients: draft.ingredients,
        instructions: stepsToObject(draft.steps),
        totalTime: draft.totalTime,
        servings: draft.servings,
        tags: draft.tags,
        fridgeDays: draft.fridgeDays,
        estimatedIdx: draft.estimatedIdx,
        sourceUrl: draft.sourceUrl || null,
        categoryIds: categoryId ? [categoryId] : [],
      });
      const cat = categories.find((c) => c.id === categoryId);
      toast(cat ? `נשמר ב״${cat.name}״` : "המתכון נשמר");
      navigation.reset({
        index: 1,
        routes: [{ name: "Home" }, { name: "RecipeDisplay", params: { recipeId: id } }],
      });
    } catch (e) {
      console.error("Error saving recipe:", e);
      setSaving(false);
      toast("השמירה נכשלה, נסו שוב");
    }
  };

  // Private or unreadable post: the person copies the caption in Instagram or
  // TikTok, comes back and imports it with one tap (the link is kept as context).
  const pasteCaptionAndRetry = async () => {
    const clip = ((await Clipboard.getStringAsync()) || "").trim();
    if (clip.length < 20 || /^https?:\/\/\S+$/.test(clip)) {
      toast("קודם מעתיקים את הכיתוב של הפוסט, ואז חוזרים לכאן");
      return;
    }
    setPasted(clip);
    const names = categories.map((c) => c.name);
    const link = url.trim();
    runImport(
      () => (link ? importFromUrl(link, names, clip) : importFromText(clip, names)),
      link || null
    );
  };

  const resetToForm = (nextTab) => {
    if (nextTab) setTab(nextTab);
    setPhase("form");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 10 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{TITLES[phase]}</Text>
        <RoundButton icon="close" onPress={() => navigation.goBack()} />
      </View>

      {phase === "form" && (
        <>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { key: "link", label: "קישור", icon: "link-outline" },
                { key: "photo", label: "צילום", icon: "camera-outline" },
                { key: "manual", label: "ידני", icon: "create-outline" },
              ]}
            />

            {tab === "link" && (
              <>
                <Text style={styles.lead}>
                  מדביקים קישור מכל אתר מתכונים. המרכיבים, ההוראות והזמנים יחולצו ותוכלו לבדוק לפני
                  שמירה.
                </Text>
                <View style={styles.urlBox}>
                  <Ionicons name="link-outline" size={19} color={C.muted} />
                  <TextInput
                    style={styles.urlInput}
                    value={url}
                    onChangeText={setUrl}
                    placeholder="https://"
                    placeholderTextColor={C.faint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </View>
                <TouchableOpacity
                  style={{ alignSelf: "flex-start" }}
                  onPress={async () => setUrl((await Clipboard.getStringAsync()) || url)}
                >
                  <Text style={styles.pasteLink}>הדבקה מהלוח</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.pasteBox}
                  value={pasted}
                  onChangeText={setPasted}
                  placeholder="טקסט המתכון או הכיתוב של הסרטון (אפשר גם יחד עם הקישור)"
                  placeholderTextColor={C.faint}
                  multiline
                />
                <View style={styles.videoCard}>
                  <View style={styles.videoHead}>
                    <Ionicons name="videocam-outline" size={22} color={C.accent} />
                    <Text style={styles.videoTitle}>מתכונים מסרטונים</Text>
                  </View>
                  <Text style={styles.videoText}>
                    הכי פשוט: לשתף את הסרטון מאינסטגרם או מטיקטוק ישירות ל-FoodFolio. אם הייבוא לא
                    מצליח, מעתיקים את הכיתוב של הסרטון ומדביקים אותו בשדה שלמעלה, ליד הקישור.
                  </Text>
                </View>
              </>
            )}

            {tab === "photo" && (
              <>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.dropzone}
                  onPress={() => pickPhoto(true)}
                >
                  {photo ? (
                    <Image source={{ uri: photo }} style={styles.preview} resizeMode="cover" />
                  ) : (
                    <>
                      <Ionicons name="camera-outline" size={34} color={C.muted} />
                      <Text style={styles.dropTitle}>צילום דף מתכון</Text>
                      <Text style={styles.dropSub}>
                        ספר בישול, מחברת בכתב יד או צילום מסך.
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondary} onPress={() => pickPhoto(false)}>
                  <Ionicons name="images-outline" size={18} color={C.ink} />
                  <Text style={styles.secondaryText}>בחירה מהגלריה</Text>
                </TouchableOpacity>
              </>
            )}

            {tab === "manual" && (
              <View style={{ gap: 12 }}>
                <Field
                  label="שם המתכון"
                  value={manual.title}
                  onChangeText={(t) => setManual((m) => ({ ...m, title: t }))}
                />
                <Field
                  label="מרכיבים, אחד בכל שורה"
                  value={manual.ingredients}
                  height={120}
                  onChangeText={(t) => setManual((m) => ({ ...m, ingredients: t }))}
                />
                <Field
                  label="אופן ההכנה, שלב בכל שורה"
                  value={manual.steps}
                  height={110}
                  onChangeText={(t) => setManual((m) => ({ ...m, steps: t }))}
                />
              </View>
            )}
          </ScrollView>
          </KeyboardAvoidingView>
          <Cta
            label={tab === "manual" ? "המשך לבדיקה" : "ייבוא המתכון"}
            disabled={!canSubmit}
            onPress={submit}
            bottom={insets.bottom}
          />
        </>
      )}

      {phase === "importing" && (
        <View style={styles.body}>
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator size="large" color={C.accent} />
          </View>
          <View style={styles.stages}>
            {STAGES.map((label, i) => {
              const done = i < stage;
              const current = i === stage;
              return (
                <View key={label} style={styles.stageRow}>
                  <Ionicons
                    name={done ? "checkmark-circle" : "ellipse-outline"}
                    size={20}
                    color={done ? C.ink : current ? C.accent : "#b4b5ad"}
                  />
                  <Text
                    style={[
                      styles.stageText,
                      { color: done ? C.ink : current ? C.accent : "#b4b5ad" },
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {phase === "error" && (
        <View style={[styles.body, { alignItems: "center", gap: 14, paddingTop: 40 }]}>
          <Ionicons name="alert-circle-outline" size={44} color={C.warnText} />
          <Text style={styles.errorTitle}>{ERRORS[errorCode]?.title || ERRORS.failed.title}</Text>
          <Text style={styles.errorSub}>{ERRORS[errorCode]?.sub || ERRORS.failed.sub}</Text>
          {SOCIAL_ERRORS.includes(errorCode) ? (
            <>
              <TouchableOpacity style={styles.primarySmall} onPress={pasteCaptionAndRetry}>
                <Text style={styles.primarySmallText}>הדבקת הכיתוב שהעתקתי</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondary} onPress={() => resetToForm("photo")}>
                <Text style={styles.secondaryText}>ייבוא מצילום מסך</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.primarySmall} onPress={() => resetToForm()}>
              <Text style={styles.primarySmallText}>נסו שוב</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.secondary} onPress={() => resetToForm("manual")}>
            <Text style={styles.secondaryText}>הזנה ידנית</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === "review" && draft && (
        <>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.reviewTop}>
              <View style={[styles.thumb, { backgroundColor: tintFor(1, draft.title) }]} />
              <View style={{ flex: 1, gap: 4 }}>
                <TextInput
                  style={styles.titleInput}
                  value={draft.title}
                  onChangeText={(t) => setDraft((d) => ({ ...d, title: t }))}
                  multiline
                />
                <Text style={styles.meta}>
                  {[draft.totalTime, `${draft.servings} מנות`].join(" · ")}
                </Text>
              </View>
            </View>

            <View style={styles.labelRow}>
              <Text style={styles.label}>קטגוריה</Text>
              {draft.suggestedCategory && categoryId === categories.find((c) => c.name === draft.suggestedCategory)?.id ? (
                <Text style={styles.labelSub}>✦ הוצע אוטומטית</Text>
              ) : null}
            </View>
            <View style={styles.wrap}>
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  on={categoryId === c.id}
                  onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
                />
              ))}
            </View>

            {draft.tags.length > 0 && (
              <>
                <Text style={styles.label}>תגיות</Text>
                <View style={styles.wrap}>
                  {draft.tags.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={styles.tagPill}
                      onPress={() =>
                        setDraft((d) => ({ ...d, tags: d.tags.filter((x) => x !== t) }))
                      }
                    >
                      <Text style={styles.tagText}>{t}</Text>
                      <Ionicons name="close" size={14} color={C.muted} />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <View style={styles.labelRow}>
              <Text style={styles.label}>מרכיבים ({draft.ingredients.length})</Text>
              <Text style={styles.labelSub}>משויכים למחלקות בסופר</Text>
            </View>
            <View style={styles.card}>
              {draft.ingredients.map((ing, i) => (
                <View key={i} style={[styles.ingRow, i > 0 && styles.divider]}>
                  <Text style={styles.ingText}>
                    {formatQty(parseQty(ing.quantity))} {displayUnit(parseQty(ing.quantity), ing.unit) ? `${displayUnit(parseQty(ing.quantity), ing.unit)} ` : ""}
                    {ing.name}
                  </Text>
                  <DepartmentIcon name={ing.department} size={20} />
                  <Text style={styles.deptName}>{ing.department}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.meta}>{draft.steps.length} שלבי הכנה זוהו</Text>
          </ScrollView>
          <Cta label="שמירה למתכונים" onPress={save} disabled={!draft.title.trim() || saving} bottom={insets.bottom} />
        </>
      )}

      {phase === "multi" && (
        <>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>נמצאו {drafts.length} מתכונים</Text>
              <TouchableOpacity
                onPress={() =>
                  setKeep(keep.size === drafts.length ? new Set() : new Set(drafts.map((_, i) => i)))
                }
              >
                <Text style={styles.pasteLink}>
                  {keep.size === drafts.length ? "ניקוי" : "בחירת הכל"}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.meta}>
              כל מתכון יישמר בקטגוריה שלו אם יש לכם קטגוריה בשם הזה. אפשר לערוך כל מתכון אחרי השמירה.
            </Text>
            {drafts.map((d, i) => {
              const toggle = () =>
                setKeep((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                });
              const cat = categories.find((c) => c.id === categoryIdFor(d));
              return (
                <TouchableOpacity key={i} activeOpacity={0.8} style={styles.multiRow} onPress={toggle}>
                  <Checkbox checked={keep.has(i)} onPress={toggle} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.multiTitle}>{d.title}</Text>
                    <Text style={styles.meta}>
                      {[
                        cat?.name,
                        `${d.ingredients.length} מרכיבים`,
                        `${d.steps.length} שלבים`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Cta
            label={keep.size ? `שמירת ${keep.size} מתכונים` : "בחרו מתכון אחד לפחות"}
            onPress={saveMany}
            disabled={keep.size === 0 || saving}
            bottom={insets.bottom}
          />
        </>
      )}
    </View>
  );
}

function Field({ label, value, onChangeText, height }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.field, height ? { height, textAlignVertical: "top", paddingTop: 12 } : null]}
        value={value}
        onChangeText={onChangeText}
        multiline={!!height}
        placeholderTextColor={C.faint}
      />
    </View>
  );
}

function Cta({ label, onPress, disabled, bottom }) {
  return (
    <View style={[styles.ctaWrap, { paddingBottom: Math.max(bottom, 16) }]}>
      <TouchableOpacity
        activeOpacity={0.9}
        disabled={disabled}
        onPress={onPress}
        style={[styles.cta, disabled && { opacity: 0.4 }]}
      >
        <Text style={styles.ctaText}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default AddRecipeScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SCREEN_PAD,
    paddingBottom: 14,
  },
  title: { fontFamily: F.display900, fontSize: 28, color: C.ink },
  body: { paddingHorizontal: SCREEN_PAD, paddingBottom: 24, gap: 16 },
  pasteBox: {
    minHeight: 110,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    padding: 14,
    fontFamily: F.body,
    fontSize: 15,
    color: C.ink,
    textAlignVertical: "top",
  },
  pasteLink: { fontFamily: F.semi, fontSize: 14, color: C.accent },
  videoCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 18,
    padding: 16,
    gap: 12,
    marginTop: 6,
  },
  videoHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  videoTitle: { fontFamily: F.bold, fontSize: 16, color: C.ink },
  videoText: { fontFamily: F.body, fontSize: 14, lineHeight: 21, color: C.muted2 },
  tagPill: {
    height: 32,
    paddingStart: 12,
    paddingEnd: 10,
    borderRadius: 16,
    backgroundColor: C.accentSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tagText: { fontFamily: F.medium, fontSize: 13, color: C.ink },
  lead: { fontFamily: F.body, fontSize: 15, lineHeight: 23, color: C.muted2 },
  urlBox: {
    height: 52,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  urlInput: {
    flex: 1,
    fontFamily: F.body,
    fontSize: 15,
    color: C.ink,
    writingDirection: "ltr",
  },
  dropzone: {
    height: 300,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#cfc8b9",
    backgroundColor: C.chip,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 24,
    overflow: "hidden",
  },
  preview: { ...StyleSheet.absoluteFillObject },
  dropTitle: { fontFamily: F.semi, fontSize: 16, color: C.ink },
  dropSub: { fontFamily: F.body, fontSize: 13, color: C.muted, textAlign: "center" },
  secondary: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 22,
  },
  secondaryText: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  field: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 14,
    fontFamily: F.body,
    fontSize: 15,
    color: C.ink,
  },
  label: { fontFamily: F.display700, fontSize: 17, color: C.ink },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  labelSub: { fontFamily: F.body, fontSize: 12, color: C.muted },
  stages: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 16, gap: 16 },
  stageRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stageText: { fontFamily: F.medium, fontSize: 15 },
  errorTitle: { fontFamily: F.display700, fontSize: 22, color: C.ink },
  errorSub: { fontFamily: F.body, fontSize: 15, color: C.muted, textAlign: "center" },
  primarySmall: {
    height: 48,
    borderRadius: 14,
    backgroundColor: C.accent,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  primarySmallText: { fontFamily: F.semi, fontSize: 15, color: C.white },
  reviewTop: { flexDirection: "row", gap: 14, alignItems: "center" },
  thumb: { width: 84, height: 84, borderRadius: 16 },
  titleInput: {
    fontFamily: F.display700,
    fontSize: 21,
    color: C.ink,
    borderBottomWidth: 1,
    borderBottomColor: C.line4,
    paddingVertical: 4,
  },
  meta: { fontFamily: F.body, fontSize: 13, color: C.muted },
  multiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 14,
  },
  multiTitle: { fontFamily: F.semi, fontSize: 16, color: C.ink },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line },
  ingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11, paddingHorizontal: 14 },
  divider: { borderTopWidth: 1, borderTopColor: C.line2 },
  ingText: { flex: 1, fontFamily: F.medium, fontSize: 14, color: C.ink },
  deptImg: { width: 20, height: 20, resizeMode: "contain" },
  deptName: { fontFamily: F.medium, fontSize: 11, color: C.muted, minWidth: 56 },
  ctaWrap: { paddingHorizontal: SCREEN_PAD, paddingTop: 8 },
  cta: {
    height: 54,
    borderRadius: 16,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { fontFamily: F.semi, fontSize: 16, color: C.white },
});
