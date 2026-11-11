import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import Constants from "expo-constants";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import {
  createStackNavigator,
  CardStyleInterpolators,
} from "@react-navigation/stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import {
  Heebo_400Regular,
  Heebo_500Medium,
  Heebo_600SemiBold,
  Heebo_700Bold,
  Heebo_900Black,
} from "@expo-google-fonts/heebo";
import { initDB } from "./util/database";
import { splitShared } from "./util/share";
import { loadShoppingList } from "./util/shopping";
import { loadMeals } from "./util/mealSettings";
import { I18nManager } from "react-native";
import EditRecipeScreen from "./screens/EditRecipeScreen";
import RecipeDetailScreen from "./screens/RecipeDetailScreen";
import CookingModeScreen from "./screens/CookingModeScreen";
import AddRecipeScreen from "./screens/AddRecipeScreen";
import AddCategoryScreen from "./screens/AddCategory/AddCategoryScreen";
import SettingsScreen from "./screens/SettingsScreen";
import MyTabs from "./components/MyTabs";
import { ToastProvider } from "./components/UI/kit";
import { C, F } from "./constants/theme";

I18nManager.forceRTL(true);
I18nManager.allowRTL(true);

// forceRTL is native-only; on web the direction comes from the document.
const RtlRoot = Platform.OS === "web" ? (props) => (
        <View dir="rtl" style={{ flex: 1, maxWidth: 430, marginLeft: "auto", marginRight: "auto" }} {...props} />
      ) : React.Fragment;
if (Platform.OS === "web") {
  document.documentElement.setAttribute("dir", "rtl");
  document.documentElement.setAttribute("lang", "he");
}

const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef();

// Expo Go has no native share module; only a development/production build does.
const SHARE_INTENT_OPTIONS = { disabled: Constants.appOwnership === "expo" || Platform.OS === "web" };

// Opens Add Recipe with whatever another app shared (a link, or text such as a caption).
function ShareHandler({ ready }) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  useEffect(() => {
    if (!ready || !hasShareIntent) return;
    // Keep the text that came with a link: for Instagram and TikTok it is often
    // the caption, which is where the recipe is written.
    const { url, text } = splitShared(shareIntent || {});
    if (url || text) {
      navigationRef.navigate("AddRecipe", { shared: { url, text }, at: Date.now() });
    }
    resetShareIntent();
  }, [ready, hasShareIntent, shareIntent, resetShareIntent]);
  return null;
}

const headerOptions = {
  headerStyle: { backgroundColor: C.paper, elevation: 0, shadowOpacity: 0 },
  headerTintColor: C.ink,
  headerTitleStyle: { fontFamily: F.display700, fontSize: 20 },
  headerTitleAlign: "center",
  headerBackButtonDisplayMode: "minimal",
  cardStyle: { backgroundColor: C.paper },
};

export default function App() {
  const [dbInitialized, setDbInitialized] = useState(false);
  const [navReady, setNavReady] = useState(false);
  const [fontsLoaded] = useFonts({
    Heebo_400Regular,
    Heebo_500Medium,
    Heebo_600SemiBold,
    Heebo_700Bold,
    Heebo_900Black,
  });

  useEffect(() => {
    async function loadResourcesAndDataAsync() {
      try {
        await initDB();
        // The browser preview uses an in-memory database, so start it with samples.
        if (Platform.OS === "web" && __DEV__) {
          const { seedSampleData } = await import("./util/devSeed");
          const { fetchAllRecipes } = await import("./util/database");
          if (!(await fetchAllRecipes())?.length) await seedSampleData();
        }
        await loadShoppingList(); // primes the cart badge
        await loadMeals();
        setDbInitialized(true);
      } catch (e) {
        console.warn("Application setup failed:", e);
      }
    }

    loadResourcesAndDataAsync();
  }, []);

  if (!dbInitialized || !fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: C.paper,
        }}
      >
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={{ marginTop: 10, color: C.muted }}>טוען...</Text>
      </View>
    );
  }

  return (
    <ShareIntentProvider options={SHARE_INTENT_OPTIONS}>
    <RtlRoot>
    <SafeAreaProvider>
      <ToastProvider>
        <StatusBar style="dark" />
        <NavigationContainer ref={navigationRef} onReady={() => setNavReady(true)}>
          <ShareHandler ready={navReady} />
          <Stack.Navigator
            initialRouteName="Home"
            screenOptions={headerOptions}
          >
            <Stack.Screen
              name="Home"
              component={MyTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="RecipeDisplay"
              component={RecipeDetailScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="CookingMode"
              component={CookingModeScreen}
              options={{
                headerShown: false,
                cardStyle: { backgroundColor: C.cookBg },
              }}
            />
            <Stack.Screen
              name="AddRecipe"
              component={AddRecipeScreen}
              options={{
                headerShown: false,
                presentation: "modal",
                cardStyleInterpolator:
                  CardStyleInterpolators.forModalPresentationIOS,
              }}
            />
            <Stack.Screen
              name="EditRecipe"
              component={EditRecipeScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="AddCategory"
              component={AddCategoryScreen}
              options={{ title: "קטגוריה חדשה" }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ title: "הגדרות" }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </ToastProvider>
    </SafeAreaProvider>
    </RtlRoot>
    </ShareIntentProvider>
  );
}
