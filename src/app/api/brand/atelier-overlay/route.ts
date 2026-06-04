import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ATELIER_ASSET_BY_ID, type AtelierAssetId } from "../../../atelierAssets";
import { supabase } from "../../../../lib/supabase";

const IMAGES_PROXY = "/api/images";

const BRAND_DIR = path.join(process.cwd(), "public", "brand", "atelier-de-sevres");
const ASSET_DIR = path.join(BRAND_DIR, "assets");
const FONT_PATH = path.join(BRAND_DIR, "fonts", "AtelierdeSevres-Rg.ttf");
const GENERATED_DIR = path.join(process.cwd(), "public", "generated");
const CLEAN_GENERATED_DIR = path.join(GENERATED_DIR, "clean");
const BRANDED_GENERATED_DIR = path.join(GENERATED_DIR, "branded");
const PREVIEW_GENERATED_DIR = path.join(GENERATED_DIR, "previews");
const CONFIG_PATH = path.join(BRAND_DIR, "overlay-config.json");
const SVG_PATH = path.join(BRAND_DIR, "overlay-editable.svg");
const LOGO_PATH = path.join(BRAND_DIR, "logo.png");
const TAGLINE_PATH = path.join(BRAND_DIR, "tagline.png");
const STORAGE_CONFIG_PATH = "brand/atelier-de-sevres/overlay-config.json";

type OverlayBlockId = "atelierLogo" | "eventBlock";
type OverlayPosition = {
  assetId?: AtelierAssetId;
  hidden?: boolean;
  scaleX: number;
  scaleY: number;
  shadowBlur?: number;
  shadowEnabled?: boolean;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  x: number;
  y: number;
};
type OverlayConfig = Record<OverlayBlockId, OverlayPosition>;
type GradientConfig = { bottomOpacity: number; topOpacity: number };
type OverlayTextBlockId = "headline" | "cta";
type OverlayTextPosition = {
  backgroundColor?: string;
  color?: string;
  fontSize: number;
  hidden?: boolean;
  lineHeight?: number;
  shadowBlur?: number;
  shadowColor?: string;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  textAlign?: "left" | "center" | "right";
  uppercase?: boolean;
  width: number;
  x: number;
  y: number;
};
type OverlayTextConfig = Record<OverlayTextBlockId, OverlayTextPosition>;
type OverlayTextContent = { cta?: string; headline?: string };
type ImageTransform = { scale: number; x: number; y: number };
type ColorBlockLayer = {
  color: string;
  height: number;
  hidden?: boolean;
  id: string;
  opacity?: number;
  radius?: number;
  width: number;
  x: number;
  y: number;
};
type StoredConfig = { blocks: OverlayConfig; gradients: GradientConfig };
type OverlayPayload = Partial<OverlayConfig> & Partial<StoredConfig> & {
  colorBlocks?: ColorBlockLayer[];
  imageTransform?: ImageTransform;
  imageUrl?: string;
  text?: OverlayTextContent;
  textConfig?: OverlayTextConfig;
};

const DEFAULT_LOGO_ASSET_ID = "logo-original";
const DEFAULT_EVENT_ASSET_ID = "event-original";
const DEFAULT_CONFIG: OverlayConfig = {
  atelierLogo: { assetId: DEFAULT_LOGO_ASSET_ID, scaleX: 1, scaleY: 1, x: 110, y: 210 },
  eventBlock: { assetId: DEFAULT_EVENT_ASSET_ID, scaleX: 1, scaleY: 1, x: 78, y: 896 },
};
const DEFAULT_GRADIENTS: GradientConfig = {
  bottomOpacity: 1,
  topOpacity: 1,
};
const DEFAULT_TEXT_CONFIG: OverlayTextConfig = {
  headline: { fontSize: 70, width: 850, x: 78, y: 1180 },
  cta: { fontSize: 34, width: 440, x: 78, y: 1410 },
};

function clampCoordinate(value: unknown, min: number, max: number) {
  return Math.min(Math.max(Math.round(typeof value === "number" ? value : min), min), max);
}

function clampScale(value: unknown) {
  const scale = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return Math.min(Math.max(scale, 0.2), 3);
}

function clampOpacity(value: unknown) {
  const opacity = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return Math.min(Math.max(opacity, 0), 1.6);
}

function normalizeHidden(value: unknown) {
  return value === true;
}

