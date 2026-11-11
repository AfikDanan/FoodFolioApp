import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ExpoImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fetchAllCategories,
  fetchRecipeById,
  updateRecipeWithCategories,
} from "../util/database";
import { Chip, RoundButton, Stepper } from "../components/UI/kit";
import getImageSource from "../util/image";
import {
  displayUnit,
  formatQty,
  hasPhoto,
  parseIngredientLine,
  parseIngredients,
  parseQty,
  parseSteps,
  stepsToObject,
} from "../util/recipeUtils";
import { C, F, SCREEN_PAD } from "../constants/theme";

const ingredientLine = (i) =>
  `${formatQty(parseQty(i.quantity))} ${displayUnit(parseQty(i.quantity), i.unit)} ${i.name}`
    .replace(/\s+/g, " ")
    .trim();

function EditRecipeScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { recipeId } = route.params;
  const [ready, setReady] = useState(false);
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState([]);
  const [original, setOriginal] = useState([]);
  const [form, setForm] = useState({
    title: "",
    totalTime: "",
    servings: 4,
    image: null,
    sourceUrl: "",
    ingredients: "",
    steps: "",
  });

  useEffect(() => {
    (async () => {
      const [recipe, cats] = await Promise.all([fetchRecipeById(recipeId), fetchAllCategories()]);
      if (!recipe) {
        navigation.goBack();
        return;
      }
      const ings = parseIngredients(recipe.ingredients);
      const names = recipe.categoryNames ? recipe.categoryNames.split(",") : [];
      setCategories(cats || []);
      setSelected((cats || []).filter((c) => names.includes(c.name)).map((c) => c.id));
      setOriginal(ings);
      setForm({
        title: recipe.title,
        totalTime: recipe.totalTime || "",
        servings: recipe.servings || 4,
        image: recipe.image,
        sourceUrl: recipe.source_url || "",
        ingredients: ings.map(ingredientLine).join("\n"),
        steps: parseSteps(recipe.instructions).join("\n"),
      });
      setReady(true);
    })();
  }, [recipeId, navigation]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const pickImage = async () => {
    const perm = await ExpoImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ExpoImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!result.canceled) set("image")(result.assets[0].uri);
  };

  const save = async () => {
    if (!form.title.trim()) {
      Alert.alert("", "נא להזין שם למתכון", [{ text: "אישור" }]);
      return;
    }
    // Lines that were not touched keep their stored quantity and department.
    const ingredients = form.ingredients
      .split("\n")
      .filter((l) => l.trim())
      .map((line) => original.find((o) => ingredientLine(o) === line.trim()) || parseIngredientLine(line))
      .filter((i) => i.name);
    const steps = form.steps.split("\n").filter((l) => l.trim());
    const ok = await updateRecipeWithCategories(
      recipeId,
      {
        title: form.title.trim(),
        ingredients: JSON.stringify(ingredients),
        instructions: JSON.stringify(stepsToObject(steps)),
        image: form.image,
        totalTime: form.totalTime.trim() || "לא צוין",
        servings: form.servings,
        sourceUrl: form.sourceUrl.trim() || null,
      },
      selected
    );
    if (!ok) {
      Alert.alert("", "השמירה נכשלה, נסו שוב.", [{ text: "אישור" }]);
      return;
    }
    navigation.reset({
      index: 1,
      routes: [{ name: "Home" }, { name: "RecipeDisplay", params: { recipeId } }],
    });
  };

  if (!ready) return <View style={styles.root} />;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>עריכת מתכון</Text>
        <RoundButton icon="close" onPress={() => navigation.goBack()} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity activeOpacity={0.85} style={styles.photo} onPress={pickImage}>
          {hasPhoto(form.image) ? (
            <Image
              source={getImageSource(form.image)}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <>
              <Ionicons name="image-outline" size={30} color={C.muted} />
              <Text style={styles.photoText}>הוספת תמונה</Text>
            </>
          )}
        </TouchableOpacity>

        <Field label="שם המתכון" value={form.title} onChangeText={set("title")} />
        <Field label="זמן כולל" value={form.totalTime} onChangeText={set("totalTime")} />
        <Field
          label="קישור למתכון המקורי"
          value={form.sourceUrl}
          onChangeText={set("sourceUrl")}
          placeholder="https://"
          url
        />
        <View style={styles.servingsRow}>
          <Text style={styles.label}>מנות</Text>
          <Stepper value={form.servings} onChange={set("servings")} />
        </View>

        <Text style={styles.label}>קטגוריות</Text>
        <View style={styles.wrap}>
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              on={selected.includes(c.id)}
              onPress={() =>
                setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))
              }
            />
          ))}
        </View>

        <Field
          label="מרכיבים, אחד בכל שורה"
          value={form.ingredients}
          height={160}
          onChangeText={set("ingredients")}
        />
        <Field
          label="אופן ההכנה, שלב בכל שורה"
          value={form.steps}
          height={180}
          onChangeText={set("steps")}
        />
      </ScrollView>

      <View style={[styles.ctaWrap, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity activeOpacity={0.9} style={styles.cta} onPress={save}>
          <Text style={styles.ctaText}>שמירה</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChangeText, height, placeholder, url }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.field, height ? { height, textAlignVertical: "top", paddingTop: 12 } : null]}
        value={value}
        onChangeText={onChangeText}
        multiline={!!height}
        placeholder={placeholder}
        placeholderTextColor={C.faint}
        {...(url ? { autoCapitalize: "none", autoCorrect: false, keyboardType: "url" } : null)}
      />
    </View>
  );
}

export default EditRecipeScreen;

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
  photo: {
    height: 180,
    borderRadius: 20,
    backgroundColor: C.chip,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#cfc8b9",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    overflow: "hidden",
  },
  photoText: { fontFamily: F.semi, fontSize: 14, color: C.muted },
  label: { fontFamily: F.display700, fontSize: 17, color: C.ink },
  servingsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
