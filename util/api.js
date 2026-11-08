import axios from "axios";
import { API_URL } from "../constants/config";
import { getInstallId } from "./database";

// code: "network" | "not-configured" | "rate-limited" | "no-recipe" | "no-caption" | "fetch-blocked" | "failed"
export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// POST JSON to the FoodFolio API and map failures to ApiError codes.
export async function apiPost(path, body) {
  if (!API_URL) throw new ApiError("not-configured", "EXPO_PUBLIC_API_URL is not set");
  try {
    const { data } = await axios.post(`${API_URL}${path}`, body, {
      headers: { "X-Install-Id": await getInstallId() },
      timeout: 28000,
    });
    return data;
  } catch (e) {
    const code = e.response?.data?.error?.code;
    if (code === "not_a_recipe") throw new ApiError("no-recipe", code);
    if (code === "no_caption") throw new ApiError("no-caption", code);
    if (code === "fetch_failed") throw new ApiError("fetch-blocked", code);
    if (code === "rate_limited" || e.response?.status === 429) {
      throw new ApiError("rate-limited", code);
    }
    throw new ApiError(e.response ? "failed" : "network", e.message);
  }
}
