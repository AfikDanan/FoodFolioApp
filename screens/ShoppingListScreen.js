import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  RoundButton,
  Checkbox,
  DepartmentIcon,
  QuantityStepper,
  useToast,
} from "../components/UI/kit";
import { departments } from "../constants/recipeConstants";
import {
  loadShoppingList,
  persistShoppingList,
  mergeItems,
  shoppingListToText,
} from "../util/shopping";
import {
  displayUnit,
  formatQty,
  parseIngredientLine,
  quantityStep,
  stepQuantity,
} from "../util/recipeUtils";
import { C, F, SCREEN_PAD } from "../constants/theme";

function ShoppingListScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");

  useFocusEffect(
    useCallback(() => {
      loadShoppingList().then(setItems);
    }, [])
  );

  const update = async (next) => {
    setItems(next);
    await persistShoppingList(next);
  };

  const groups = useMemo(
    () =>
      departments
        .map((d) => ({
          ...d,
          items: items
            .filter((i) => i.department === d.name)
            .sort((a, b) => Number(a.checked) - Number(b.checked)),
        }))
        .filter((g) => g.items.length > 0),
    [items]
  );

  const done = items.filter((i) => i.checked).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  const toggle = (item) =>
    update(items.map((i) => (i === item ? { ...i, checked: !i.checked } : i)));

  const addItem = async () => {
    const parsed = parseIngredientLine(text);
    if (!parsed.name) return;
    setText("");
    await update(mergeItems(items, [parsed]));
    toast(`${parsed.name} נוסף ל״${parsed.department}״`);
  };

  // + / - on a row. At the smallest amount the minus removes the item.
  const changeQty = (item, direction) => {
    const next = stepQuantity(item.quantity, item.unit, direction);
    if (next <= 0) {
      update(items.filter((i) => i !== item));
      toast(`${item.name} הוסר מהרשימה`);
      return;
    }
    update(items.map((i) => (i === item ? { ...i, quantity: next } : i)));
  };

  const clearChecked = () => {
    if (done === 0) {
      toast("אין פריטים מסומנים");
      return;
    }
    Alert.alert("מחיקת פריטים", "למחוק את המוצרים המסומנים?", [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחיקה",
        style: "destructive",
        onPress: () => update(items.filter((i) => !i.checked)),
      },
    ]);
  };

  // Plain text, so it lands in WhatsApp or Notes as a message instead of a file.
  const share = async () => {
    const message = shoppingListToText(items);
    if (!message) {
      Alert.alert(items.length ? "הכל כבר נאסף" : "הרשימה ריקה", "אין מוצרים לשיתוף");
      return;
    }
    try {
      await Share.share({ message });
    } catch (e) {
      console.error("Share failed", e);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 10 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>קניות</Text>
          <View style={styles.actions}>
            <RoundButton icon="share-outline" onPress={share} />
            <RoundButton icon="trash-outline" onPress={clearChecked} />
          </View>
        </View>

        {items.length > 0 && (
          <View style={{ gap: 8 }}>
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>
                נאספו {done} מתוך {items.length}
              </Text>
              <Text style={styles.progressText}>{pct}%</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct}%` }]} />
            </View>
          </View>
        )}

        <View>
          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              onSubmitEditing={addItem}
              placeholder="למשל: חלב 2 ליטר"
              placeholderTextColor={C.faint}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.addBtn} onPress={addItem} activeOpacity={0.85}>
              <Ionicons name="add" size={26} color={C.white} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>כמות, יחידה ומחלקה מזוהים אוטומטית</Text>
        </View>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>הרשימה ריקה</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Meal Plan")}>
              <Text style={styles.emptyLink}>ליצירה מתוך תכנון השבוע</Text>
            </TouchableOpacity>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.name} style={{ gap: 8 }}>
              <View style={styles.groupHeader}>
                <DepartmentIcon name={g.name} size={30} />
                <Text style={styles.deptName}>{g.name}</Text>
                <Text style={styles.deptCount}>
                  {g.items.filter((i) => !i.checked).length}
                </Text>
              </View>
              <View style={styles.card}>
                {g.items.map((item, idx) => (
                  <View
                    key={`${item.name}-${item.unit}-${idx}`}
                    style={[styles.itemRow, idx > 0 && styles.divider, item.checked && { opacity: 0.45 }]}
                  >
                    <Checkbox round={false} checked={item.checked} onPress={() => toggle(item)} />
                    <Text style={[styles.itemText, { flex: 1 }, item.checked && styles.struck]}>
                      {item.name}
                    </Text>
                    <QuantityStepper
                      label={[formatQty(item.quantity), displayUnit(item.quantity, item.unit, true)]
                        .filter(Boolean)
                        .join(" ")}
                      removeAtMin={item.quantity <= quantityStep(item.unit)}
                      onDec={() => changeQty(item, -1)}
                      onInc={() => changeQty(item, 1)}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

export default ShoppingListScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  content: { paddingHorizontal: SCREEN_PAD, paddingBottom: 28, gap: 18 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: F.display900, fontSize: 30, color: C.ink },
  actions: { flexDirection: "row", gap: 8 },
  progressRow: { flexDirection: "row", justifyContent: "space-between" },
  progressText: { fontFamily: F.medium, fontSize: 13, color: C.muted },
  track: { height: 6, borderRadius: 3, backgroundColor: C.chip, overflow: "hidden", alignItems: "flex-start" },
  fill: { height: 6, borderRadius: 3, backgroundColor: C.accent },
  addRow: { flexDirection: "row", gap: 10 },
  input: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 14,
    fontFamily: F.body,
    fontSize: 15,
    color: C.ink,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { fontFamily: F.body, fontSize: 12, color: C.muted, marginTop: 8 },
  empty: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyTitle: { fontFamily: F.display700, fontSize: 22, color: C.ink },
  emptyLink: { fontFamily: F.semi, fontSize: 14, color: C.accent },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  deptImg: { width: 30, height: 30, resizeMode: "contain" },
  deptName: { flex: 1, fontFamily: F.display700, fontSize: 17, color: C.ink },
  deptCount: { fontFamily: F.medium, fontSize: 13, color: C.muted },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  divider: { borderTopWidth: 1, borderTopColor: C.line2 },
  itemText: { fontFamily: F.medium, fontSize: 15, color: C.ink },
  struck: { textDecorationLine: "line-through" },
  source: { fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 2 },
});
