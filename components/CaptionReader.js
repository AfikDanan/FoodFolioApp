import React, { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { CAPTION_SCRIPT } from "../util/captionScript";

// The ONLY file that imports react-native-webview. Instagram renders captions client
// side, so the backend cannot read them; this loads the public post in a hidden,
// logged-out WebView, lets the page script expand the caption, and hands the text back.
// Switched off with READ_INSTAGRAM_IN_WEBVIEW in constants/config.js.

const TIMEOUT_MS = 25000;
const MIN_CAPTION_CHARS = 40;

// Drop tracking params (igsh, utm, vrfl...) and any fragment.
export function cleanPostUrl(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

const isInstagram = (url) => /^https:\/\/([\w-]+\.)?instagram\.com(\/|$)/i.test(url || "");

// `onDone(text | null)` is called exactly once; null means "could not read it".
export default function CaptionReader({ url, onDone }) {
  const finished = useRef(false);
  const finish = (text) => {
    if (finished.current) return;
    finished.current = true;
    onDone(text);
  };

  useEffect(() => {
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMessage = (event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      const text = typeof msg.text === "string" ? msg.text.trim() : "";
      finish(msg.type === "caption" && text.length >= MIN_CAPTION_CHARS ? text : null);
    } catch {
      finish(null);
    }
  };

  return (
    <WebView
      source={{ uri: cleanPostUrl(url) }}
      style={styles.hidden}
      pointerEvents="none"
      incognito
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      injectedJavaScript={CAPTION_SCRIPT}
      onMessage={onMessage}
      onError={() => finish(null)}
      onHttpError={() => finish(null)}
      // Stay on instagram.com; never follow it to the app store or elsewhere.
      onShouldStartLoadWithRequest={(req) => isInstagram(req.url)}
    />
  );
}

// Must stay laid out at a real size for the page to render, but invisible and untouchable.
const styles = StyleSheet.create({
  hidden: { position: "absolute", top: 0, left: 0, width: 360, height: 640, opacity: 0 },
});
