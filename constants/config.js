// Base URL of the FoodFolio API (see Backend/template.yaml). Set it per build
// in .env / eas.json as EXPO_PUBLIC_API_URL, e.g. https://abc123.execute-api.eu-west-1.amazonaws.com
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");
