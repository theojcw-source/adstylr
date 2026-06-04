import {
  ARCHIVED_LORA_URLS,
  DEFAULT_STYLE_PROMPT,
  LORA_URL_REPLACEMENTS,
  PROMPT_TRIGGER_TOKEN,
} from "../constants";
import type { PromptTemplate, PublishedStyle } from "../types";
import { readTextProperty } from "./misc";

export function normalizeStyleKey(value: string) {
  return value.trim().toLowerCase();
}

export function migrateLoraUrl(url: string) {
  return LORA_URL_REPLACEMENTS.get(normalizeStyleKey(url)) ?? url;
}

export function normalizePublishedStyles(payload: unknown): PublishedStyle[] {
  const items = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { styles?: unknown }).styles)
      ? (payload as { styles: unknown[] }).styles
      : [];

  return items.flatMap((item, index) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const source = item as Record<string, unknown>;
    const name = readTextProperty(source, ["name", "title"]);
    const triggerWord = readTextProperty(source, ["triggerWord", "trigger_word", "trigger"]);
    const loraUrl = readTextProperty(source, ["loraUrl", "lora_url", "url"]);
    const prompt = readTextProperty(source, ["prompt", "basePrompt", "base_prompt"]);
    const school = readTextProperty(source, ["school", "organization", "organisation", "brand"]);
    const thumbnailUrl = readTextProperty(source, ["thumbnailUrl", "thumbnail_url", "thumbnail", "image"]);

    if (!name || !triggerWord || !loraUrl || ARCHIVED_LORA_URLS.has(normalizeStyleKey(loraUrl))) {
      return [];
    }

    return [
      {
        id: readTextProperty(source, ["id", "slug"]) || `${name}-${index}`,
        name,
        triggerWord,
        loraUrl,
        prompt,
        school,
        thumbnailUrl,
      },
    ];
  });
}

export function buildStylePrompt(style: PublishedStyle) {
  const cleanTriggerWord = style.triggerWord.trim().toUpperCase();
  const basePrompt = style.prompt.trim();

  return basePrompt.includes(cleanTriggerWord)
    ? basePrompt
    : `${cleanTriggerWord} ${basePrompt || DEFAULT_STYLE_PROMPT}`;
}

export function buildPromptFromTemplate(template: PromptTemplate, triggerWord: string) {
  return template.prompt.replaceAll(PROMPT_TRIGGER_TOKEN, triggerWord.trim().toUpperCase() || "STYLE");
}