function clampTextWidth(value: unknown) {
  const width = typeof value === "number" && Number.isFinite(value) ? value : 420;
  return Math.min(Math.max(Math.round(width), 180), 980);
}

function clampFontSize(value: unknown, fallback: number) {
  const fontSize = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(Math.round(fontSize), 18), 120);
}

function clampShadowBlur(value: unknown, fallback: number) {
  const blur = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(Math.round(blur), 0), 48);
}

function clampShadowOffset(value: unknown, fallback: number) {
  const offset = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(Math.round(offset), -20), 40);
}

function normalizeShadowOpacity(value: unknown, fallback: number) {
  const opacity = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(opacity, 0), 1);
}

function clampLayerSize(value: unknown, fallback: number) {
  const size = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(Math.round(size), 12), 1400);
}

function clampRadius(value: unknown) {
  const radius = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(Math.max(Math.round(radius), 0), 120);
}

function normalizeColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
}

function normalizeTextColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function normalizeLineHeight(value: unknown, fallback: number) {
  const lineHeight = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(lineHeight, 0.75), 1.8);
}

function normalizeTextAlign(value: unknown, fallback: "left" | "center" | "right") {
  return value === "left" || value === "center" || value === "right" ? value : fallback;
}

function normalizeImageTransform(source: unknown): ImageTransform {
  const partial = source && typeof source === "object" ? source as Partial<ImageTransform> : {};
  const scale = typeof partial.scale === "number" && Number.isFinite(partial.scale) ? partial.scale : 1;
  return {
    scale: Math.min(Math.max(scale, 1), 1.6),
    x: clampCoordinate(partial.x ?? 0, -1080, 1080),
    y: clampCoordinate(partial.y ?? 0, -1920, 1920),
  };
}

function normalizeColorBlocks(source: unknown): ColorBlockLayer[] {
  if (!Array.isArray(source)) return [];
  return source.slice(0, 12).map((item, index) => {
    const partial = item && typeof item === "object" ? item as Partial<ColorBlockLayer> : {};
    return {
      color: normalizeColor(partial.color),
      height: clampLayerSize(partial.height, 240),
      hidden: partial.hidden === true,
      id: typeof partial.id === "string" ? partial.id : `color-${index}`,
      opacity: normalizeShadowOpacity(partial.opacity, 1),
      radius: clampRadius(partial.radius),
      width: clampLayerSize(partial.width, 240),
      x: clampCoordinate(partial.x ?? 80, -200, 1080),
      y: clampCoordinate(partial.y ?? 80, -200, 1920),
    };
  });
}

function normalizeAssetId(value: unknown, fallback: AtelierAssetId) {
  return typeof value === "string" && value in ATELIER_ASSET_BY_ID ? value as AtelierAssetId : fallback;
}

function normalizeConfig(source: unknown): OverlayConfig {
  const partial =
    source && typeof source === "object"
      ? source as Partial<Record<OverlayBlockId, Partial<OverlayPosition>>>
      : {};

  return {
    atelierLogo: {
      hidden: normalizeHidden(partial.atelierLogo?.hidden),
      assetId: normalizeAssetId(partial.atelierLogo?.assetId, DEFAULT_LOGO_ASSET_ID),
      scaleX: clampScale(partial.atelierLogo?.scaleX ?? DEFAULT_CONFIG.atelierLogo.scaleX),
      scaleY: clampScale(partial.atelierLogo?.scaleY ?? DEFAULT_CONFIG.atelierLogo.scaleY),
      shadowBlur: clampShadowBlur(partial.atelierLogo?.shadowBlur, 36),
      shadowEnabled: partial.atelierLogo?.shadowEnabled === true,
      shadowOffsetY: clampShadowOffset(partial.atelierLogo?.shadowOffsetY, 18),
      shadowOpacity: normalizeShadowOpacity(partial.atelierLogo?.shadowOpacity, 0.32),
      x: clampCoordinate(partial.atelierLogo?.x ?? DEFAULT_CONFIG.atelierLogo.x, -260, 420),
      y: clampCoordinate(partial.atelierLogo?.y ?? DEFAULT_CONFIG.atelierLogo.y, -80, 760),
    },
    eventBlock: {
      hidden: normalizeHidden(partial.eventBlock?.hidden),
      assetId: normalizeAssetId(partial.eventBlock?.assetId, DEFAULT_EVENT_ASSET_ID),
      scaleX: clampScale(partial.eventBlock?.scaleX ?? DEFAULT_CONFIG.eventBlock.scaleX),
      scaleY: clampScale(partial.eventBlock?.scaleY ?? DEFAULT_CONFIG.eventBlock.scaleY),
      shadowBlur: clampShadowBlur(partial.eventBlock?.shadowBlur, 36),
      shadowEnabled: partial.eventBlock?.shadowEnabled === true,
      shadowOffsetY: clampShadowOffset(partial.eventBlock?.shadowOffsetY, 18),
      shadowOpacity: normalizeShadowOpacity(partial.eventBlock?.shadowOpacity, 0.32),
      x: clampCoordinate(partial.eventBlock?.x ?? DEFAULT_CONFIG.eventBlock.x, 0, 520),
      y: clampCoordinate(partial.eventBlock?.y ?? DEFAULT_CONFIG.eventBlock.y, 520, 1600),
    },
  };
}

