import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Sheet, Toggle } from "./UI/kit";
import { C, F } from "../constants/theme";

const OPTIONS = [
  ["quick", "ארוחות מהירות בימי חול", "עד 45 דקות מראשון עד חמישי"],
  ["norep", "בלי חזרות", "כל מתכון פעם אחת, כשאפשר"],
  ["veg", "צמחוני ודגים", "בלי בשר ועוף השבוע"],
  ["left", "שאריות מהערב לצהריים", "בישול אחד, שתי ארוחות"],
];

export const DEFAULT_FILL_OPTIONS = { quick: true, norep: true, veg: false, left: false };

// "✦ מילוי השבוע": toggles for how the week is filled, then one button.
function AutoFillSheet({
  visible,
  onClose,
  recipeCount,
  emptyCount,
  options,
  onChange,
  onGenerate,
  loading,
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ gap: 14 }}>
        <View style={{ gap: 4 }}>
          <Text style={styles.title}>✦ מילוי השבוע</Text>
          <Text style={styles.sub}>
            רק משבצות ריקות יתמלאו, ורק מתוך {recipeCount} המתכונים שלך. אפשר לבטל אחר כך.
          </Text>
        </View>
        <View style={styles.card}>
          {OPTIONS.map(([key, label, sub], i) => (
            <TouchableOpacity
              key={key}
              activeOpacity={0.7}
              style={[styles.row, i > 0 && styles.divider]}
              onPress={() => onChange({ ...options, [key]: !options[key] })}
            >
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={styles.rowLabel}>{label}</Text>
                <Text style={styles.rowSub}>{sub}</Text>
              </View>
              <Toggle on={options[key]} onPress={() => onChange({ ...options, [key]: !options[key] })} />
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          activeOpacity={0.9}
          disabled={loading || recipeCount === 0}
          style={[styles.cta, recipeCount === 0 && { opacity: 0.4 }]}
          onPress={onGenerate}
        >
          {loading && <ActivityIndicator size="small" color={C.white} />}
          <Text style={styles.ctaText}>
            {loading
              ? "בונה תוכנית…"
              : emptyCount > 0
                ? `מילוי ${emptyCount} משבצות`
                : "הצעה חדשה לשבוע"}
          </Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

export default AutoFillSheet;

const styles = StyleSheet.create({
  title: { fontFamily: F.display700, fontSize: 22, color: C.ink },
  sub: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.muted },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  divider: { borderTopWidth: 1, borderTopColor: C.line2 },
  rowLabel: { fontFamily: F.semi, fontSize: 15, color: C.ink },
  rowSub: { fontFamily: F.body, fontSize: 12, color: C.muted },
  cta: {
    height: 54,
    borderRadius: 16,
    backgroundColor: C.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  ctaText: { fontFamily: F.semi, fontSize: 16, color: C.white },
});
