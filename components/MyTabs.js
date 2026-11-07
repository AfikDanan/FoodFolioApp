import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HomeScreen from "../screens/HomeScreen";
import AllRecipesScreen from "../screens/AllRecipesScreen";
import MealPlanningScreen from "../screens/MealPlanningScreen";
import ShoppingListScreen from "../screens/ShoppingListScreen";
import { useUncheckedCount } from "../util/shopping";
import { C, F } from "../constants/theme";

const Tab = createBottomTabNavigator();

const TABS = {
  "Home Screen": { label: "בית", icon: "home" },
  "All Recipes": { label: "מתכונים", icon: "book" },
  "Meal Plan": { label: "תכנון", icon: "calendar" },
  "Shopping List": { label: "קניות", icon: "cart" },
};

function TabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const badge = useUncheckedCount();

  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}
    >
      {state.routes.map((route, index) => {
        if (route.name === "Add") {
          return (
            <View key={route.key} style={styles.slot}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.addBtn}
                onPress={() => navigation.navigate("AddRecipe")}
              >
                <Ionicons name="add" size={28} color={C.white} />
              </TouchableOpacity>
            </View>
          );
        }
        const focused = state.index === index;
        const meta = TABS[route.name];
        const color = focused ? C.ink : C.faint;
        return (
          <TouchableOpacity
            key={route.key}
            style={styles.slot}
            activeOpacity={0.7}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
          >
            <View>
              <Ionicons
                name={focused ? meta.icon : `${meta.icon}-outline`}
                size={24}
                color={color}
              />
              {route.name === "Shopping List" && badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, { color }]}>{meta.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Placeholder() {
  return null;
}

function MyTabs() {
  return (
    <Tab.Navigator
      backBehavior="initialRoute"
      initialRouteName="Home Screen"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.paper } }}
    >
      <Tab.Screen name="Home Screen" component={HomeScreen} />
      <Tab.Screen name="All Recipes" component={AllRecipesScreen} />
      <Tab.Screen name="Add" component={Placeholder} />
      <Tab.Screen name="Meal Plan" component={MealPlanningScreen} />
      <Tab.Screen name="Shopping List" component={ShoppingListScreen} />
    </Tab.Navigator>
  );
}

export default MyTabs;

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: "rgba(250,248,243,0.97)",
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 8,
    paddingHorizontal: 10,
  },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minHeight: 52,
  },
  label: { fontFamily: F.semi, fontSize: 11 },
  addBtn: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 9,
    elevation: 6,
  },
  badge: {
    position: "absolute",
    top: -4,
    start: 14,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: C.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: C.white, fontFamily: F.bold, fontSize: 11 },
});
