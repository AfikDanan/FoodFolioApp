import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Chip, Segmented, Toggle, useToast } from "../components/UI/kit";
import StepText from "../components/StepText";
import { ALL_MEALS } from "../util/planner";
import { MEAL_PRESETS, saveMeals, useMeals } from "../util/mealSettings";
import { saveDiet, savePrefs, usePrefs } from "../util/prefs";
import { ALLERGENS, DIET_STYLES } from "../util/diet";
import { seedSampleData } from "../util/devSeed";
import { C, F, SCREEN_PAD } from "../constants/theme";

const MEAL_INFO = {
  בוקר: ["ארוחת בוקר", ""],
  "ביניים 1": ["ביניים בוקר", "נשנוש או ארוחה קטנה לפני הצהריים"],
  צהריים: ["ארוחת צהריים", ""],
  "ביניים 2": ["ביניים אחה״צ", "נשנוש או ארוחה קטנה אחר הצהריים"],
  ערב: ["ארוחת ערב", ""],
};

const COOK_VIEW_OPTIONS = [
  { key: "guided", label: "תור מודרך" },
  { key: "board", label: "לוח מתכונים" },
];

const PREVIEW_INGREDIENTS = [
  { name: "בשר טחון", label: "500 גרם" },
  { name: "בצל", label: "1 יחידה" },
];

const sameMeals = (a, b) => a.length === b.length && a.every((m, i) => m === b[i]);

// A chip that turns into a small text field, for adding a free-text item.
function AddChip({ label, placeholder, onAdd }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const submit = () => {
    const value = text.trim();
    if (value) onAdd(value);
    setText("");
    setOpen(false);
  };
  if (!open) {
    return (
      <TouchableOpacity style={styles.addChip} activeOpacity={0.8} onPress={() => setOpen(true)}>
        <Ionicons name="add" size={16} color={C.ink} />
        <Text style={styles.addChipText}>{label}</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.addField}>
      <TextInput
        autoFocus
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        onBlur={submit}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        returnKeyType="done"
        maxLength={40}
        style={styles.addInput}
      />
      <TouchableOpacity onPress={submit} hitSlop={10} accessibilityLabel="הוספה">
        <Ionicons name="checkmark" size={20} color={C.accent} />
      </TouchableOpacity>
    </View>
  );
}

function RemovableChip({ label, onRemove }) {
  return (
    <TouchableOpacity
      style={styles.removable}
      activeOpacity={0.8}
      onPress={onRemove}
      accessibilityLabel={`הסרת ${label}`}
    >
      <Text style={styles.removableText}>{label}</Text>
      <Ionicons name="close" size={16} color={C.white} />
    </TouchableOpacity>
  );
}

