import { supabase } from "@/lib/supabase";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const COPY_MAX_CHARS = 180;
const CTA_MAX_CHARS = 24;

type TextBlock = {
  fontSize?: number;
  hidden?: boolean;
  width?: number;
  x?: number;
  y?: number;
};

type RefineRequest = {
  copy?: string;
  cta?: string;
  imageUrl?: string;
  textConfig?: {
    cta?: TextBlock;
    headline?: TextBlock;
  };
};

type RefineDecision = {
  copy?: string;
  cta?: string;
  reason?: string;
  textConfig?: {
    cta?: TextBlock;
    headline?: TextBlock;
  };
};

type AnthropicTextBlock = {
  text?: string;
  type?: string;
};

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(Math.round(number), min), max);
}

function normalizeTextBlock(block: TextBlock | undefined, fallback: Required<Pick<TextBlock, "fontSize" | "width" | "x" | "y">>) {
  return {
    fontSize: clampNumber(block?.fontSize, fallback.fontSize, 18, 110),
    hidden: block?.hidden === true,
    width: clampNumber(block?.width, fallback.width, 180, 980),
    x: clampNumber(block?.x, fallback.x, 0, 980),
    y: clampNumber(block?.y, fallback.y, 0, 1536),
  };
}

function mediaTypeFromPath(storagePath: string) {
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

async function downloadFromStorage(storagePath: string) {
  const { data, error } = await supabase.storage.from("images").download(storagePath);
  if (error || !data) throw new Error("Impossible de lire le snapshot.");
  const buffer = Buffer.from(await data.arrayBuffer());
  return { data: buffer.toString("base64"), mediaType: mediaTypeFromPath(storagePath) };
}

async function imageToBase64(imageUrl: string, requestUrl: string) {
  if (imageUrl.startsWith("/api/images/")) {
    const storagePath = imageUrl.slice("/api/images/".length).split("?")[0] ?? "";
    return downloadFromStorage(storagePath);
  }

  const storageMarker = "/storage/v1/object/public/images/";
  const markerIdx = imageUrl.indexOf(storageMarker);
  if (markerIdx >= 0) {
    const storagePath = imageUrl.slice(markerIdx + storageMarker.length).split("?")[0] ?? "";
    return downloadFromStorage(storagePath);
  }

  const url = new URL(imageUrl, requestUrl);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Impossible de lire le snapshot (${response.status}).`);
  const mediaType = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { data: buffer.toString("base64"), mediaType };
}

function parseJson(text: string): RefineDecision {
  try {
    return JSON.parse(text) as RefineDecision;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]) as RefineDecision;
    } catch {
      return {};
    }
  }
}

function compactText(value: unknown, fallback: string, maxChars: number) {
  const text = (typeof value === "string" && value.trim() ? value : fallback).trim().replace(/\s+/g, " ");
  if (text.length <= maxChars) return text;

  const clipped = text.slice(0, maxChars + 1);
  const wordBoundary = clipped.lastIndexOf(" ");
  return clipped.slice(0, wordBoundary > maxChars * 0.6 ? wordBoundary : maxChars).trim().replace(/[,:;.!?]+$/, "");
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ message: "ANTHROPIC_API_KEY n'est pas configuree." }, { status: 503 });
  }

  const body = (await request.json()) as RefineRequest;
  if (!body.imageUrl) {
    return Response.json({ message: "imageUrl est requis." }, { status: 400 });
  }

  try {
    const image = await imageToBase64(body.imageUrl, request.url);
    const current = {
      copy: body.copy ?? "",
      cta: body.cta ?? "",
      textConfig: {
        cta: normalizeTextBlock(body.textConfig?.cta, { fontSize: 34, width: 440, x: 78, y: 1410 }),
        headline: normalizeTextBlock(body.textConfig?.headline, { fontSize: 70, width: 850, x: 78, y: 1180 }),
      },
    };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      body: JSON.stringify({
        max_tokens: 420,
        messages: [
          {
            content: [
              {
                source: {
                  data: image.data,
                  media_type: image.mediaType,
                  type: "base64",
                },
                type: "image",
              },
              {
                text: [
                  "Tu es directeur artistique senior pour des social ads Atelier de Sevres.",
                  "Regarde ce snapshot final: image + logo + copy + CTA.",
                  "Objectif: améliorer la lisibilité et le placement AVANT affichage dans l'app.",
                  "",
                  "Contraintes strictes:",
                  "- Ne refuse pas l'image.",
                  "- Ne change jamais la copy/headline: elle vient directement de l'OCR Claude Vision de la publicite concurrente.",
                  `- Copy/headline: renvoie exactement la copy actuelle, sans reformulation, sans correction marketing, jusqu'a ${COPY_MAX_CHARS} caracteres.`,
                  `- CTA: maximum 3 mots et ${CTA_MAX_CHARS} caracteres.`,
                  "- Tu peux raccourcir le CTA uniquement; pas la copy/headline.",
                  "- Tu peux déplacer headline/CTA, ajuster width et fontSize.",
                  "- Evite les zones visuellement chargées, les visages, les mains importantes, les bords.",
                  "- Garde le texte dans la zone sûre verticale: y entre 0 et 1536.",
                  "- Réponds uniquement en JSON valide.",
                  "",
                  `Etat actuel: ${JSON.stringify(current)}`,
                  "",
                  "JSON attendu:",
                  '{ "copy": "...", "cta": "...", "textConfig": { "headline": { "x": 78, "y": 1180, "width": 850, "fontSize": 70, "hidden": false }, "cta": { "x": 78, "y": 1410, "width": 440, "fontSize": 34, "hidden": false } }, "reason": "..." }',
                ].join("\n"),
                type: "text",
              },
            ],
            role: "user",
          },
        ],
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        system: "Tu corriges uniquement copy, CTA et placement typographique. Tu renvoies du JSON strict sans markdown.",
      }),
      headers: {
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      method: "POST",
    });

    const payload = await response.json();
    if (!response.ok) {
      return Response.json({ message: payload?.error?.message || "Claude Vision indisponible." }, { status: response.status });
    }

    const text = (payload.content || [])
      .map((block: AnthropicTextBlock) => (block.type === "text" ? block.text || "" : ""))
      .join("\n")
      .trim();
    const parsed = parseJson(text);

    return Response.json({
      copy: current.copy,
      cta: compactText(parsed.cta, current.cta, CTA_MAX_CHARS),
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      textConfig: {
        cta: normalizeTextBlock(parsed.textConfig?.cta, current.textConfig.cta),
        headline: normalizeTextBlock(parsed.textConfig?.headline, current.textConfig.headline),
      },
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Correction Claude impossible." },
      { status: 500 },
    );
  }
}
