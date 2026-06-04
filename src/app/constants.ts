import type {
  AspectRatio,
  Brand,
  CustomImageSize,
  PromptTemplate,
  PublishedStyle,
} from "./types";
import {
  COMFY_FAL_MODEL,
  FAL_FLUX_2_BASE_MODEL,
  FAL_FLUX_2_LORA_MODEL,
  type GenerationModel,
} from "./fal-models";
import type {
  AtelierOverlayConfig,
  AtelierOverlayGradientConfig,
  AtelierOverlayTextConfig,
} from "./components/AtelierOverlayEditor";

function normalizeConstantStyleKey(value: string) {
  return value.trim().toLowerCase();
}

export const ATELIER_BRAND_ID = "atelier-de-sevres";
export const DEFAULT_BRANDS: Brand[] = [
  { id: "lisaa", name: "LISAA" },
  { id: ATELIER_BRAND_ID, name: "Atelier de Sevres" },
  { id: "esgdefense", name: "ESG Defense" },
];

export const REPLICATE_TRAINING_ID_KEY = "replicate_training_id";
export const LORA_STORAGE_KEY = "styleforge_loras";
export const PROMPT_TEMPLATE_STORAGE_KEY = "styleforge_prompt_templates";
export const GENERATION_HISTORY_KEY = "styleforge_generation_history";
export const SELECTED_BRAND_STORAGE_KEY = "styleforge_selected_brand";
export const LORA_CATALOG_URL =
  "https://raw.githubusercontent.com/theojcw-source/styleforge-loras/main/loras.json";

export const GENERATION_MODELS: Array<{ label: string; value: GenerationModel; supportsLora: boolean }> = [
  { label: "Flux 2 Style", value: FAL_FLUX_2_LORA_MODEL, supportsLora: true },
  { label: "Flux 2 Base", value: FAL_FLUX_2_BASE_MODEL, supportsLora: false },
  { label: "Comfy (avancé)", value: COMFY_FAL_MODEL, supportsLora: true },
];

export const ASPECT_RATIO_OPTIONS: Array<{ label: string; value: AspectRatio }> = [
  { label: "Paysage 4:3", value: "landscape_4_3" },
  { label: "Portrait 4:3", value: "portrait_4_3" },
  { label: "Carre 1:1", value: "square" },
  { label: "Paysage 16:9", value: "landscape_16_9" },
  { label: "Portrait 9:16", value: "portrait_16_9" },
];

export const HD_IMAGE_SIZE_BY_RATIO: Record<AspectRatio, CustomImageSize | "square_hd"> = {
  landscape_4_3: { width: 1344, height: 1008 },
  portrait_4_3: { width: 1008, height: 1344 },
  square: "square_hd",
  landscape_16_9: { width: 1344, height: 768 },
  portrait_16_9: { width: 768, height: 1344 },
};

export const STANDARD_IMAGE_SIZE_BY_RATIO: Record<AspectRatio, CustomImageSize> = {
  landscape_4_3: { width: 1024, height: 768 },
  portrait_4_3: { width: 768, height: 1024 },
  square: { width: 512, height: 512 },
  landscape_16_9: { width: 1024, height: 576 },
  portrait_16_9: { width: 576, height: 1024 },
};

export const ATELIER_OVERLAY_DEFAULT_CONFIG: AtelierOverlayConfig = {
  atelierLogo: { assetId: "logo-original", scaleX: 1, scaleY: 1, x: 110, y: 210 },
  eventBlock: { assetId: "event-original", scaleX: 1, scaleY: 1, x: 78, y: 896 },
};

export const ATELIER_OVERLAY_DEFAULT_GRADIENTS: AtelierOverlayGradientConfig = {
  bottomOpacity: 1,
  topOpacity: 1,
};

export const ATELIER_OVERLAY_DEFAULT_TEXT_CONFIG: AtelierOverlayTextConfig = {
  headline: { fontSize: 70, width: 850, x: 78, y: 1180 },
  cta: { fontSize: 34, width: 440, x: 78, y: 1410 },
};

export const TRAINING_LABELS = [
  "Preparation des images",
  "Segmentation et captioning",
  "Entrainement du reseau",
  "Optimisation des weights",
  "Finalisation",
];

export const DEFAULT_STYLE_PROMPT =
  "architectural editorial poster, precise composition, refined materials";
export const PROMPT_TRIGGER_TOKEN = "{{TRIGGER}}";

export const LISAA_ARCHI_FLUX_1_URL =
  "https://github.com/theojcw-source/styleforge-loras/releases/download/loras-v1/lisaa-archi-v1.safetensors";
export const LISAA_ARCHI_FLUX_2_URL_PRIVATE =
  "https://github.com/theojcw-source/Styleforge/releases/download/lisaa-archi-flux-2/lisaa-archi-flux-2.safetensors";