const SettingsScreen = () => {
  const toast = useToast();
  const meals = useMeals();
  const prefs = usePrefs();
  const diet = prefs.diet;

  const toggleMeal = (meal) => {
    const next = meals.includes(meal) ? meals.filter((m) => m !== meal) : [...meals, meal];
    if (next.length === 0) {
      toast("נדרשת לפחות ארוחה אחת ביום");
      return;
    }
    saveMeals(next);
  };

  const toggleAllergy = (key) =>
    saveDiet({
      allergies: diet.allergies.includes(key)
        ? diet.allergies.filter((k) => k !== key)
        : [...diet.allergies, key],
    });

  const handlePrivacyPolicyPress = () => {
    const url = "https://foodfolio.streamlit.app/";
    Linking.openURL(url).catch((err) => console.error("Couldn't load page", err));
  };

  const loadSamples = async () => {
    const { added } = await seedSampleData();
    toast(`נוספו ${added} מתכוני דוגמה`);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.section}>
        <Text style={styles.title}>ארוחות ביום</Text>
        <Text style={styles.sub}>
          לוח התכנון ודף הבית יציגו רק את הארוחות שבחרתם. אפשר לשנות בכל זמן, והתכנון הקיים נשמר.
        </Text>
        <View style={styles.presets}>
          {MEAL_PRESETS.map((p) => (
            <Chip
              key={p.label}
              label={p.label}
              dark
              on={sameMeals(meals, p.meals)}
              onPress={() => saveMeals(p.meals)}
            />
          ))}
        </View>
        <View style={styles.card}>
          {ALL_MEALS.map((meal, i) => (
            <TouchableOpacity
              key={meal}
              activeOpacity={0.7}
              style={[styles.row, i > 0 && styles.divider]}
              onPress={() => toggleMeal(meal)}
            >
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={styles.rowLabel}>{MEAL_INFO[meal][0]}</Text>
                {!!MEAL_INFO[meal][1] && <Text style={styles.rowSub}>{MEAL_INFO[meal][1]}</Text>}
              </View>
              <Toggle on={meals.includes(meal)} onPress={() => toggleMeal(meal)} />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>בזמן הבישול</Text>
        <View style={styles.card}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.row}
            onPress={() => savePrefs({ stepQuantities: !prefs.stepQuantities })}
          >
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={styles.rowLabel}>כמויות בתוך שלבי ההכנה</Text>
              <Text style={styles.rowSub}>הכמות מופיעה ליד כל מרכיב, בלי לחזור לרשימה</Text>
            </View>
            <Toggle
              on={prefs.stepQuantities}
              onPress={() => savePrefs({ stepQuantities: !prefs.stepQuantities })}
            />
          </TouchableOpacity>
          <View style={styles.preview}>
            <Text style={styles.previewLabel}>כך זה נראה</Text>
            <StepText
              style={styles.previewText}
              text="מערבבים את הבשר הטחון עם הבצל המגורר."
              ingredients={PREVIEW_INGREDIENTS}
            />
          </View>
          <View style={[styles.block, styles.divider]}>
            <View style={{ gap: 1 }}>
              <Text style={styles.rowLabel}>בישול של כמה מתכונים יחד</Text>
              <Text style={styles.rowSub}>
                התצוגה שנפתחת ראשונה. אפשר להחליף ביניהן גם באמצע הבישול.
              </Text>
            </View>
            <Segmented
              options={COOK_VIEW_OPTIONS}
              value={prefs.cookView}
              onChange={(cookView) => savePrefs({ cookView })}
            />
            <Text style={styles.rowSub}>
              {prefs.cookView === "guided"
                ? "תור מודרך: צעד אחד בכל פעם, והאפליקציה מחליטה מה עושים עכשיו."
                : "לוח מתכונים: כל המתכונים על מסך אחד, כל אחד עם השלב והטיימר שלו."}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>העדפות תזונה</Text>
        <Text style={styles.sub}>
          מרכיב שלא מתאים לכם יסומן בדף המתכון, עם כפתור להחלפה במרכיב אחר.
        </Text>

        <Text style={styles.label}>סגנון אכילה</Text>
        <View style={styles.wrap}>
          {DIET_STYLES.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              dark
              on={diet.style === s.key}
              onPress={() => saveDiet({ style: s.key })}
            />
          ))}
        </View>

        <View style={styles.card}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.row}
            onPress={() => saveDiet({ kosher: !diet.kosher })}
          >
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={styles.rowLabel}>כשר</Text>
              <Text style={styles.rowSub}>בלי חזיר ובלי פירות ים</Text>
            </View>
            <Toggle on={diet.kosher} onPress={() => saveDiet({ kosher: !diet.kosher })} />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            style={[styles.row, styles.divider]}
            onPress={() => saveDiet({ noMeatDairy: !diet.noMeatDairy })}
          >
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={styles.rowLabel}>בלי בשר וחלב באותו מתכון</Text>
              <Text style={styles.rowSub}>במתכון בשרי יסומנו המרכיבים החלביים</Text>
            </View>
            <Toggle
              on={diet.noMeatDairy}
              onPress={() => saveDiet({ noMeatDairy: !diet.noMeatDairy })}
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>אלרגיות ורגישויות</Text>
        <View style={styles.wrap}>
          {ALLERGENS.map((a) => (
            <Chip
              key={a.key}
              label={a.label}
              dark
              on={diet.allergies.includes(a.key)}
              onPress={() => toggleAllergy(a.key)}
            />
          ))}
          {diet.otherAllergies.map((name) => (
            <RemovableChip
              key={name}
              label={name}
              onRemove={() =>
                saveDiet({ otherAllergies: diet.otherAllergies.filter((x) => x !== name) })
              }
            />
          ))}
          <AddChip
            label="אחר"
            placeholder="למשל חרדל"
            onAdd={(name) => saveDiet({ otherAllergies: [...diet.otherAllergies, name] })}
          />
        </View>

        <Text style={styles.label}>מרכיבים שלא אוכלים אצלנו</Text>
        <View style={styles.wrap}>
          {diet.avoid.map((name) => (
            <RemovableChip
              key={name}
              label={name}
              onRemove={() => saveDiet({ avoid: diet.avoid.filter((x) => x !== name) })}
            />
          ))}
          <AddChip
            label="הוספה"
            placeholder="למשל כוסברה"
            onAdd={(name) => saveDiet({ avoid: [...diet.avoid, name] })}
          />
        </View>

        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={20} color={C.warnFg} />
          <Text style={styles.noticeText}>
            הסימון נשען על שמות המרכיבים במתכון, והוא עזר בלבד. באלרגיה חשוב לבדוק גם את רשימת
            הרכיבים שעל האריזה.
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.7}
          onPress={handlePrivacyPolicyPress}
        >
          <Ionicons name="document-text-outline" size={20} color={C.ink} />
          <Text style={styles.rowLabelFlex}>מדיניות פרטיות</Text>
          <Ionicons name="chevron-back" size={18} color={C.faint2} />
        </TouchableOpacity>
        {__DEV__ && (
          <TouchableOpacity
            style={[styles.row, styles.divider]}
            activeOpacity={0.7}
            onPress={loadSamples}
          >
            <Ionicons name="flask-outline" size={20} color={C.ink} />
            <Text style={styles.rowLabelFlex}>טעינת נתוני דוגמה (פיתוח)</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper },
  content: { padding: SCREEN_PAD, paddingBottom: 40, gap: 26 },
  section: { gap: 12 },
  title: { fontFamily: F.display700, fontSize: 21, color: C.ink },
  sub: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.muted },
  label: { fontFamily: F.semi, fontSize: 14, color: C.muted2, marginTop: 4 },
  presets: { flexDirection: "row", gap: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  block: { gap: 10, paddingVertical: 14, paddingHorizontal: 14 },
  divider: { borderTopWidth: 1, borderTopColor: C.line2 },
  rowLabel: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  rowLabelFlex: { flex: 1, fontFamily: F.medium, fontSize: 15, color: C.ink },
  rowSub: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: C.muted },
  preview: {
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.paper,
    gap: 4,
  },
  previewLabel: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  previewText: { fontFamily: F.body, fontSize: 15, lineHeight: 28, color: C.ink },
  addChip: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.faint2,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addChipText: { fontFamily: F.medium, fontSize: 13, color: C.ink },
  addField: {
    height: 34,
    minWidth: 150,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.accent,
    backgroundColor: C.card,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addInput: {
    flex: 1,
    padding: 0,
    fontFamily: F.body,
    fontSize: 14,
    color: C.ink,
    textAlign: "right",
  },
  removable: {
    height: 34,
    borderRadius: 17,
    backgroundColor: C.ink,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  removableText: { fontFamily: F.medium, fontSize: 13, color: C.white },
  notice: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: C.warnBg,
    borderRadius: 14,
    padding: 12,
    alignItems: "flex-start",
  },
  noticeText: { flex: 1, fontFamily: F.body, fontSize: 13, lineHeight: 19, color: C.warnFg },
});

export default SettingsScreen;
