import { createFalClient } from "@fal-ai/client";
import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { supabase } from "../../../../lib/supabase";
import {
  COMFY_FAL_MODEL,
  FAL_FLUX_2_BASE_MODEL,
  FAL_FLUX_2_LORA_MODEL,
  FAL_FLUX_IMG2IMG_MODEL,
  type GenerationModel,
} from "../../../fal-models";

type AppliedLora = {
  path: string;
  scale: number;
};

type GenerateRequest = {
  prompt?: string;
  negative_prompt?: string;
  image_size?: string | { width: number; height: number };
  num_images?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  output_format?: "jpeg" | "png";
  enable_safety_checker?: boolean;
  loras?: AppliedLora[];
  brand_id?: string;
  logo_only_branding?: boolean;
  model?: GenerationModel;
  workflow_id?: string;
  image_url?: string;
  strength?: number;
};

type FalImage = {
  url?: string;
  brandId?: string;
  brandedUrl?: string;
  cleanUrl?: string;
};

type FalComfyResult = {
  data?: {
    images?: FalImage[];
    image?: FalImage;
  };
  images?: FalImage[];
  image?: FalImage;
};

type ComfyQueuedResponse = {
  prompt_id?: string;
  error?: unknown;
};

type ComfyHistoryImage = {
  filename?: string;
  subfolder?: string;
  type?: string;
};

type ComfyHistory = Record<
  string,
  {
    outputs?: Record<string, { images?: ComfyHistoryImage[] }>;
    status?: { completed?: boolean };
  }
>;

const FALLBACK_SIZE = { width: 1024, height: 1024 };
const FAL_IMAGE_SIZE_NAMES = [
  "landscape_4_3",
  "landscape_16_9",
  "portrait_4_3",
  "portrait_16_9",
  "square",
  "square_hd",
] as const;
const SIZE_BY_NAME: Record<string, { width: number; height: number }> = {
  landscape_4_3: { width: 1024, height: 768 },
  landscape_16_9: { width: 1024, height: 576 },
  portrait_4_3: { width: 768, height: 1024 },
  portrait_16_9: { width: 576, height: 1024 },
  square: { width: 1024, height: 1024 },
  square_hd: { width: 1024, height: 1024 },
};
const LOCAL_WORKFLOW_PATH = path.join(process.cwd(), "fal-comfy", "workflow.json");
const BRAND_DIR = path.join(process.cwd(), "public", "brand");
const GENERATED_PUBLIC_DIR = path.join(process.cwd(), "public", "generated");
const CLEAN_PUBLIC_DIR = path.join(GENERATED_PUBLIC_DIR, "clean");
const BRANDED_PUBLIC_DIR = path.join(GENERATED_PUBLIC_DIR, "branded");
const POSITIVE_PROMPT_NODE = process.env.COMFY_POSITIVE_PROMPT_NODE ?? "6";
const NEGATIVE_PROMPT_NODE = process.env.COMFY_NEGATIVE_PROMPT_NODE ?? "7";
const LATENT_NODE = process.env.COMFY_LATENT_NODE ?? "5";
const SAMPLER_NODE = process.env.COMFY_SAMPLER_NODE ?? "13";
const STEPS_NODE = process.env.COMFY_STEPS_NODE ?? "22";
const ARTIFACT_GUARD =
  "clean edges, coherent geometry, refined details, no visual artifacts, no warped typography";
const NO_TEXT_GUARD =
  "no text, no letters, no words, no typography, no captions, no slogans, no logo, no watermark, blank neutral graphic areas only";

function withImagePromptGuards(prompt: string | undefined) {
  return [prompt?.trim() ?? "", NO_TEXT_GUARD, ARTIFACT_GUARD].filter(Boolean).join(", ");
}

