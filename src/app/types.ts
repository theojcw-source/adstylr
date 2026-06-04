import type { GenerationModel } from "./fal-models";

export type TrainingBadge = "training" | "done" | "error";
export type WorkspaceMode = "home" | "lora" | "images" | "dora" | "briefs";
export type FalCreditsStatus = "loading" | "ready" | "error" | "unconfigured";

export type PreviewFile = {
  id: string;
  file: File;
  url: string;
};

export type FalStatus = {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  logs?: Array<{ message?: string }>;
};

export type TrainingResult = {
  config_file?: { url?: string };
  diffusers_lora_file?: { url?: string };
  lora_file?: { url?: string };
};

export type TrainingQueueResult = {
  data: TrainingResult;
};

export type GeneratedImage = {
  brandId?: string;
  brandingConfig?: unknown;
  brandedUrl?: string;
  cleanUrl?: string;
  id?: string;
  placeholderUrl?: string;
  thumbnailUrl?: string;
  url: string;
};

export type SavedLora = {
  id: string;
  name: string;
  triggerWord: string;
  url: string;
  createdAt: string;
  school: string;
};

export type PublishedStyle = {
  id: string;
  name: string;
  triggerWord: string;
  loraUrl: string;
  prompt: string;
  school?: string;
  thumbnailUrl: string;
};

export type LoraDraft = {
  name: string;
  school: string;
  triggerWord: string;
  url: string;
};

export type LoraMix = {
  id: string;
  url: string;
  scale: number;
};

export type AppliedLora = {
  path: string;
  scale: number;
};

export type ImageSizeName =
  | "landscape_4_3"
  | "portrait_4_3"
  | "square"
  | "square_hd"
  | "landscape_16_9"
  | "portrait_16_9";

export type CustomImageSize = { width: number; height: number };
export type OutputFormat = "jpeg" | "png";
export type AspectRatio = "landscape_4_3" | "portrait_4_3" | "square" | "landscape_16_9" | "portrait_16_9";
export type ResolutionMode = "standard" | "hd" | "custom";

export type DirectGenerationInput = {
  brand_id?: string;
  enable_safety_checker: boolean;
  guidance_scale: number;
  image_size: ImageSizeName | CustomImageSize;
  loras?: AppliedLora[];
  num_images: number;
  num_inference_steps: number;
  output_format: OutputFormat;
  prompt: string;
  workflow_id?: string;
};

export type ComfyWorkflow = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
};

export type GenerationHistoryItem = {
  id: string;
  url: string;
  brandId?: string;
  brandingConfig?: unknown;
  brandedUrl?: string;
  cleanUrl?: string;
  thumbnailUrl?: string;
  prompt: string;
  createdAt: string;
  hiddenAt?: string;
  model: GenerationModel;
  loras: AppliedLora[];
};

export type GenerationResult = {
  images?: GeneratedImage[];
};

export type ComfyGenerationResponse = {
  images?: GeneratedImage[];
  message?: string;
};

export type FalCreditsState = {
  status: FalCreditsStatus;
  balance?: number;
  currency?: string;
  message?: string;
  username?: string;
};

export type PromptTemplate = {
  id: string;
  label: string;
  category: string;
  prompt: string;
};

export type Brand = { id: string; name: string };

export type BriefStatus = "new" | "in_progress" | "done" | "archived";

export type CreativeBrief = {
  id: string;
  title: string;
  description?: string;
  clientName?: string;
  brandId?: string;
  assets?: unknown;
  metadata?: unknown;
  status: BriefStatus;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationStyleMatch = {
  brand: Brand;
  style: PublishedStyle | null;
};
