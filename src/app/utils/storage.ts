import {
  GENERATION_HISTORY_KEY,
  LORA_STORAGE_KEY,
  PROMPT_TEMPLATE_STORAGE_KEY,
} from "../constants";
import type { GenerationHistoryItem, PromptTemplate, SavedLora } from "../types";
import { migrateLoraUrl } from "./styles";

export function readSessionValue(key: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return sessionStorage.getItem(key) ?? "";
}

export function readSavedLoras() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(LORA_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }

    const loras = parsed as SavedLora[];
    const migrated = loras.map((lora) => ({ ...lora, url: migrateLoraUrl(lora.url) }));
    if (migrated.some((lora, index) => lora.url !== loras[index]?.url)) {
      localStorage.setItem(LORA_STORAGE_KEY, JSON.stringify(migrated));
    }
    return migrated;
  } catch {
    return [];
  }
}

export function readPromptTemplates() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(PROMPT_TEMPLATE_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as PromptTemplate[]) : [];
  } catch {
    return [];
  }
}

export function readGenerationHistory() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(GENERATION_HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as GenerationHistoryItem[]) : [];
  } catch {
    return [];
  }
}
