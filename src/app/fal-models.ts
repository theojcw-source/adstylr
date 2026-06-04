export const FAL_FLUX_2_TRAINER_MODEL = "fal-ai/flux-2-trainer-v2" as const;
export const FAL_FLUX_2_LORA_MODEL = "fal-ai/flux-2/lora" as const;
export const FAL_FLUX_2_BASE_MODEL = "fal-ai/flux-2" as const;
export const COMFY_FAL_MODEL = "comfy-fal" as const;
export const FAL_FLUX_IMG2IMG_MODEL = "fal-ai/flux/dev/image-to-image" as const;

export type GenerationModel =
  | typeof FAL_FLUX_2_LORA_MODEL
  | typeof FAL_FLUX_2_BASE_MODEL
  | typeof COMFY_FAL_MODEL;

export const FAL_TRAINING_REQUEST_ID_KEY = "fal_request_id";
export const FAL_SELECTED_LORA_URL_KEY = "fal_lora_url";
export const FAL_TRAINED_LORA_URL_KEY = "styleforge_trained_lora_url";
