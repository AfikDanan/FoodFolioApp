import React, { useState } from "react";
import { View, Text, TextInput, Image, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ExpoImagePicker from "expo-image-picker";
import { insertCategory } from "../../util/database";
import { C, F, SCREEN_PAD } from "../../constants/theme";

const AddCategoryScreen = ({ navigation }) => {
  const [categoryName, setCategoryName] = useState("");
  const [categoryImage, setCategoryImage] = useState("");

  const pickImage = async () => {
    const perm = await ExpoImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ExpoImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!result.canceled) setCategoryImage(result.assets[0].uri);
  };

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      Alert.alert("שגיאה", "נא להזין שם קטגוריה", [{ text: "אישור" }]);
      return;
    }

    try {
      const { success } = await insertCategory(categoryName, categoryImage);
      if (success) {
        navigation.goBack();
      } else {
        console.log("Failed to add category");
      }
    } catch (error) {
      console.error("Error saving category:", error);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        value={categoryName}
        placeholder="שם קטגוריה"
        placeholderTextColor={C.faint}
        onChangeText={setCategoryName}
        style={styles.input}
      />
      <TouchableOpacity activeOpacity={0.85} style={styles.photo} onPress={pickImage}>
        {categoryImage ? (
          <Image source={{ uri: categoryImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <>
            <Ionicons name="image-outline" size={30} color={C.muted} />
            <Text style={styles.photoText}>תמונה (לא חובה)</Text>
          </>
        )}
      </TouchableOpacity>
      <TouchableOpacity activeOpacity={0.9} style={styles.button} onPress={handleSaveCategory}>
        <Text style={styles.buttonText}>שמור</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.paper, padding: SCREEN_PAD, gap: 16 },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    paddingHorizontal: 14,
    fontFamily: F.body,
    fontSize: 16,
    color: C.ink,
  },
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
  button: {
    height: 54,
    borderRadius: 16,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontFamily: F.semi, fontSize: 16, color: C.white },
});

export default AddCategoryScreen;
