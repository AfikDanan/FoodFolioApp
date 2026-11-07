import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Chip, Toggle, useToast } from "../components/UI/kit";
import { ALL_MEALS } from "../util/planner";
import { MEAL_PRESETS, saveMeals, useMeals } from "../util/mealSettings";
import { seedSampleData } from "../util/devSeed";
import { C, F, SCREEN_PAD } from "../constants/theme";

const MEAL_INFO = {
  בוקר: ["ארוחת בוקר", ""],
  "ביניים 1": ["ביניים בוקר", "נשנוש או ארוחה קטנה לפני הצהריים"],
  צהריים: ["ארוחת צהריים", ""],
  "ביניים 2": ["ביניים אחה״צ", "נשנוש או ארוחה קטנה אחר הצהריים"],
  ערב: ["ארוחת ערב", ""],
};

const sameMeals = (a, b) => a.length === b.length && a.every((m, i) => m === b[i]);

const SettingsScreen = () => {
  const toast = useToast();
  const meals = useMeals();

  const toggleMeal = (meal) => {
    const next = meals.includes(meal) ? meals.filter((m) => m !== meal) : [...meals, meal];
    if (next.length === 0) {
      toast("נדרשת לפחות ארוחה אחת ביום");
      return;
    }
    saveMeals(next);
  };

  const handlePrivacyPolicyPress = () => {
    const url = "https://foodfolio.streamlit.app/";
    Linking.openURL(url).catch((err) => console.error("Couldn't load page", err));
  };

  const loadSamples = async () => {
    const { added } = await seedSampleData();
    toast(`נוספו ${added} מתכוני דוגמה`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
  content: { padding: SCREEN_PAD, gap: 22 },
  section: { gap: 12 },
  title: { fontFamily: F.display700, fontSize: 21, color: C.ink },
  sub: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.muted },
  presets: { flexDirection: "row", gap: 8 },
  card: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  divider: { borderTopWidth: 1, borderTopColor: C.line2 },
  rowLabel: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  rowLabelFlex: { flex: 1, fontFamily: F.medium, fontSize: 15, color: C.ink },
  rowSub: { fontFamily: F.body, fontSize: 12, color: C.muted },
});

export default SettingsScreen;
