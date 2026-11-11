import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fetchAllRecipesWithCategories,
  fetchAllCategories,
  deleteCategoryById,
} from "../util/database";
import { Segmented, Chip, RecipeImage, Checkbox } from "../components/UI/kit";
import { shareRecipes } from "../util/shareRecipes";
import getImageSource from "../util/image";
import { C, F, SCREEN_PAD } from "../constants/theme";
import {
  categoryList,
  hasPhoto,
  parseIngredients,
  parseJsonList,
  recipeTimeLabel,
  tintFor,
} from "../util/recipeUtils";

const DEFAULT_CATEGORY = "מועדפים";

function AllRecipesScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const searchRef = useRef(null);
  const [mode, setMode] = useState("all");
  const [recipes, setRecipes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState(null);
  const [tagFilter, setTagFilter] = useState(null);
  // Picking recipes to share as one PDF: null when not picking, else a Set of ids.
  const [picked, setPicked] = useState(null);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([
      fetchAllRecipesWithCategories(),
      fetchAllCategories(),
    ]);
    setRecipes(r || []);
    setCategories(c || []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Home's search box focuses the field here.
  const focusToken = route.params?.focusSearch;
  useEffect(() => {
    if (focusToken) {
      setMode("all");
      setTimeout(() => searchRef.current?.focus(), 250);
    }
  }, [focusToken]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      if (catFilter && !categoryList(r).includes(catFilter)) return false;
      if (tagFilter && !parseJsonList(r.tags).includes(tagFilter)) return false;
      if (!q) return true;
      if (r.title.toLowerCase().includes(q)) return true;
      if (parseJsonList(r.tags).some((t) => t.toLowerCase().includes(q))) return true;
      return parseIngredients(r.ingredients).some((i) =>
        String(i.name || "").toLowerCase().includes(q)
      );
    });
  }, [recipes, query, catFilter, tagFilter]);

  // Every tag, most used first (no cap: a missing tag cannot be filtered on).
  const allTags = useMemo(() => {
    const counts = {};
    for (const r of recipes) for (const t of parseJsonList(r.tags)) counts[t] = (counts[t] || 0) + 1;
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, "he"));
  }, [recipes]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const r of recipes) for (const c of categoryList(r)) counts[c] = (counts[c] || 0) + 1;
    return counts;
  }, [recipes]);

  const openCategory = (name) => {
    setCatFilter(name);
    setMode("all");
  };

  const togglePick = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allVisiblePicked = !!picked && filtered.length > 0 && filtered.every((r) => picked.has(r.id));

  const pickAllVisible = () =>
    setPicked(allVisiblePicked ? new Set() : new Set(filtered.map((r) => r.id)));

  const sharePicked = async () => {
    const rows = recipes.filter((r) => picked.has(r.id));
    if (!rows.length || sharing) return;
    // A whole category shared at once is titled after it.
    const wholeCategory =
      catFilter && rows.length === filtered.length && allVisiblePicked ? catFilter : undefined;
    setSharing(true);
    try {
      await shareRecipes(rows, { title: wholeCategory });
      setPicked(null);
    } finally {
      setSharing(false);
    }
  };

  const confirmDeleteCategory = (cat) => {
    if (cat.name === DEFAULT_CATEGORY) return;
    Alert.alert("מחיקת קטגוריה", `למחוק את ״${cat.name}״? המתכונים עצמם יישארו.`, [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחיקה",
        style: "destructive",
        onPress: async () => {
          await deleteCategoryById(cat.id);
          if (catFilter === cat.name) setCatFilter(null);
          load();
        },
      },
    ]);
  };

  const categoryTile = (cat) => {
    const inCat = recipes.filter((r) => categoryList(r).includes(cat.name));
    const cover = hasPhoto(cat.image) ? cat.image : inCat.find((r) => hasPhoto(r.image))?.image;
    return (
      <TouchableOpacity
        key={cat.id}
        activeOpacity={0.85}
        style={[styles.catTile, { backgroundColor: tintFor(cat.id, cat.name) }]}
        onPress={() => openCategory(cat.name)}
        onLongPress={() => confirmDeleteCategory(cat)}
      >
        {cover && (
          <Image
            source={getImageSource(cover)}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        )}
        <LinearGradient
          colors={["rgba(255,253,249,0)", "rgba(255,253,249,0.96)"]}
          locations={[0, 0.65]}
          style={styles.catFade}
        >
          <Text style={styles.catName} numberOfLines={1}>
            {cat.name}
          </Text>
          <Text style={styles.catCount}>{inCat.length} מתכונים</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 10 },
          picked && { paddingBottom: 110 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>המתכונים שלי</Text>
          {mode === "all" && recipes.length > 0 ? (
            <TouchableOpacity
              style={styles.pickToggle}
              onPress={() => setPicked(picked ? null : new Set())}
            >
              <Ionicons name={picked ? "close" : "share-outline"} size={16} color={C.ink} />
              <Text style={styles.pickToggleText}>{picked ? "ביטול" : "שיתוף כמה"}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.count}>{recipes.length} מתכונים</Text>
          )}
        </View>

        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            setPicked(null);
          }}
          options={[
            { key: "all", label: "כל המתכונים" },
            { key: "cats", label: "קטגוריות" },
          ]}
        />

        {mode === "all" ? (
          <>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={C.ink} />
              <TextInput
                ref={searchRef}
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                placeholder="שם מתכון, מרכיב או תגית"
                placeholderTextColor={C.faint}
                returnKeyType="search"
              />
            </View>

            {categories.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.bleed}
                contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, gap: 8 }}
              >
                <Chip
                  dark
                  on={!catFilter}
                  label={`הכל · ${recipes.length}`}
                  onPress={() => setCatFilter(null)}
                />
                {categories.map((c) => (
                  <Chip
                    key={c.id}
                    dark
                    on={catFilter === c.name}
                    label={`${c.name} · ${categoryCounts[c.name] || 0}`}
                    onPress={() => setCatFilter(catFilter === c.name ? null : c.name)}
                  />
                ))}
              </ScrollView>
            )}

            {allTags.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.bleed}
                contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, gap: 8 }}
              >
                {allTags.map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    on={tagFilter === t}
                    onPress={() => setTagFilter(tagFilter === t ? null : t)}
                  />
                ))}
              </ScrollView>
            )}

            {filtered.length === 0 ? (
              <Text style={styles.emptyText}>לא נמצאו מתכונים</Text>
            ) : (
              <View style={styles.grid}>
                {filtered.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    activeOpacity={0.85}
                    style={styles.card}
                    onPress={() =>
                      picked
                        ? togglePick(r.id)
                        : navigation.navigate("RecipeDisplay", { recipeId: r.id })
                    }
                  >
                    <RecipeImage
                      recipe={r}
                      style={[styles.cardImg, picked?.has(r.id) && styles.cardImgPicked]}
                    >
                      {!!picked && (
                        <View style={styles.pickBadge} pointerEvents="none">
                          <Checkbox checked={picked.has(r.id)} onPress={() => togglePick(r.id)} />
                        </View>
                      )}
                      {!!recipeTimeLabel(r) && (
                        <View style={styles.timePill}>
                          <Ionicons name="time-outline" size={13} color={C.ink} />
                          <Text style={styles.timeText}>{recipeTimeLabel(r)}</Text>
                        </View>
                      )}
                    </RecipeImage>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {r.title}
                    </Text>
                    {!!categoryList(r)[0] && (
                      <Text style={styles.cardCat}>{categoryList(r)[0]}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={styles.catGrid}>
            {categories.map(categoryTile)}
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.catTile, styles.catNew]}
              onPress={() => navigation.navigate("AddCategory")}
            >
              <Ionicons name="add" size={26} color={C.muted} />
              <Text style={styles.catNewText}>קטגוריה חדשה</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {!!picked && mode === "all" && (
        <View style={styles.pickBar}>
          <TouchableOpacity onPress={pickAllVisible} style={styles.pickAll}>
            <Text style={styles.pickAllText}>{allVisiblePicked ? "ניקוי" : "בחירת הכל"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.9}
            disabled={picked.size === 0 || sharing}
            style={[styles.pickShare, (picked.size === 0 || sharing) && { opacity: 0.4 }]}
            onPress={sharePicked}
          >
            <Ionicons name="document-text-outline" size={18} color={C.white} />
            <Text style={styles.pickShareText}>
              {sharing
                ? "מכין PDF…"
                : picked.size === 0
                  ? "בחרו מתכונים לשיתוף"
                  : `שיתוף ${picked.size} מתכונים כ-PDF`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default AllRecipesScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  content: { paddingHorizontal: SCREEN_PAD, paddingBottom: 28, gap: 14 },
  titleRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  title: { fontFamily: F.display900, fontSize: 30, color: C.ink },
  count: { fontFamily: F.medium, fontSize: 14, color: C.muted },
  pickToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  pickToggleText: { fontFamily: F.medium, fontSize: 14, color: C.ink },
  cardImgPicked: { borderWidth: 3, borderColor: C.accent },
  pickBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    padding: 3,
    borderRadius: 16,
    backgroundColor: "rgba(255,253,249,0.92)",
  },
  pickBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: SCREEN_PAD,
    paddingVertical: 12,
    backgroundColor: C.paper,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  pickAll: { paddingVertical: 10, paddingHorizontal: 4 },
  pickAllText: { fontFamily: F.semi, fontSize: 15, color: C.accent },
  pickShare: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.ink,
    borderRadius: 14,
    paddingVertical: 13,
  },
  pickShareText: { fontFamily: F.semi, fontSize: 15, color: C.white },
  searchBox: {
    height: 46,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    fontFamily: F.body,
    fontSize: 15,
    color: C.ink,
  },
  bleed: { marginHorizontal: -SCREEN_PAD, flexGrow: 0 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 18 },
  card: { width: "48%", gap: 6 },
  cardImg: { width: "100%", aspectRatio: 1 / 1.05, borderRadius: 18 },
  timePill: {
    position: "absolute",
    bottom: 8,
    end: 8,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 9,
    backgroundColor: "rgba(255,253,249,0.92)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timeText: { fontFamily: F.semi, fontSize: 12, color: C.ink },
  cardTitle: { fontFamily: F.semi, fontSize: 15, lineHeight: 19, color: C.ink },
  cardCat: { fontFamily: F.body, fontSize: 12, color: C.muted, marginTop: -3 },
  emptyText: { fontFamily: F.medium, fontSize: 15, color: C.muted, textAlign: "center", paddingVertical: 40 },
  catGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  catTile: { width: "48%", height: 150, borderRadius: 20, overflow: "hidden" },
  catFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 36,
  },
  catName: { fontFamily: F.display700, fontSize: 19, color: C.ink },
  catCount: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  catNew: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: C.line4,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  catNewText: { fontFamily: F.semi, fontSize: 14, color: C.muted },
});
