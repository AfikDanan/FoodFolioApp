import React, { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { annotateStep } from "../util/stepQuantities";
import { usePrefs } from "../util/prefs";
import { C, F } from "../constants/theme";

/**
 * A cooking step with each ingredient's amount shown as a small pill right
 * after its name. Follows the "כמויות בתוך שלבי ההכנה" setting unless `show`
 * is passed. ingredients: [{ name, label }].
 */
export default function StepText({ text, ingredients, style, large, dark, show, numberOfLines }) {
  const prefs = usePrefs();
  const on = show ?? prefs.stepQuantities;
  const parts = useMemo(
    () => (on ? annotateStep(text, ingredients) : [String(text || "")]),
    [on, text, ingredients]
  );
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          p
        ) : (
          <View
            key={i}
            style={[
              styles.pill,
              // No gap before a comma or a full stop that follows the pill.
              /^[,.;:!?)]/.test(typeof parts[i + 1] === "string" ? parts[i + 1] : "") && { marginEnd: 0 },
              large ? styles.pillLarge : styles.pillSmall,
              { backgroundColor: dark ? "rgba(255,255,255,0.14)" : C.chip },
            ]}
          >
            <Text
              style={[
                large ? styles.textLarge : styles.textSmall,
                { color: dark ? C.cookFg : C.ink },
              ]}
            >
              {p.qty}
            </Text>
          </View>
        )
      )}
    </Text>
  );
}

// A view inside text sits on the text baseline on phones; nudge it down so the
// pill looks centered on the line.
const nudge = (px) => (Platform.OS === "web" ? null : { transform: [{ translateY: px }] });

const styles = StyleSheet.create({
  pill: { justifyContent: "center", marginHorizontal: 5 },
  pillSmall: { height: 22, borderRadius: 7, paddingHorizontal: 7, ...nudge(5) },
  pillLarge: { height: 28, borderRadius: 8, paddingHorizontal: 8, ...nudge(6) },
  textSmall: { fontFamily: F.semi, fontSize: 13, lineHeight: 18 },
  textLarge: { fontFamily: F.semi, fontSize: 16, lineHeight: 22 },
});