function withNegativePromptGuards(prompt: string | undefined) {
  return [
    prompt?.trim() || "blurry, low quality",
    "text",
    "letters",
    "words",
    "typography",
    "caption",
    "slogan",
    "logo",
    "watermark",
    "signature",
    "poster text",
    "warped typography",
    "gibberish text",
  ].filter(Boolean).join(", ");
}

function getComfyLocalUrl() {
  return process.env.COMFY_LOCAL_URL?.replace(/\/$/, "");
}

function resolveSize(imageSize: GenerateRequest["image_size"]) {
  if (typeof imageSize === "string") {
    return SIZE_BY_NAME[imageSize] ?? FALLBACK_SIZE;
  }

  if (imageSize && typeof imageSize.width === "number" && typeof imageSize.height === "number") {
    return {
      height: Math.min(Math.max(Math.round(imageSize.height), 256), 2048),
      width: Math.min(Math.max(Math.round(imageSize.width), 256), 2048),
    };
  }

  return FALLBACK_SIZE;
}

function resolveFalImageSize(imageSize: GenerateRequest["image_size"]) {
  if (typeof imageSize === "string" && FAL_IMAGE_SIZE_NAMES.includes(imageSize as (typeof FAL_IMAGE_SIZE_NAMES)[number])) {
    return imageSize as (typeof FAL_IMAGE_SIZE_NAMES)[number];
  }

  if (imageSize && typeof imageSize !== "string") {
    return resolveSize(imageSize);
  }

  return "portrait_16_9";
}

function resolveDeliverySize(imageSize: GenerateRequest["image_size"]) {
  const sourceSize = resolveSize(imageSize);
  const ratio = sourceSize.width / sourceSize.height;

  if (Math.abs(ratio - 9 / 16) < 0.04) {
    return { width: 1080, height: 1920 };
  }

  if (Math.abs(ratio - 16 / 9) < 0.04) {
    return { width: 1920, height: 1080 };
  }

  if (Math.abs(ratio - 1) < 0.04) {
    return { width: 1536, height: 1536 };
  }

  if (ratio < 1) {
    return { width: Math.round(1440 * ratio), height: 1440 };
  }

  return { width: 1440, height: Math.round(1440 / ratio) };
}

function collectImages(result: FalComfyResult) {
  const data = result.data ?? result;
  const images = data.images ?? (data.image ? [data.image] : []);

  return images.flatMap((image) => (image.url ? [{ url: image.url }] : []));
}

function publicUrl(...parts: string[]) {
  return `/${parts.map((part) => encodeURIComponent(part)).join("/")}`;
}

async function applyFaceRestore(sourceBuffer: Buffer, key: string): Promise<Buffer> {
  try {
    const client = createFalClient({ credentials: key });
    const blob = new Blob([Uint8Array.from(sourceBuffer)], { type: "image/png" });
    const file = new File([blob], "source.png", { type: "image/png" });
    const uploadedUrl = await client.storage.upload(file);

    const result = (await client.subscribe("fal-ai/clarity-upscaler", {
      input: {
        image_url: uploadedUrl,
        prompt: "masterpiece, best quality, highres, sharp eyes, detailed face, clear pupils",
        upscale_factor: 1,
        creativity: 0.25,
        resemblance: 0.85,
        num_inference_steps: 18,
        enable_safety_checker: false,
      },
    })) as { data?: { image?: { url?: string } } };

    const restoredUrl = result.data?.image?.url;
    if (!restoredUrl) return sourceBuffer;

    const response = await fetch(restoredUrl, { cache: "no-store" });
    if (!response.ok) return sourceBuffer;

    return Buffer.from(await response.arrayBuffer());
  } catch {
    return sourceBuffer;
  }
}