export const LISAA_ARCHI_FLUX_2_URL =
  "https://github.com/theojcw-source/styleforge-loras/releases/download/loras-v1/lisaa-archi-flux-2.safetensors";
export const ESGDEFENSE_V1_URL =
  "https://github.com/theojcw-source/styleforge-loras/releases/download/loras-v1/esgdefense-v1.safetensors";
export const ATELIER_DE_SEVRES_FLUX_2_URL =
  "https://github.com/theojcw-source/styleforge-loras/releases/download/loras-v1/atelier-de-sevres-flux-2.safetensors";

export const ARCHIVED_PUBLISHED_STYLES: PublishedStyle[] = [
  {
    id: "lisaa-archi-v1",
    name: "LISAA archi v1",
    triggerWord: "LISAAARCHI",
    loraUrl: LISAA_ARCHI_FLUX_1_URL,
    thumbnailUrl:
      "https://raw.githubusercontent.com/theojcw-source/styleforge-loras/main/thumbnails/lisaa-archi-v1.jpg",
    prompt:
      "LISAAARCHI architectural exhibition poster, refined student project, editorial composition, precise materials, clean typography space",
  },
  {
    id: "fashion-photography-style-v2-flux-epoch-10",
    name: "Fashion Photography Style v2",
    triggerWord: "FASHIONPHOTO",
    loraUrl:
      "https://github.com/theojcw-source/styleforge-loras/releases/download/loras-v1/fashion-photography-style-v2-flux-epoch-10.safetensors",
    thumbnailUrl: "",
    prompt:
      "FASHIONPHOTO fashion editorial photography, studio lighting, refined styling, high-end magazine composition",
  },
  {
    id: "atelier-de-sevres-art-v1",
    name: "Atelier de Sevres art v1",
    triggerWord: "ATELIERSEVRESART",
    loraUrl:
      "https://github.com/theojcw-source/styleforge-loras/releases/download/loras-v1/atelier-de-sevres-art-v1.safetensors",
    thumbnailUrl: "",
    prompt:
      "ATELIERSEVRESART art school campaign poster, experimental student artwork, contemporary composition, gallery materials, clean typography space",
  },
];

export const ARCHIVED_LORA_URLS = new Set(
  ARCHIVED_PUBLISHED_STYLES.map((style) => normalizeConstantStyleKey(style.loraUrl)),
);

export const LORA_URL_REPLACEMENTS = new Map([
  [normalizeConstantStyleKey(LISAA_ARCHI_FLUX_1_URL), LISAA_ARCHI_FLUX_2_URL],
  [normalizeConstantStyleKey(LISAA_ARCHI_FLUX_2_URL_PRIVATE), LISAA_ARCHI_FLUX_2_URL],
]);

export const DEFAULT_PUBLISHED_STYLES: PublishedStyle[] = [
  {
    id: "lisaa-archi-flux-2",
    name: "LISAA archi Flux 2",
    school: "LISAA",
    triggerWord: "LISAAARCHI",
    loraUrl: LISAA_ARCHI_FLUX_2_URL,
    thumbnailUrl:
      "https://raw.githubusercontent.com/theojcw-source/styleforge-loras/main/thumbnails/lisaa-archi-v1.jpg",
    prompt:
      "LISAAARCHI architectural exhibition poster, refined student project, editorial composition, precise materials, clean typography space",
  },
  {
    id: "esgdefense-v1",
    name: "ESG Defense v1",
    school: "ESG Defense",
    triggerWord: "ESGDEFENSE",
    loraUrl: ESGDEFENSE_V1_URL,
    thumbnailUrl: "",
    prompt:
      "ESGDEFENSE editorial campaign poster, refined composition, clean typography space",
  },
  {
    id: "atelier-de-sevres-flux-2",
    name: "Atelier de Sevres Flux 2",
    school: "Atelier de Sevres",
    triggerWord: "ATELIERSEVRESART",
    loraUrl: ATELIER_DE_SEVRES_FLUX_2_URL,
    thumbnailUrl: "",
    prompt:
      "ATELIERSEVRESART art school campaign poster, experimental student artwork, contemporary composition, gallery materials, clean typography space",
  },
];

export const DEFAULT_PUBLISHED_STYLE = DEFAULT_PUBLISHED_STYLES[0];

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    category: "Affiche",
    id: "preset-open-day-poster",
    label: "Portes ouvertes",
    prompt:
      "{{TRIGGER}} open day campaign poster, contemporary school visual, strong composition, clean space for event typography",
  },
  {
    category: "Social",
    id: "preset-social-square",
    label: "Post social",
    prompt:
      "{{TRIGGER}} social media campaign visual, expressive student artwork, crisp editorial framing, high impact composition",
  },
  {
    category: "Editorial",
    id: "preset-editorial",
    label: "Editorial",
    prompt:
      "{{TRIGGER}} editorial campaign image, refined art direction, premium school branding, subtle depth, clean graphic layout",
  },
];
