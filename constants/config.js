// Base URL of the FoodFolio API (see Backend/template.yaml). Set it per build
// in .env / eas.json as EXPO_PUBLIC_API_URL, e.g. https://abc123.execute-api.eu-west-1.amazonaws.com
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");

// Instagram hides captions from servers, so a failed Instagram import is retried by
// reading the post in a hidden WebView on the phone (components/CaptionReader.js).
// Set to false to switch the feature off without touching anything else; the WebView
// module is then never loaded.
export const READ_INSTAGRAM_IN_WEBVIEW = true;