async function prepareBrandOverlay(filePath: string, width: number, height: number) {
  return sharp(filePath)
    .resize({
      fit: "fill",
      height,
      width,
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}

async function maybePrepareBrandOverlay(filePath: string, width: number, height: number) {
  try {
    await access(filePath);
    return await prepareBrandOverlay(filePath, width, height);
  } catch {
    return null;
  }
}

function resolveBrandPaths(brandId: string | undefined) {
  const id = brandId?.trim() || "lisaa";
  const brandPath = path.join(BRAND_DIR, id);
  return {
    logoPath: path.join(brandPath, "logo.png"),
    taglinePath: path.join(brandPath, "tagline.png"),
  };
}

async function buildBrandComposites(width: number, height: number, brandId?: string, logoOnlyBranding = false) {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const bottomGradientHeight = Math.round(safeHeight * 0.46);
  const topGradientHeight = Math.round(safeHeight * 0.32);
  const { logoPath, taglinePath } = resolveBrandPaths(brandId);
  const [logoOverlay, taglineOverlay] = await Promise.all([
    maybePrepareBrandOverlay(logoPath, safeWidth, safeHeight),
    maybePrepareBrandOverlay(taglinePath, safeWidth, safeHeight),
  ]);

  if (logoOnlyBranding) {
    return logoOverlay ? [{ input: logoOverlay, left: 0, top: 0 }] : [];
  }

  const bottomGradient = Buffer.from(`
    <svg width="${safeWidth}" height="${bottomGradientHeight}" viewBox="0 0 ${safeWidth} ${bottomGradientHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bottomFade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#000000" stop-opacity="0"/>
          <stop offset="0.42" stop-color="#000000" stop-opacity="0.36"/>
          <stop offset="1" stop-color="#000000" stop-opacity="0.72"/>
        </linearGradient>
      </defs>
      <rect width="${safeWidth}" height="${bottomGradientHeight}" fill="url(#bottomFade)"/>
    </svg>
  `);
  const topGradient = Buffer.from(`
    <svg width="${safeWidth}" height="${topGradientHeight}" viewBox="0 0 ${safeWidth} ${topGradientHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="topFade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#000000" stop-opacity="0.62"/>
          <stop offset="0.55" stop-color="#000000" stop-opacity="0.28"/>
          <stop offset="1" stop-color="#000000" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="${safeWidth}" height="${topGradientHeight}" fill="url(#topFade)"/>
    </svg>
  `);

  return [
    {
      input: topGradient,
      left: 0,
      top: 0,
    },
    {
      input: bottomGradient,
      left: 0,
      top: safeHeight - bottomGradientHeight,
    },
    ...(logoOverlay ? [{ input: logoOverlay, left: 0, top: 0 }] : []),
    ...(taglineOverlay ? [{ input: taglineOverlay, left: 0, top: 0 }] : []),
  ];
}

async function upscaleForDelivery(sourceBuffer: Buffer, imageSize: GenerateRequest["image_size"]) {
  const deliverySize = resolveDeliverySize(imageSize);

  return sharp(sourceBuffer)
    .resize({
      fit: "cover",
      height: deliverySize.height,
      kernel: "mks2021",
      position: "attention",
      width: deliverySize.width,
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}

const IMAGES_PROXY = "/api/images";

async function persistImageSet(
  images: FalImage[],
  requestUrl: string,
  imageSize: GenerateRequest["image_size"],
  brandId?: string,
  logoOnlyBranding = false,
) {
  const falKey = process.env.FAL_KEY;
  const faceRestoreEnabled = process.env.FACE_RESTORE === "true";

  return Promise.all(
    images.map(async (image, index) => {
      if (!image.url) return image;

      const sourceUrl = new URL(image.url, requestUrl);
      const response = await fetch(sourceUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`Impossible de recuperer l'image generee (${response.status}).`);

      const rawBuffer = Buffer.from(await response.arrayBuffer());
      const sourceBuffer = faceRestoreEnabled && falKey ? await applyFaceRestore(rawBuffer, falKey) : rawBuffer;
      const deliveryBuffer = await upscaleForDelivery(sourceBuffer, imageSize);
      const metadata = await sharp(deliveryBuffer).metadata();
      const width = metadata.width ?? 1024;
      const height = metadata.height ?? 1024;
      const stamp = `${Date.now()}-${index + 1}`;
      const cleanFile = `styleforge-${stamp}.png`;
      const brandedFile = `styleforge-${stamp}.png`;

      const [cleanBuffer, brandedBuffer] = await Promise.all([
        sharp(deliveryBuffer).png().toBuffer(),
        sharp(deliveryBuffer).composite(await buildBrandComposites(width, height, brandId, logoOnlyBranding)).png().toBuffer(),
      ]);

      // Upload to Supabase (primary, works everywhere)
      const [cleanUpload, brandedUpload] = await Promise.all([
        supabase.storage.from("images").upload(`clean/${cleanFile}`, cleanBuffer, { contentType: "image/png", upsert: true }),
        supabase.storage.from("images").upload(`branded/${brandedFile}`, brandedBuffer, { contentType: "image/png", upsert: true }),
      ]);

      // Write to local disk (dev only, silent fail on Vercel)
      try {
        await Promise.all([
          mkdir(CLEAN_PUBLIC_DIR, { recursive: true }).then(() => sharp(cleanBuffer).png().toFile(path.join(CLEAN_PUBLIC_DIR, cleanFile))),
          mkdir(BRANDED_PUBLIC_DIR, { recursive: true }).then(() => sharp(brandedBuffer).png().toFile(path.join(BRANDED_PUBLIC_DIR, brandedFile))),
        ]);
      } catch {
        // read-only filesystem on Vercel — Supabase is the source of truth
      }

      // Prefer local URL (for atelier-overlay editor in dev), fallback to Supabase
      const localCleanUrl = publicUrl("generated", "clean", cleanFile);
      const localBrandedUrl = publicUrl("generated", "branded", brandedFile);
      const cleanUrl = cleanUpload.error ? localCleanUrl : `${IMAGES_PROXY}/clean/${cleanFile}`;
      const brandedUrl = brandedUpload.error ? localBrandedUrl : `${IMAGES_PROXY}/branded/${brandedFile}`;

      const placeholderBuffer = await sharp(deliveryBuffer)
        .resize({ width: 20, withoutEnlargement: true })
        .webp({ quality: 40 })
        .toBuffer();
      const placeholderUrl = `data:image/webp;base64,${placeholderBuffer.toString("base64")}`;

      return { ...image, brandId, brandedUrl, cleanUrl, placeholderUrl, url: brandedUrl };
    }),
  );
}

async function resolveImageBufferForImg2Img(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith("/api/images/")) {
    const storagePath = imageUrl.slice("/api/images/".length);
    const { data, error } = await supabase.storage.from("images").download(storagePath);
    if (error || !data) throw new Error("Impossible de télécharger l'image source depuis le stockage.");
    return Buffer.from(await data.arrayBuffer());
  }

  if (imageUrl.startsWith("/generated/")) {
    const filePath = path.join(process.cwd(), "public", imageUrl.slice(1));
    return readFile(filePath);
  }

  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Impossible de télécharger l'image source (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setNodeInput(workflow: Record<string, { inputs?: Record<string, unknown> }>, nodeId: string, key: string, value: unknown) {
  const inputs = workflow[nodeId]?.inputs;

  if (!inputs || !(key in inputs)) {
    return false;
  }

  inputs[key] = value;
  return true;
}

function setMappedInput(
  workflow: Record<string, { inputs?: Record<string, unknown> }>,
  nodeId: string,
  key: string,
  value: unknown,
) {
  if (setNodeInput(workflow, nodeId, key, value)) {
    return;
  }

  for (const node of Object.values(workflow)) {
    if (node.inputs && key in node.inputs) {
      node.inputs[key] = value;
    }
  }
}

async function loadWorkflowJson(workflowId?: string): Promise<Record<string, { inputs?: Record<string, unknown> }>> {
  if (workflowId) {
    const { data } = await supabase.from("comfy_workflows").select("workflow").eq("id", workflowId).single();
    if (data?.workflow) return data.workflow as Record<string, { inputs?: Record<string, unknown> }>;
  }

  const { data: active } = await supabase.from("comfy_workflows").select("workflow").eq("is_active", true).single();
  if (active?.workflow) return active.workflow as Record<string, { inputs?: Record<string, unknown> }>;

  return JSON.parse(await readFile(LOCAL_WORKFLOW_PATH, "utf8")) as Record<string, { inputs?: Record<string, unknown> }>;
}

async function buildLocalWorkflow(body: GenerateRequest) {
  const size = resolveSize(body.image_size);
  const prompt = withImagePromptGuards(body.prompt);
  const negativePrompt = withNegativePromptGuards(
    body.negative_prompt ?? "extra fingers, broken hands, distorted faces",
  );
  const workflow = await loadWorkflowJson(body.workflow_id);

  setMappedInput(workflow, POSITIVE_PROMPT_NODE, "text", prompt);
  setMappedInput(workflow, POSITIVE_PROMPT_NODE, "prompt", prompt);
  setMappedInput(workflow, NEGATIVE_PROMPT_NODE, "negative_prompt", negativePrompt);
  setMappedInput(workflow, LATENT_NODE, "width", size.width);
  setMappedInput(workflow, LATENT_NODE, "height", size.height);
  setMappedInput(workflow, LATENT_NODE, "batch_size", body.num_images ?? 1);
  setMappedInput(workflow, LATENT_NODE, "num_images", body.num_images ?? 1);
  setMappedInput(workflow, SAMPLER_NODE, "noise_seed", Math.floor(Math.random() * 2 ** 31));
  setMappedInput(workflow, SAMPLER_NODE, "seed", Math.floor(Math.random() * 2 ** 31));
  setMappedInput(workflow, SAMPLER_NODE, "cfg", body.guidance_scale ?? 3.5);
  setMappedInput(workflow, SAMPLER_NODE, "guidance_scale", body.guidance_scale ?? 3.5);
  setMappedInput(workflow, STEPS_NODE, "steps", body.num_inference_steps ?? 28);
  setMappedInput(workflow, STEPS_NODE, "num_inference_steps", body.num_inference_steps ?? 28);
  setMappedInput(workflow, STEPS_NODE, "output_format", body.output_format ?? "jpeg");

  const [firstLora, secondLora] = body.loras ?? [];
  setMappedInput(workflow, STEPS_NODE, "lora_path_1", firstLora?.path ?? "");
  setMappedInput(workflow, STEPS_NODE, "lora_scale_1", firstLora?.scale ?? 1);
  setMappedInput(workflow, STEPS_NODE, "lora_path_2", secondLora?.path ?? "");
  setMappedInput(workflow, STEPS_NODE, "lora_scale_2", secondLora?.scale ?? 1);

  return workflow;
}

async function fetchComfyJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `ComfyUI local a repondu ${response.status}${detail ? `: ${detail.slice(0, 1200)}` : ""}`,
    );
  }

  return (await response.json()) as T;
}