function normalizeGradients(source: unknown): GradientConfig {
  const partial = source && typeof source === "object" ? source as Partial<GradientConfig> : {};

  return {
    bottomOpacity: clampOpacity(partial.bottomOpacity ?? DEFAULT_GRADIENTS.bottomOpacity),
    topOpacity: clampOpacity(partial.topOpacity ?? DEFAULT_GRADIENTS.topOpacity),
  };
}

function normalizeTextConfig(source: unknown): OverlayTextConfig {
  const partial =
    source && typeof source === "object"
      ? source as Partial<Record<OverlayTextBlockId, Partial<OverlayTextPosition>>>
      : {};

  return {
    headline: {
      backgroundColor: normalizeTextColor(partial.headline?.backgroundColor, "transparent"),
      color: normalizeTextColor(partial.headline?.color, "#f1f0f0"),
      fontSize: clampFontSize(partial.headline?.fontSize, DEFAULT_TEXT_CONFIG.headline.fontSize),
      hidden: normalizeHidden(partial.headline?.hidden),
      lineHeight: normalizeLineHeight(partial.headline?.lineHeight, 0.96),
      shadowBlur: clampShadowBlur(partial.headline?.shadowBlur, 12),
      shadowColor: typeof partial.headline?.shadowColor === "string" ? partial.headline.shadowColor : "#000000",
      shadowOffsetY: clampShadowOffset(partial.headline?.shadowOffsetY, 8),
      shadowOpacity: normalizeShadowOpacity(partial.headline?.shadowOpacity, 0.45),
      textAlign: normalizeTextAlign(partial.headline?.textAlign, "left"),
      uppercase: partial.headline?.uppercase !== false,
      width: clampTextWidth(partial.headline?.width ?? DEFAULT_TEXT_CONFIG.headline.width),
      x: clampCoordinate(partial.headline?.x ?? DEFAULT_TEXT_CONFIG.headline.x, 0, 980),
      y: clampCoordinate(partial.headline?.y ?? DEFAULT_TEXT_CONFIG.headline.y, 0, 1536),
    },
    cta: {
      backgroundColor: normalizeTextColor(partial.cta?.backgroundColor, "#f1f0f0"),
      color: normalizeTextColor(partial.cta?.color, "#111111"),
      fontSize: clampFontSize(partial.cta?.fontSize, DEFAULT_TEXT_CONFIG.cta.fontSize),
      hidden: normalizeHidden(partial.cta?.hidden),
      lineHeight: normalizeLineHeight(partial.cta?.lineHeight, 1),
      shadowBlur: clampShadowBlur(partial.cta?.shadowBlur, 0),
      shadowColor: typeof partial.cta?.shadowColor === "string" ? partial.cta.shadowColor : "#000000",
      shadowOffsetY: clampShadowOffset(partial.cta?.shadowOffsetY, 0),
      shadowOpacity: normalizeShadowOpacity(partial.cta?.shadowOpacity, 0),
      textAlign: normalizeTextAlign(partial.cta?.textAlign, "center"),
      uppercase: partial.cta?.uppercase !== false,
      width: clampTextWidth(partial.cta?.width ?? DEFAULT_TEXT_CONFIG.cta.width),
      x: clampCoordinate(partial.cta?.x ?? DEFAULT_TEXT_CONFIG.cta.x, 0, 980),
      y: clampCoordinate(partial.cta?.y ?? DEFAULT_TEXT_CONFIG.cta.y, 0, 1536),
    },
  };
}

