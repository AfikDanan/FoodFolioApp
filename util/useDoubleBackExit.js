import { useCallback, useRef } from "react";
import { BackHandler, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

export const EXIT_WINDOW_MS = 2000;

// Android: on the first screen, the first back press shows a note and a second
// one within EXIT_WINDOW_MS closes the app. Only active while the screen that
// calls it is focused, so back keeps working normally everywhere else (and an
// open sheet or modal still handles back on its own first).
export function useDoubleBackExit(onFirstPress) {
  const last = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return undefined;
      last.current = 0;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        const now = Date.now();
        if (now - last.current < EXIT_WINDOW_MS) {
          BackHandler.exitApp();
        } else {
          last.current = now;
          onFirstPress?.();
        }
        return true;
      });
      return () => sub.remove();
    }, [onFirstPress])
  );
}