async function pollLocalHistory(localUrl: string, promptId: string) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const history = await fetchComfyJson<ComfyHistory>(`${localUrl}/history/${promptId}`);
    const item = history[promptId];

    if (item?.status?.completed) {
      return item;
    }

    await sleep(500);
  }

  throw new Error("ComfyUI local n'a pas termine la generation a temps.");
}

async function generateWithLocalComfy(localUrl: string, body: GenerateRequest) {
  const workflow = await buildLocalWorkflow(body);
  const queued = await fetchComfyJson<ComfyQueuedResponse>(`${localUrl}/prompt`, {
    body: JSON.stringify({
      client_id: crypto.randomUUID(),
      prompt: workflow,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!queued.prompt_id) {
    throw new Error(`ComfyUI local n'a pas retourne de prompt_id (${JSON.stringify(queued.error ?? queued)})`);
  }

  const history = await pollLocalHistory(localUrl, queued.prompt_id);
  const images = Object.values(history.outputs ?? {}).flatMap((output) =>
    (output.images ?? []).flatMap((image) => {
      if (!image.filename) {
        return [];
      }

      const params = new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder ?? "",
        type: image.type ?? "output",
      });

      return [{ url: `/api/comfy/view?${params.toString()}` }];
    }),
  );

  if (images.length === 0) {
    throw new Error("ComfyUI local n'a retourne aucune image exploitable.");
  }

  return images;
}

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateRequest;
  const requestUrl = request.url;
  const localUrl = getComfyLocalUrl();
  const key = process.env.FAL_KEY;

  if (body.image_url) {
    if (!key) {
      return Response.json({ message: "FAL_KEY n'est pas configuree cote serveur." }, { status: 503 });
    }

    try {
      const client = createFalClient({ credentials: key });
      const sourceBuffer = await resolveImageBufferForImg2Img(body.image_url);
      const file = new File([new Blob([new Uint8Array(sourceBuffer)], { type: "image/png" })], "source.png", { type: "image/png" });
      const uploadedSourceUrl = await client.storage.upload(file);
      const strength = body.strength ?? 0.95;
      const steps = body.num_inference_steps ?? 40;
      const guidanceScale = body.guidance_scale ?? 3.5;
      let img2imgRequestId = "";

      console.info("[img2img] starting fal generation", {
        guidance_scale: guidanceScale,
        model: FAL_FLUX_IMG2IMG_MODEL,
        promptLength: body.prompt?.length ?? 0,
        sourceBytes: sourceBuffer.byteLength,
        strength,
        steps,
      });

      const result = (await client.subscribe(FAL_FLUX_IMG2IMG_MODEL, {
        logs: true,
        onEnqueue: (requestId) => {
          img2imgRequestId = requestId;
          console.info("[img2img] enqueued", { requestId });
        },
        onQueueUpdate: (status) => {
          if (status.status === "IN_QUEUE") {
            console.info("[img2img] queued", { position: status.queue_position, requestId: status.request_id });
            return;
          }

          const lastLog = status.logs.at(-1)?.message;
          console.info("[img2img] status", {
            lastLog,
            requestId: status.request_id,
            status: status.status,
          });
        },
        input: {
          image_url: uploadedSourceUrl,
          prompt: withImagePromptGuards(body.prompt),
          strength,
          num_inference_steps: steps,
          guidance_scale: guidanceScale,
          num_images: 1,
          enable_safety_checker: body.enable_safety_checker ?? true,
        },
      })) as FalComfyResult;

      const images = collectImages(result);
      console.info("[img2img] completed", {
        imageCount: images.length,
        requestId: (result as { requestId?: string }).requestId ?? img2imgRequestId,
      });
      if (images.length === 0) {
        return Response.json({ message: "fal.ai n'a retourne aucune image pour l'img2img." }, { status: 502 });
      }

      const persistedImages = await persistImageSet(images, requestUrl, body.image_size, body.brand_id, body.logo_only_branding === true);
      return Response.json({ images: persistedImages });
    } catch (error) {
      const errBody = (error as Record<string, unknown>).body;
      console.error("img2img error", error, errBody ? JSON.stringify(errBody) : "");
      return Response.json(
        { message: error instanceof Error ? error.message : "Erreur inconnue pendant l'img2img." },
        { status: 502 },
      );
    }
  }

  const requestedModel =
    body.model ?? ((body.loras?.length ?? 0) > 0 ? FAL_FLUX_2_LORA_MODEL : FAL_FLUX_2_BASE_MODEL);

  if (requestedModel !== COMFY_FAL_MODEL) {
    if (!key) {
      return Response.json(
        {
          message: "FAL_KEY n'est pas configuree cote serveur.",
        },
        { status: 503 },
      );
    }

    const client = createFalClient({ credentials: key });

    try {
      const result = (await client.subscribe(requestedModel, {
        input: {
          enable_safety_checker: body.enable_safety_checker ?? true,
          guidance_scale: body.guidance_scale ?? 3.5,
          image_size: resolveFalImageSize(body.image_size),
          loras: requestedModel === FAL_FLUX_2_LORA_MODEL ? body.loras ?? [] : undefined,
          num_images: body.num_images ?? 1,
          num_inference_steps: body.num_inference_steps ?? 28,
          output_format: body.output_format ?? "jpeg",
          prompt: withImagePromptGuards(body.prompt),
        },
      })) as FalComfyResult;

      const images = collectImages(result);

      if (images.length === 0) {
        return Response.json(
          {
            message: "fal.ai n'a retourne aucune image exploitable.",
          },
          { status: 502 },
        );
      }

      const persistedImages = await persistImageSet(
        images,
        requestUrl,
        body.image_size,
        body.brand_id,
        body.logo_only_branding === true,
      );

      return Response.json({ images: persistedImages });
    } catch (error) {
      const body = (error as Record<string, unknown>).body;
      console.error("fal generation error", error, body ? JSON.stringify(body) : "");

      return Response.json(
        {
          message: error instanceof Error ? error.message : "Erreur inconnue pendant la generation fal.ai.",
        },
        { status: 502 },
      );
    }
  }

  if (localUrl) {
    try {
      const images = await generateWithLocalComfy(localUrl, body);
      const persistedImages = await persistImageSet(
        images,
        requestUrl,
        body.image_size,
        body.brand_id,
        body.logo_only_branding === true,
      );
      return Response.json({ images: persistedImages });
    } catch (error) {
      console.error("local comfy generation error", error);

      return Response.json(
        {
          message:
            error instanceof Error
              ? error.message
              : "Erreur inconnue pendant la generation Comfy locale.",
        },
        { status: 502 },
      );
    }
  }

  const endpoint = process.env.FAL_COMFY_ENDPOINT;
  if (!endpoint) {
    return Response.json(
      {
        message:
          "COMFY_LOCAL_URL n'est pas configure. Lance ComfyUI localement puis renseigne COMFY_LOCAL_URL, ou configure FAL_COMFY_ENDPOINT.",
      },
      { status: 503 },
    );
  }

  if (!key) {
    return Response.json(
      {
        message: "FAL_KEY n'est pas configuree cote serveur.",
      },
      { status: 503 },
    );
  }

  const size = resolveSize(body.image_size);
  const client = createFalClient({ credentials: key });

  try {
    const result = (await client.subscribe(endpoint, {
      input: {
        guidance_scale: body.guidance_scale ?? 3.5,
        height: size.height,
        loras: body.loras ?? [],
        negative_prompt: withNegativePromptGuards(body.negative_prompt),
        num_images: body.num_images ?? 1,
        num_inference_steps: body.num_inference_steps ?? 28,
        output_format: body.output_format ?? "jpeg",
        prompt: withImagePromptGuards(body.prompt),
        width: size.width,
      },
    })) as FalComfyResult;

    const images = collectImages(result);

    if (images.length === 0) {
      return Response.json(
        {
          message: "Le workflow Comfy n'a retourne aucune image exploitable.",
        },
        { status: 502 },
      );
    }

    const persistedImages = await persistImageSet(
      images,
      requestUrl,
      body.image_size,
      body.brand_id,
      body.logo_only_branding === true,
    );

    return Response.json({ images: persistedImages });
  } catch (error) {
    console.error("comfy fal generation error", error);

    return Response.json(
      {
        message: error instanceof Error ? error.message : "Erreur inconnue pendant la generation Comfy.",
      },
      { status: 502 },
    );
  }
}