async function readConfig() {
  try {
    const { data, error } = await supabase.storage.from("images").download(STORAGE_CONFIG_PATH);
    if (!error && data) {
      const parsed = JSON.parse(await data.text()) as Partial<StoredConfig> | Partial<OverlayConfig>;
      return {
        blocks: normalizeConfig("blocks" in parsed ? parsed.blocks : parsed),
        gradients: normalizeGradients("gradients" in parsed ? parsed.gradients : DEFAULT_GRADIENTS),
      };
    }
  } catch {
    // Fallback to the bundled config below.
  }

  try {
    const parsed = JSON.parse(await readFile(CONFIG_PATH, "utf8")) as Partial<StoredConfig> | Partial<OverlayConfig>;
    return {
      blocks: normalizeConfig("blocks" in parsed ? parsed.blocks : parsed),
      gradients: normalizeGradients("gradients" in parsed ? parsed.gradients : DEFAULT_GRADIENTS),
    };
  } catch {
    return { blocks: DEFAULT_CONFIG, gradients: DEFAULT_GRADIENTS };
  }
}

function renderEditableSvg(config: OverlayConfig) {
  return `<svg width="1080" height="1920" viewBox="0 0 1080 1920" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Exact Figma-derived assets. Move groups by changing translate(x y), then save in the app. -->
  <g id="atelier-logo" transform="translate(${config.atelierLogo.x} ${config.atelierLogo.y}) scale(${config.atelierLogo.scaleX} ${config.atelierLogo.scaleY})">
    <image href="assets/${getAsset(config.atelierLogo, "logo-original").file}" width="${getAsset(config.atelierLogo, "logo-original").width}" height="${getAsset(config.atelierLogo, "logo-original").height}"/>
  </g>
  <g id="event-block" transform="translate(${config.eventBlock.x} ${config.eventBlock.y}) scale(${config.eventBlock.scaleX} ${config.eventBlock.scaleY})">
    <image href="assets/${getAsset(config.eventBlock, "event-original").file}" width="${getAsset(config.eventBlock, "event-original").width}" height="${getAsset(config.eventBlock, "event-original").height}"/>
  </g>
</svg>
`;
}

function getAsset(block: OverlayPosition, fallback: AtelierAssetId) {
  return ATELIER_ASSET_BY_ID[block.assetId ?? fallback] ?? ATELIER_ASSET_BY_ID[fallback];
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function estimateWrappedLineCount(value: string, width: number, fontSize: number) {
  const paragraphs = value.trim().split(/\r?\n/);
  if (paragraphs.length === 0 || !value.trim()) return 1;

  const averageCharWidth = fontSize * 0.58;
  const maxChars = Math.max(4, Math.floor(width / averageCharWidth));
  let lines = 0;

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines += 1;
      continue;
    }
    lines += 1;
    let current = 0;

    for (const word of words) {
      const wordLength = word.length;
      if (current === 0) {
        current = wordLength;
        continue;
      }

      if (current + 1 + wordLength > maxChars) {
        lines += 1;
        current = wordLength;
      } else {
        current += 1 + wordLength;
      }
    }
  }

  return lines;
}

async function buildSharpTextBuffer(value: string, fontSize: number, width: number, color: string, align: "left" | "center" | "right" = "left", uppercase = true) {
  const renderedValue = uppercase ? value.toUpperCase() : value;
  return sharp({
    text: {
      align,
      dpi: 72,
      font: `Atelier de Sevres ${Math.round(fontSize)}`,
      fontfile: FONT_PATH,
      rgba: true,
      text: `<span foreground="${color}">${escapeXml(renderedValue)}</span>`,
      width,
    },
  })
    .png()
    .toBuffer();
}

async function buildTextShadowBuffer(textBuffer: Buffer, config: OverlayTextPosition, scaleY: number) {
  const blur = config.shadowBlur ?? 0;
  const opacity = config.shadowOpacity ?? 0;
  if (blur <= 0 || opacity <= 0) return null;

  const metadata = await sharp(textBuffer).metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const blurPx = Math.max(0, blur * scaleY);
  const padding = Math.ceil(blurPx * 2);
  const paddedWidth = width + padding * 2;
  const paddedHeight = height + padding * 2;
  const paddedText = await sharp({
    create: {
      width: paddedWidth,
      height: paddedHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: textBuffer, left: padding, top: padding }])
    .png()
    .toBuffer();
  const alpha = await sharp(paddedText)
    .ensureAlpha()
    .extractChannel("alpha")
    .blur(blurPx)
    .linear(Math.min(Math.max(opacity, 0), 1), 0)
    .raw()
    .toBuffer();

  return {
    buffer: await sharp({
      create: {
        width: paddedWidth,
        height: paddedHeight,
        channels: 3,
        background: config.shadowColor ?? "#000000",
      },
    })
      .joinChannel(alpha, {
        raw: {
          width: paddedWidth,
          height: paddedHeight,
          channels: 1,
        },
      })
      .png()
      .toBuffer(),
    padding,
  };
}

async function buildTextLayerBuffer(text: OverlayTextContent, textConfig: OverlayTextConfig, width: number, height: number) {
  const scaleX = width / 1080;
  const scaleY = height / 1920;
  const headline = textConfig.headline.hidden ? "" : (text.headline ?? "").trim();
  const cta = textConfig.cta.hidden ? "" : (text.cta ?? "").trim();
  if (!headline && !cta) return null;

  const headlineConfig = textConfig.headline;
  const ctaConfig = textConfig.cta;
  const headlineFontSize = headlineConfig.fontSize * scaleY;
  const ctaFontSize = ctaConfig.fontSize * scaleY;
  const ctaPadding = 12 * scaleY;
  const ctaRenderedText = ctaConfig.uppercase === false ? cta : cta.toUpperCase();
  const ctaLineCount = estimateWrappedLineCount(ctaRenderedText, Math.max(1, ctaConfig.width * scaleX - ctaPadding * 2), ctaFontSize);
  const ctaHeight = ctaLineCount * ctaFontSize * 1.15 + ctaPadding * 2;
  const composites: sharp.OverlayOptions[] = [];

  if (headline) {
    const headlineBuffer = await buildSharpTextBuffer(
      headline,
      headlineFontSize,
      Math.round(headlineConfig.width * scaleX),
      headlineConfig.color ?? "#f1f0f0",
      headlineConfig.textAlign ?? "left",
      headlineConfig.uppercase ?? true,
    );
    const headlineShadow = await buildTextShadowBuffer(headlineBuffer, headlineConfig, scaleY);
    const headlineLeft = Math.round(headlineConfig.x * scaleX);
    const headlineTop = Math.round(headlineConfig.y * scaleY);
    if (headlineShadow) {
      const shadowMetadata = await sharp(headlineShadow.buffer).metadata();
      const shadowWidth = shadowMetadata.width ?? width;
      const shadowHeight = shadowMetadata.height ?? height;
      composites.push({
        input: headlineShadow.buffer,
        left: clampOverlayPosition(headlineLeft - headlineShadow.padding, shadowWidth, width),
        top: clampOverlayPosition(headlineTop + Math.round((headlineConfig.shadowOffsetY ?? 8) * scaleY) - headlineShadow.padding, shadowHeight, height),
      });
    }
    composites.push({ input: headlineBuffer, left: headlineLeft, top: headlineTop });
  }

  if (cta) {
    const ctaWidth = Math.round(ctaConfig.width * scaleX);
    const ctaInnerWidth = Math.max(1, Math.round(ctaWidth - ctaPadding * 2));
    const ctaLeft = Math.round(ctaConfig.x * scaleX);
    const ctaTop = Math.round(ctaConfig.y * scaleY);
    const ctaRect = Buffer.from(`
      <svg width="${ctaWidth}" height="${ctaHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" rx="${4 * scaleX}" fill="${ctaConfig.backgroundColor ?? "#f1f0f0"}" fill-opacity="0.95"/>
      </svg>
    `);
    const ctaBuffer = await buildSharpTextBuffer(
      cta,
      ctaFontSize,
      ctaInnerWidth,
      ctaConfig.color ?? "#111111",
      ctaConfig.textAlign ?? "center",
      ctaConfig.uppercase ?? true,
    );
    const ctaMetadata = await sharp(ctaBuffer).metadata();
    const ctaTextHeight = ctaMetadata.height ?? ctaFontSize;
    composites.push({ input: ctaRect, left: ctaLeft, top: ctaTop });
    composites.push({
      input: ctaBuffer,
      left: ctaLeft + Math.round(ctaPadding),
      top: ctaTop + Math.max(0, Math.round((ctaHeight - ctaTextHeight) / 2)),
    });
  }

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

async function buildAssetBuffer(asset: ReturnType<typeof getAsset>, block: OverlayPosition, scaleX: number, scaleY: number) {
  return sharp(path.join(ASSET_DIR, asset.file))
    .resize({
      width: Math.round(asset.width * block.scaleX * scaleX),
      height: Math.round(asset.height * block.scaleY * scaleY),
      fit: "fill",
    })
    .png()
    .toBuffer();
}

async function buildShadowBuffer(assetBuffer: Buffer, block: OverlayPosition) {
  if (!block.shadowEnabled || (block.shadowBlur ?? 0) <= 0 || (block.shadowOpacity ?? 0) <= 0) return null;

  const metadata = await sharp(assetBuffer).metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const blur = Math.max(0, block.shadowBlur ?? 36);
  const opacity = Math.min(Math.max(block.shadowOpacity ?? 0.32, 0), 1);
  const padding = Math.ceil(blur * 2);
  const paddedWidth = width + padding * 2;
  const paddedHeight = height + padding * 2;
  const paddedAsset = await sharp({
    create: {
      width: paddedWidth,
      height: paddedHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: assetBuffer, left: padding, top: padding }])
    .png()
    .toBuffer();
  const alpha = await sharp(paddedAsset)
    .ensureAlpha()
    .extractChannel("alpha")
    .blur(blur)
    .linear(opacity, 0)
    .raw()
    .toBuffer();

  return {
    buffer: await sharp({
      create: {
        width: paddedWidth,
        height: paddedHeight,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .joinChannel(alpha, {
        raw: {
          width: paddedWidth,
          height: paddedHeight,
          channels: 1,
        },
      })
      .png()
      .toBuffer(),
    padding,
  };
}

function clampOverlayPosition(value: number, overlaySize: number, canvasSize: number) {
  return Math.min(Math.max(0, value), Math.max(0, canvasSize - overlaySize));
}

async function buildOverlayBuffer(config: OverlayConfig, width = 1080, height = 1920, text?: OverlayTextContent, textConfig?: OverlayTextConfig, colorBlocks: ColorBlockLayer[] = []) {
  const scaleX = width / 1080;
  const scaleY = height / 1920;
  const logoAsset = getAsset(config.atelierLogo, "logo-original");
  const eventAsset = getAsset(config.eventBlock, "event-original");
  const logo = config.atelierLogo.hidden ? null : await buildAssetBuffer(logoAsset, config.atelierLogo, scaleX, scaleY);
  const eventBlock = config.eventBlock.hidden ? null : await buildAssetBuffer(eventAsset, config.eventBlock, scaleX, scaleY);

  const composites: sharp.OverlayOptions[] = [];
  for (const layer of colorBlocks) {
    if (layer.hidden) continue;
    const input = Buffer.from(`
      <svg width="${Math.round(layer.width * scaleX)}" height="${Math.round(layer.height * scaleY)}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" rx="${Math.round((layer.radius ?? 0) * scaleX)}" fill="${layer.color}" fill-opacity="${layer.opacity ?? 1}"/>
      </svg>
    `);
    composites.push({
      input,
      left: clampOverlayPosition(Math.round(layer.x * scaleX), Math.round(layer.width * scaleX), width),
      top: clampOverlayPosition(Math.round(layer.y * scaleY), Math.round(layer.height * scaleY), height),
    });
  }
  if (logo) {
    const shadow = await buildShadowBuffer(logo, config.atelierLogo);
    if (shadow) {
      const shadowMetadata = await sharp(shadow.buffer).metadata();
      const shadowWidth = shadowMetadata.width ?? width;
      const shadowHeight = shadowMetadata.height ?? height;
      composites.push({
        input: shadow.buffer,
        left: clampOverlayPosition(Math.round(config.atelierLogo.x * scaleX) - shadow.padding, shadowWidth, width),
        top: clampOverlayPosition(Math.round(config.atelierLogo.y * scaleY + (config.atelierLogo.shadowOffsetY ?? 18) * scaleY) - shadow.padding, shadowHeight, height),
      });
    }
    composites.push({
      input: logo,
      left: Math.round(config.atelierLogo.x * scaleX),
      top: Math.round(config.atelierLogo.y * scaleY),
    });
  }
  if (eventBlock) {
    const shadow = await buildShadowBuffer(eventBlock, config.eventBlock);
    if (shadow) {
      const shadowMetadata = await sharp(shadow.buffer).metadata();
      const shadowWidth = shadowMetadata.width ?? width;
      const shadowHeight = shadowMetadata.height ?? height;
      composites.push({
        input: shadow.buffer,
        left: clampOverlayPosition(Math.round(config.eventBlock.x * scaleX) - shadow.padding, shadowWidth, width),
        top: clampOverlayPosition(Math.round(config.eventBlock.y * scaleY + (config.eventBlock.shadowOffsetY ?? 18) * scaleY) - shadow.padding, shadowHeight, height),
      });
    }
    composites.push({
      input: eventBlock,
      left: Math.round(config.eventBlock.x * scaleX),
      top: Math.round(config.eventBlock.y * scaleY),
    });
  }
  const textLayer = text && textConfig ? await buildTextLayerBuffer(text, textConfig, width, height) : null;
  if (textLayer) {
    composites.push({ input: textLayer, left: 0, top: 0 });
  }

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

async function renderOverlay(config: StoredConfig) {
  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  await supabase.storage
    .from("images")
    .upload(STORAGE_CONFIG_PATH, Buffer.from(serialized), {
      contentType: "application/json",
      upsert: true,
    });

  try {
    await mkdir(BRAND_DIR, { recursive: true });
    await writeFile(CONFIG_PATH, serialized);
    await writeFile(SVG_PATH, renderEditableSvg(config.blocks));
    await sharp(await buildOverlayBuffer(config.blocks)).png().toFile(LOGO_PATH);
    await sharp({
      create: {
        width: 1080,
        height: 1920,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).png().toFile(TAGLINE_PATH);
  } catch (error) {
    console.warn("atelier overlay local write skipped", error);
  }
}

function publicUrl(...parts: string[]) {
  return `/${parts.map((part) => encodeURIComponent(part)).join("/")}`;
}

async function fetchCleanImageBuffer(imageUrl: unknown): Promise<Buffer | null> {
  if (typeof imageUrl !== "string") return null;

  // Proxy URL: /api/images/clean/file.png → download from storage directly (avoid HTTP round-trip)
  if (imageUrl.startsWith("/api/images/")) {
    const storagePath = imageUrl.slice("/api/images/".length).split("?")[0] ?? "";
    try {
      const { data, error } = await supabase.storage.from("images").download(storagePath);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    } catch {
      return null;
    }
  }

  // Absolute URL (legacy Supabase public URL or any CDN) — fetch directly
  if (imageUrl.startsWith("http")) {
    try {
      const res = await fetch(imageUrl, { cache: "no-store" });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  // Relative local path — read from disk
  if (imageUrl.startsWith("/generated/clean/")) {
    const fileName = path.basename(decodeURIComponent(imageUrl.split("?")[0] ?? ""));
    if (!fileName.endsWith(".png")) return null;
    try {
      return await readFile(path.join(CLEAN_GENERATED_DIR, fileName));
    } catch {
      return null;
    }
  }

  return null;
}

function buildGradient(width: number, height: number, position: "top" | "bottom", gradients: GradientConfig) {
  const gradientHeight = Math.round(height * (position === "top" ? 0.32 : 0.46));
  const opacity = position === "top" ? gradients.topOpacity : gradients.bottomOpacity;
  const stops = position === "top"
    ? `<stop offset="0" stop-color="#000000" stop-opacity="${0.62 * opacity}"/>
       <stop offset="0.55" stop-color="#000000" stop-opacity="${0.28 * opacity}"/>
       <stop offset="1" stop-color="#000000" stop-opacity="0"/>`
    : `<stop offset="0" stop-color="#000000" stop-opacity="0"/>
       <stop offset="0.42" stop-color="#000000" stop-opacity="${0.36 * opacity}"/>
       <stop offset="1" stop-color="#000000" stop-opacity="${0.72 * opacity}"/>`;

  return {
    buffer: Buffer.from(`
      <svg width="${width}" height="${gradientHeight}" viewBox="0 0 ${width} ${gradientHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="fade" x1="0" x2="0" y1="0" y2="1">${stops}</linearGradient>
        </defs>
        <rect width="${width}" height="${gradientHeight}" fill="url(#fade)"/>
      </svg>
    `),
    top: position === "top" ? 0 : height - gradientHeight,
  };
}

async function transformCleanImageBuffer(cleanBuffer: Buffer, width: number, height: number, imageTransform: ImageTransform) {
  if (imageTransform.scale <= 1 && imageTransform.x === 0 && imageTransform.y === 0) return cleanBuffer;

  const scaledWidth = Math.round(width * imageTransform.scale);
  const scaledHeight = Math.round(height * imageTransform.scale);
  const rawLeft = Math.round(imageTransform.x * (width / 1080));
  const rawTop = Math.round(imageTransform.y * (height / 1920));
  const left = Math.min(0, Math.max(width - scaledWidth, rawLeft));
  const top = Math.min(0, Math.max(height - scaledHeight, rawTop));
  return sharp(cleanBuffer)
    .resize({ fit: "cover", height: scaledHeight, width: scaledWidth })
    .extract({ height, left: Math.abs(left), top: Math.abs(top), width })
    .png()
    .toBuffer();
}

async function renderBrandedImage(config: StoredConfig, imageUrl: unknown, text?: OverlayTextContent, textConfig?: OverlayTextConfig, imageTransform?: ImageTransform, colorBlocks: ColorBlockLayer[] = []) {
  const cleanBuffer = await fetchCleanImageBuffer(imageUrl);
  if (!cleanBuffer) return null;

  const metadata = await sharp(cleanBuffer).metadata();
  const width = metadata.width ?? 1080;
  const height = metadata.height ?? 1920;
  const baseBuffer = await transformCleanImageBuffer(cleanBuffer, width, height, imageTransform ?? { scale: 1, x: 0, y: 0 });
  const topGradient = buildGradient(width, height, "top", config.gradients);
  const bottomGradient = buildGradient(width, height, "bottom", config.gradients);
  const overlay = await buildOverlayBuffer(config.blocks, width, height, text, textConfig, colorBlocks);
  const stamp = Date.now();
  const brandedFile = `styleforge-atelier-${stamp}.png`;
  const thumbnailFile = `styleforge-atelier-${stamp}.webp`;

  const brandedBuffer = await sharp(baseBuffer)
    .composite([
      { input: topGradient.buffer, left: 0, top: topGradient.top },
      { input: bottomGradient.buffer, left: 0, top: bottomGradient.top },
      { input: overlay, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();

  // Upload to Supabase (works everywhere)
  const { error } = await supabase.storage
    .from("images")
    .upload(`branded/${brandedFile}`, brandedBuffer, { contentType: "image/png", upsert: true });

  const thumbnailBuffer = await sharp(brandedBuffer)
    .resize({ width: 360, withoutEnlargement: true })
    .webp({ quality: 76 })
    .toBuffer();
  const { error: thumbnailError } = await supabase.storage
    .from("images")
    .upload(`previews/${thumbnailFile}`, thumbnailBuffer, { contentType: "image/webp", upsert: true });

  // Also write locally in dev (silent fail on Vercel)
  try {
    await mkdir(BRANDED_GENERATED_DIR, { recursive: true });
    await mkdir(PREVIEW_GENERATED_DIR, { recursive: true });
    await sharp(brandedBuffer).png().toFile(path.join(BRANDED_GENERATED_DIR, brandedFile));
    await sharp(thumbnailBuffer).webp().toFile(path.join(PREVIEW_GENERATED_DIR, thumbnailFile));
  } catch {
    // read-only filesystem on Vercel
  }

  return {
    brandedUrl: error
      ? publicUrl("generated", "branded", brandedFile)
      : `${IMAGES_PROXY}/branded/${brandedFile}`,
    thumbnailUrl: thumbnailError
      ? publicUrl("generated", "previews", thumbnailFile)
      : `${IMAGES_PROXY}/previews/${thumbnailFile}`,
  };
}

export async function GET() {
  return Response.json(await readConfig());
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as OverlayPayload;
    const config = {
      blocks: normalizeConfig(payload.blocks ?? payload),
      gradients: normalizeGradients(payload.gradients),
    };
    const textConfig = normalizeTextConfig(payload.textConfig);
    const imageTransform = normalizeImageTransform(payload.imageTransform);
    const colorBlocks = normalizeColorBlocks(payload.colorBlocks);
    await renderOverlay(config);
    const renderedImage = await renderBrandedImage(config, payload.imageUrl, payload.text, textConfig, imageTransform, colorBlocks);

    return Response.json({
      brandedUrl: renderedImage?.brandedUrl ?? null,
      blocks: config.blocks,
      gradients: config.gradients,
      logoUrl: `/brand/atelier-de-sevres/logo.png?t=${Date.now()}`,
      thumbnailUrl: renderedImage?.thumbnailUrl ?? null,
    });
  } catch (error) {
    console.error("atelier overlay save failed", error);
    return Response.json(
      {
        message: error instanceof Error ? error.message : "Sauvegarde branding impossible.",
      },
      { status: 500 },
    );
  }
}
