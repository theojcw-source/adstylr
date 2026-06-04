"use client";

import Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import { ATELIER_ASSET_BY_ID, ATELIER_ASSETS, type AtelierAssetId } from "../atelierAssets";
import { renderWasmPreview } from "../utils/wasmPreview";

// ── Types ──────────────────────────────────────────────────────────
export type AtelierOverlayBlockId = "atelierLogo" | "eventBlock";
export type AtelierOverlayBlock = {
  assetId?: AtelierAssetId;
  hidden?: boolean;
  shadowBlur?: number;
  shadowEnabled?: boolean;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};
export type AtelierOverlayConfig = Record<AtelierOverlayBlockId, AtelierOverlayBlock>;
export type AtelierOverlayGradientConfig = { bottomOpacity: number; topOpacity: number };
export type AtelierOverlayTextBlockId = "headline" | "cta";
export type AtelierOverlayTextBlock = {
  backgroundColor?: string;
  color?: string;
  fontSize: number;
  fontStyle?: string;       // "normal" | "bold" | "italic" | "bold italic"
  hidden?: boolean;
  letterSpacing?: number;
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
export type AtelierOverlayTextConfig = Record<AtelierOverlayTextBlockId, AtelierOverlayTextBlock>;
export type AtelierOverlayTextContent = { cta?: string; headline?: string };
export type AtelierImageTransform = { scale: number; x: number; y: number };
export type AtelierColorBlockLayer = {
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

export type AtelierFreeTextLayer = {
  id: string;
  text: string;
  color: string;
  fontSize: number;
  fontStyle?: string;
  uppercase?: boolean;
  letterSpacing?: number;
  lineHeight?: number;
  textAlign?: "left" | "center" | "right";
  width: number;
  x: number;
  y: number;
  hidden?: boolean;
};

// ── Constants ──────────────────────────────────────────────────────
const SAFE_ZONE_Y = 1536;
export const ATELIER_FONT_STACK = "Atelier de Sevres, Helvetica Neue, Arial, sans-serif";

const BLOCKS: Array<{ defaultAssetId: AtelierAssetId; id: AtelierOverlayBlockId; label: string }> = [
  { defaultAssetId: "logo-original", id: "atelierLogo", label: "Logo" },
  { defaultAssetId: "event-original", id: "eventBlock", label: "Bloc" },
];

// ── Hooks ──────────────────────────────────────────────────────────
function useCanvasImage(src: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) return;
    const img = new window.Image();
    if (/^https?:\/\//.test(src)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => setImage(img);
    img.src = src;
  }, [src]);
  return image;
}

function resolveTextShadow(config: AtelierOverlayTextBlock, isCta: boolean, stageScale: number) {
  const blur = config.shadowBlur ?? (isCta ? 0 : 12);
  const opacity = config.shadowOpacity ?? (isCta ? 0 : 0.45);
  const offsetY = config.shadowOffsetY ?? (isCta ? 0 : 8);

  return {
    blur: blur * stageScale,
    color: config.shadowColor ?? `rgba(0,0,0,${opacity})`,
    enabled: blur > 0 && opacity > 0,
    offsetY: offsetY * stageScale,
    opacity,
  };
}

function resolveBlockShadow(config: AtelierOverlayBlock, stageScale: number) {
  const blur = config.shadowBlur ?? 36;
  const opacity = config.shadowOpacity ?? 0.32;
  const offsetY = config.shadowOffsetY ?? 18;

  return {
    blur: blur * stageScale,
    color: "rgba(0,0,0,1)",
    enabled: config.shadowEnabled === true && blur > 0 && opacity > 0,
    offsetY: offsetY * stageScale,
    opacity,
  };
}

// ── OverlayImage ───────────────────────────────────────────────────
function OverlayImage({ block, isSelected, onChange, onDragStateChange, onSelect, position, safeZoneY, stageScale }: {
  block: (typeof BLOCKS)[number];
  isSelected: boolean;
  onChange: (id: AtelierOverlayBlockId, block: AtelierOverlayBlock) => void;
  onDragStateChange: (d: boolean) => void;
  onSelect: (id: AtelierOverlayBlockId) => void;
  position: AtelierOverlayBlock;
  safeZoneY: number;
  stageScale: number;
}) {
  const asset = ATELIER_ASSET_BY_ID[position.assetId ?? block.defaultAssetId] ?? ATELIER_ASSET_BY_ID[block.defaultAssetId];
  const image = useCanvasImage(`/brand/atelier-de-sevres/assets/${asset.file}`);
  const imageRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const shadow = resolveBlockShadow(position, stageScale);

  useEffect(() => {
    if (isSelected && imageRef.current && trRef.current) {
      trRef.current.nodes([imageRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <KonvaImage
        draggable
        dragBoundFunc={(p) => ({ x: p.x, y: Math.min(p.y, safeZoneY * stageScale) })}
        height={asset.height * stageScale}
        image={image ?? undefined}
        onClick={() => onSelect(block.id)}
        onDragEnd={(e) => { onDragStateChange(false); onChange(block.id, { ...position, x: e.target.x() / stageScale, y: e.target.y() / stageScale }); }}
        onDragStart={() => { onSelect(block.id); onDragStateChange(true); }}
        onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "move"; }}
        onMouseLeave={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "default"; }}
        onTap={() => onSelect(block.id)}
        onTransformEnd={() => {
          const node = imageRef.current;
          if (!node) return;
          onChange(block.id, {
            ...position,
            scaleX: node.scaleX(),
            scaleY: node.scaleY(),
            x: node.x() / stageScale,
            y: node.y() / stageScale,
          });
        }}
        ref={imageRef}
        scaleX={position.scaleX}
        scaleY={position.scaleY}
        shadowBlur={shadow.enabled ? shadow.blur : isSelected ? 10 : 0}
        shadowColor={shadow.enabled ? shadow.color : "rgba(255,255,255,0.5)"}
        shadowOffsetY={shadow.enabled ? shadow.offsetY : 0}
        shadowOpacity={shadow.enabled ? shadow.opacity : isSelected ? 1 : 0}
        width={asset.width * stageScale}
        x={position.x * stageScale}
        y={position.y * stageScale}
      />
      {isSelected ? <Transformer enabledAnchors={["top-left","top-right","bottom-left","bottom-right"]} flipEnabled={false} keepRatio ref={trRef} rotateEnabled={false} /> : null}
    </>
  );
}

// ── DraggableTextLayer ─────────────────────────────────────────────
function DraggableTextLayer({ config, id, isEditing, isSelected, onChange, onDblClick, onDragStateChange, onSelect, safeZoneY, stageScale, text }: {
  config: AtelierOverlayTextBlock;
  id: AtelierOverlayTextBlockId;
  isEditing: boolean;
  isSelected: boolean;
  onChange: (id: AtelierOverlayTextBlockId, block: AtelierOverlayTextBlock) => void;
  onDblClick: (id: AtelierOverlayTextBlockId, node: Konva.Text) => void;
  onDragStateChange: (d: boolean) => void;
  onSelect: (id: AtelierOverlayTextBlockId) => void;
  safeZoneY: number;
  stageScale: number;
  text: string;
}) {
  const textRef = useRef<Konva.Text>(null);
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const isCta = id === "cta";
  const x = config.x * stageScale;
  const y = config.y * stageScale;
  const width = config.width * stageScale;
  const fontSize = config.fontSize * stageScale;
  const fontStyle = config.fontStyle ?? "bold";
  const isUppercase = config.uppercase ?? true;
  const letterSpacing = config.letterSpacing ?? 0;
  const lineHeight = config.lineHeight ?? (isCta ? 1 : 0.96);
  const textAlign = config.textAlign ?? (isCta ? "center" : "left");
  const ctaPadding = 12 * stageScale;
  const defaultBackgroundColor = "#f1f0f0";
  const defaultColor = isCta ? "#111111" : "#f1f0f0";
  const backgroundColor = config.backgroundColor ?? defaultBackgroundColor;
  const color = config.color ?? defaultColor;
  const shadow = resolveTextShadow(config, isCta, stageScale);
  const [ctaRectHeight, setCtaRectHeight] = useState(fontSize * 2.5);

  useEffect(() => {
    if (!isCta || !textRef.current) return;
    const lines = (textRef.current as unknown as { textArr?: unknown[] }).textArr?.length ?? 1;
    setCtaRectHeight(lines * fontSize * 1.15 + ctaPadding * 2);
  }, [isCta, text, width, fontSize, ctaPadding]);

  useEffect(() => {
    const target = isCta ? groupRef.current : textRef.current;
    if (isSelected && target && trRef.current) {
      trRef.current.nodes([target]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isCta, isSelected]);

  if (!text.trim()) return null;
  const opacity = isEditing ? 0 : 1;
  const textValue = isUppercase ? text.trim().toUpperCase() : text.trim();

  if (isCta) {
    return (
      <>
        <Group
          draggable={!isEditing}
          dragBoundFunc={(p) => ({
            x: Math.min(Math.max(p.x, 0), 1080 * stageScale - width),
            y: Math.min(Math.max(p.y, 0), safeZoneY * stageScale),
          })}
          onClick={() => onSelect(id)}
          onDblClick={() => { if (textRef.current) onDblClick(id, textRef.current); }}
          onDblTap={() => { if (textRef.current) onDblClick(id, textRef.current); }}
          onDragEnd={(e) => {
            onDragStateChange(false);
            onChange(id, { ...config, x: e.target.x() / stageScale, y: e.target.y() / stageScale });
          }}
          onDragStart={() => { onSelect(id); onDragStateChange(true); }}
          onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "move"; }}
          onMouseLeave={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "default"; }}
          onTap={() => onSelect(id)}
          onTransformEnd={() => {
            const node = groupRef.current;
            if (!node) return;
            const nextWidth = Math.max(120, width * node.scaleX() / stageScale);
            const nextFontSize = Math.max(10, config.fontSize * node.scaleY());
            const nextX = node.x() / stageScale;
            const nextY = node.y() / stageScale;
            node.scaleX(1);
            node.scaleY(1);
            onChange(id, { ...config, fontSize: nextFontSize, width: nextWidth, x: nextX, y: nextY });
          }}
          opacity={opacity}
          ref={groupRef}
          x={x}
          y={y}
        >
          <Rect
            cornerRadius={4 * stageScale}
            fill={backgroundColor}
            height={ctaRectHeight}
            opacity={0.95}
            shadowBlur={isSelected ? 10 : 0}
            shadowColor="rgba(255,255,255,0.55)"
            width={width}
            x={0}
            y={0}
          />
          <Text
            align={textAlign}
            fill={color}
            fontFamily={ATELIER_FONT_STACK}
            fontSize={fontSize}
            fontStyle={fontStyle}
            height={ctaRectHeight}
            letterSpacing={letterSpacing}
            lineHeight={lineHeight}
            padding={ctaPadding}
            ref={textRef}
            shadowBlur={shadow.enabled ? shadow.blur : 0}
            shadowColor={shadow.color}
            shadowOffsetY={shadow.enabled ? shadow.offsetY : 0}
            shadowOpacity={shadow.enabled ? shadow.opacity : 0}
            text={textValue}
            verticalAlign="middle"
            width={width}
            x={0}
            y={0}
          />
        </Group>
        {isSelected && !isEditing ? <Transformer enabledAnchors={["middle-left","middle-right","bottom-left","bottom-right","top-left","top-right"]} flipEnabled={false} ref={trRef} rotateEnabled={false} /> : null}
      </>
    );
  }

  return (
    <>
      <Text
        ref={textRef}
        align={textAlign}
        draggable={!isEditing}
        dragBoundFunc={(p) => ({ x: Math.min(Math.max(p.x, 0), 1080 * stageScale - width), y: Math.min(Math.max(p.y, 0), safeZoneY * stageScale) })}
        fill={color}
        fontFamily={ATELIER_FONT_STACK}
        fontSize={fontSize}
        fontStyle={fontStyle}
        letterSpacing={letterSpacing}
        lineHeight={lineHeight}
        onClick={() => onSelect(id)}
        onDblClick={() => { if (textRef.current) onDblClick(id, textRef.current); }}
        onDblTap={() => { if (textRef.current) onDblClick(id, textRef.current); }}
        onDragEnd={(e) => { onDragStateChange(false); onChange(id, { ...config, x: e.target.x() / stageScale, y: e.target.y() / stageScale }); }}
        onDragStart={() => { onSelect(id); onDragStateChange(true); }}
        onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "move"; }}
        onMouseLeave={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "default"; }}
        onTap={() => onSelect(id)}
        onTransformEnd={() => {
          const node = textRef.current;
          if (!node) return;
          const nextWidth = Math.max(120, node.width() * node.scaleX() / stageScale);
          const nextFontSize = Math.max(10, config.fontSize * node.scaleY());
          node.scaleX(1);
          node.scaleY(1);
          onChange(id, { ...config, fontSize: nextFontSize, width: nextWidth, x: node.x() / stageScale, y: node.y() / stageScale });
        }}
        opacity={opacity}
        padding={isCta ? ctaPadding : 0}
        shadowBlur={shadow.enabled ? shadow.blur : 0}
        shadowColor={shadow.color}
        shadowOffsetY={shadow.enabled ? shadow.offsetY : 0}
        shadowOpacity={shadow.enabled ? shadow.opacity : 0}
        text={textValue}
        verticalAlign="top"
        width={width} x={x} y={y}
      />
      {isSelected && !isEditing ? <Transformer enabledAnchors={["middle-left","middle-right","bottom-left","bottom-right","top-left","top-right"]} flipEnabled={false} ref={trRef} rotateEnabled={false} /> : null}
    </>
  );
}

// ── FreeTextLayer ──────────────────────────────────────────────────
function FreeTextLayer({ layer, isEditing, isSelected, onDblClick, onDragEnd, onDragStateChange, onSelect, safeZoneY, stageScale }: {
  layer: AtelierFreeTextLayer;
  isEditing: boolean;
  isSelected: boolean;
  onDblClick: (layer: AtelierFreeTextLayer, node: Konva.Text) => void;
  onDragEnd: (id: string, x: number, y: number, width?: number, fontSize?: number) => void;
  onDragStateChange: (d: boolean) => void;
  onSelect: (id: string) => void;
  safeZoneY: number;
  stageScale: number;
}) {
  const textRef = useRef<Konva.Text>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const x = layer.x * stageScale;
  const y = layer.y * stageScale;
  const width = layer.width * stageScale;
  const fontSize = layer.fontSize * stageScale;

  useEffect(() => {
    if (isSelected && textRef.current && trRef.current) {
      trRef.current.nodes([textRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  if (!layer.text.trim() || layer.hidden) return null;
  const opacity = isEditing ? 0 : 1;

  return (
    <>
    <Text
      ref={textRef}
      align={layer.textAlign ?? "left"}
      draggable={!isEditing}
      dragBoundFunc={(p) => ({ x: Math.min(Math.max(p.x, 0), 1080 * stageScale - width), y: Math.min(Math.max(p.y, 0), safeZoneY * stageScale) })}
      fill={layer.color}
      fontFamily={ATELIER_FONT_STACK}
      fontSize={fontSize}
      fontStyle={layer.fontStyle ?? "normal"}
      letterSpacing={layer.letterSpacing ?? 0}
      lineHeight={layer.lineHeight ?? 1}
      onClick={() => onSelect(layer.id)}
      onDblClick={() => { if (textRef.current) onDblClick(layer, textRef.current); }}
      onDblTap={() => { if (textRef.current) onDblClick(layer, textRef.current); }}
      onDragEnd={(e) => { onDragStateChange(false); onDragEnd(layer.id, e.target.x() / stageScale, e.target.y() / stageScale); }}
      onDragStart={() => { onSelect(layer.id); onDragStateChange(true); }}
      onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "move"; }}
      onMouseLeave={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "default"; }}
      onTap={() => onSelect(layer.id)}
      onTransformEnd={() => {
        const node = textRef.current;
        if (!node) return;
        const nextWidth = Math.max(120, node.width() * node.scaleX() / stageScale);
        const nextFontSize = Math.max(10, layer.fontSize * node.scaleY());
        node.scaleX(1);
        node.scaleY(1);
        onDragEnd(layer.id, node.x() / stageScale, node.y() / stageScale, nextWidth, nextFontSize);
      }}
      opacity={opacity}
      shadowBlur={isSelected ? 8 * stageScale : 0}
      shadowColor="rgba(0,0,0,0.5)"
      text={layer.uppercase ? layer.text.trim().toUpperCase() : layer.text.trim()}
      verticalAlign="top"
      width={width} x={x} y={y}
    />
    {isSelected && !isEditing ? <Transformer enabledAnchors={["middle-left","middle-right","bottom-left","bottom-right","top-left","top-right"]} flipEnabled={false} ref={trRef} rotateEnabled={false} /> : null}
    </>
  );
}

function ColorBlockLayer({ isSelected, layer, onChange, onDragStateChange, onSelect, safeZoneY, stageScale }: {
  isSelected: boolean;
  layer: AtelierColorBlockLayer;
  onChange: (layer: AtelierColorBlockLayer) => void;
  onDragStateChange: (d: boolean) => void;
  onSelect: (id: string) => void;
  safeZoneY: number;
  stageScale: number;
}) {
  const rectRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && rectRef.current && trRef.current) {
      trRef.current.nodes([rectRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  if (layer.hidden) return null;

  return (
    <>
      <Rect
        ref={rectRef}
        draggable
        dragBoundFunc={(p) => ({ x: Math.min(Math.max(p.x, 0), 1080 * stageScale), y: Math.min(Math.max(p.y, 0), safeZoneY * stageScale) })}
        fill={layer.color}
        height={layer.height * stageScale}
        opacity={layer.opacity ?? 1}
        cornerRadius={(layer.radius ?? 0) * stageScale}
        onClick={() => onSelect(layer.id)}
        onDragEnd={(e) => { onDragStateChange(false); onChange({ ...layer, x: e.target.x() / stageScale, y: e.target.y() / stageScale }); }}
        onDragStart={() => { onSelect(layer.id); onDragStateChange(true); }}
        onTap={() => onSelect(layer.id)}
        onTransformEnd={() => {
          const node = rectRef.current;
          if (!node) return;
          const next = {
            ...layer,
            height: Math.max(24, node.height() * node.scaleY() / stageScale),
            width: Math.max(24, node.width() * node.scaleX() / stageScale),
            x: node.x() / stageScale,
            y: node.y() / stageScale,
          };
          node.scaleX(1);
          node.scaleY(1);
          onChange(next);
        }}
        width={layer.width * stageScale}
        x={layer.x * stageScale}
        y={layer.y * stageScale}
      />
      {isSelected ? <Transformer enabledAnchors={["top-left","top-right","bottom-left","bottom-right","middle-left","middle-right","top-center","bottom-center"]} flipEnabled={false} ref={trRef} rotateEnabled={false} /> : null}
    </>
  );
}

function WasmPreviewCanvas({
  backgroundImage,
  gradients,
  imageTransform,
  onReadyChange,
  stageHeight,
  stageWidth,
}: {
  backgroundImage: HTMLImageElement | null;
  gradients: AtelierOverlayGradientConfig;
  imageTransform: AtelierImageTransform;
  onReadyChange: (ready: boolean) => void;
  stageHeight: number;
  stageWidth: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!backgroundImage || !canvasRef.current) {
        onReadyChange(false);
        return;
      }

      try {
        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = backgroundImage.naturalWidth || backgroundImage.width;
        sourceCanvas.height = backgroundImage.naturalHeight || backgroundImage.height;
        const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
        const targetContext = canvasRef.current.getContext("2d");
        if (!sourceContext || !targetContext || sourceCanvas.width <= 0 || sourceCanvas.height <= 0) {
          onReadyChange(false);
          return;
        }

        sourceContext.drawImage(backgroundImage, 0, 0, sourceCanvas.width, sourceCanvas.height);
        const sourceData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
        const preview = await renderWasmPreview(
          {
            background: "#050505",
            fit: "cover",
            gradients: {
              bottom: "#000000",
              bottomOpacity: 0.72 * gradients.bottomOpacity,
              top: "#000000",
              topOpacity: 0.62 * gradients.topOpacity,
            },
            height: stageHeight,
            imageTransform: {
              scale: imageTransform.scale,
              x: imageTransform.x * (stageWidth / 1080),
              y: imageTransform.y * (stageHeight / 1920),
            },
            width: stageWidth,
          },
          sourceData,
        );

        if (cancelled || !canvasRef.current) return;
        canvasRef.current.width = stageWidth;
        canvasRef.current.height = stageHeight;
        targetContext.putImageData(preview, 0, 0);
        onReadyChange(true);
      } catch (error) {
        console.warn("wasm preview failed", error);
        onReadyChange(false);
      }
    }

    void render();

    return () => {
      cancelled = true;
    };
  }, [backgroundImage, gradients.bottomOpacity, gradients.topOpacity, imageTransform.scale, imageTransform.x, imageTransform.y, onReadyChange, stageHeight, stageWidth]);

  return (
    <canvas
      aria-hidden="true"
      className="wasm-preview-canvas"
      height={stageHeight}
      ref={canvasRef}
      width={stageWidth}
    />
  );
}

export { BLOCKS as ATELIER_OVERLAY_BLOCKS };

// ── Editing state ──────────────────────────────────────────────────
type EditingBlock = {
  id: string;
  isFreeLayer: boolean;
  value: string;
  x: number; y: number; width: number;
  fontSize: number; fontStyle: string; letterSpacing: number;
  lineHeight: number; textAlign: string; uppercase: boolean;
  isCta: boolean; ctaPadding: number; color: string; backgroundColor: string;
};

// ── AtelierOverlayEditor ───────────────────────────────────────────
export function AtelierOverlayEditor({
  backgroundUrl, colorBlocks = [], config, freeLayers = [], gradients, imageToolActive = false, imageTransform,
  maxHeight, onChange, onChangeColorBlocks, onChangeFreeLayers, onChangeImageTransform, onChangeText, onChangeTextConfig,
  showAssetSwitcher = true, text, textConfig, width,
}: {
  backgroundUrl?: string;
  colorBlocks?: AtelierColorBlockLayer[];
  config: AtelierOverlayConfig;
  freeLayers?: AtelierFreeTextLayer[];
  gradients: AtelierOverlayGradientConfig;
  imageToolActive?: boolean;
  imageTransform?: AtelierImageTransform;
  maxHeight?: number;
  onChange: (config: AtelierOverlayConfig) => void;
  onChangeColorBlocks?: (layers: AtelierColorBlockLayer[]) => void;
  onChangeFreeLayers?: (layers: AtelierFreeTextLayer[]) => void;
  onChangeImageTransform?: (transform: AtelierImageTransform) => void;
  onChangeText?: (id: AtelierOverlayTextBlockId, value: string) => void;
  onChangeTextConfig?: (config: AtelierOverlayTextConfig) => void;
  showAssetSwitcher?: boolean;
  text?: AtelierOverlayTextContent;
  textConfig?: AtelierOverlayTextConfig;
  width?: number;
}) {
  const [selectedId, setSelectedId] = useState<string>("eventBlock");
  const [isDragging, setIsDragging] = useState(false);
  const [editingBlock, setEditingBlock] = useState<EditingBlock | null>(null);
  const [wasmPreviewReady, setWasmPreviewReady] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const focusedEditingIdRef = useRef<string | null>(null);
  const backgroundImage = useCanvasImage(backgroundUrl ?? "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(width ?? (backgroundUrl ? 420 : 240));
  const requestedWidth = width ?? containerWidth;
  const heightLimitedWidth = maxHeight ? Math.floor(maxHeight * 9 / 16) : requestedWidth;
  const stageWidth = Math.max(180, Math.min(requestedWidth, heightLimitedWidth));
  const stageHeight = Math.round(stageWidth * 16 / 9);
  const stageScale = stageWidth / 1080;
  const scaledBlocks = useMemo(() => BLOCKS, []);
  const resolvedImageTransform = imageTransform ?? { scale: 1, x: 0, y: 0 };

  useEffect(() => {
    if (width || !containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width);
      if (w > 0) setContainerWidth(Math.min(w, backgroundUrl ? 520 : 240));
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [backgroundUrl, width]);

  // Auto-focus textarea on edit start
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || !editingBlock) {
      focusedEditingIdRef.current = null;
      return;
    }
    if (focusedEditingIdRef.current !== editingBlock.id) {
      ta.focus(); ta.select();
      focusedEditingIdRef.current = editingBlock.id;
    }
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }, [editingBlock]);

  function startEditing(id: AtelierOverlayTextBlockId, node: Konva.Text) {
    if (!textConfig) return;
    const pos = node.getAbsolutePosition();
    const cfg = textConfig[id];
    const isCta = id === "cta";
    const scale = stageWidth / 1080;
    setEditingBlock({
      id, isFreeLayer: false,
      value: id === "headline" ? (text?.headline ?? "") : (text?.cta ?? ""),
      x: pos.x, y: pos.y,
      width: cfg.width * scale, fontSize: cfg.fontSize * scale,
      fontStyle: cfg.fontStyle ?? "bold", letterSpacing: cfg.letterSpacing ?? 0,
      lineHeight: cfg.lineHeight ?? (isCta ? 1 : 0.96),
      textAlign: cfg.textAlign ?? (isCta ? "center" : "left"),
      uppercase: cfg.uppercase ?? true, isCta,
      ctaPadding: isCta ? 12 * scale : 0,
      backgroundColor: cfg.backgroundColor ?? "#f1f0f0",
      color: cfg.color ?? (isCta ? "#111111" : "#f1f0f0"),
    });
  }

  function startEditingFreeLayer(layer: AtelierFreeTextLayer, node: Konva.Text) {
    const pos = node.getAbsolutePosition();
    const scale = stageWidth / 1080;
    setEditingBlock({
      id: layer.id, isFreeLayer: true,
      value: layer.text, x: pos.x, y: pos.y,
      width: layer.width * scale, fontSize: layer.fontSize * scale,
      fontStyle: layer.fontStyle ?? "normal", letterSpacing: layer.letterSpacing ?? 0,
      lineHeight: layer.lineHeight ?? 1, textAlign: layer.textAlign ?? "left",
      uppercase: layer.uppercase ?? false, isCta: false, ctaPadding: 0,
      backgroundColor: "transparent",
      color: layer.color,
    });
  }

  function commitEdit() {
    if (!editingBlock) return;
    if (editingBlock.isFreeLayer) {
      onChangeFreeLayers?.(freeLayers.map((l) => l.id === editingBlock.id ? { ...l, text: editingBlock.value } : l));
    } else {
      onChangeText?.(editingBlock.id as AtelierOverlayTextBlockId, editingBlock.value);
    }
    setEditingBlock(null);
  }

  return (
    <div className="konva-overlay-wrap" ref={containerRef}>
      <div className="konva-overlay-frame" style={{ height: stageHeight, width: stageWidth }}>
        <WasmPreviewCanvas
          backgroundImage={backgroundImage}
          gradients={gradients}
          imageTransform={resolvedImageTransform}
          onReadyChange={setWasmPreviewReady}
          stageHeight={stageHeight}
          stageWidth={stageWidth}
        />
        <Stage
          className={`konva-overlay-stage${wasmPreviewReady ? " wasm-ready" : ""}`}
          height={stageHeight}
          onMouseDown={(e) => { if (e.target === e.target.getStage()) setSelectedId("eventBlock"); }}
          onTouchStart={(e) => { if (e.target === e.target.getStage()) setSelectedId("eventBlock"); }}
          onWheel={(e) => {
            if (!imageToolActive || !onChangeImageTransform) return;
            e.evt.preventDefault();
            const nextScale = Math.min(1.6, Math.max(1, resolvedImageTransform.scale + (e.evt.deltaY > 0 ? -0.08 : 0.08)));
            const minY = stageHeight * (1 - nextScale) / stageScale;
            const clampedY = Math.max(minY, Math.min(0, resolvedImageTransform.y));
            onChangeImageTransform({ ...resolvedImageTransform, scale: nextScale, y: clampedY });
          }}
          width={stageWidth}
        >
          <Layer>
            {backgroundUrl && backgroundImage && !wasmPreviewReady ? (
            <KonvaImage
              draggable={imageToolActive}
              dragBoundFunc={(p) => ({
                x: p.x,
                y: Math.max(stageHeight * (1 - resolvedImageTransform.scale), Math.min(0, p.y)),
              })}
              height={stageHeight * resolvedImageTransform.scale}
              image={backgroundImage}
              listening={imageToolActive}
              onDragEnd={(e) => {
                setIsDragging(false);
                const clampedY = Math.max(stageHeight * (1 - resolvedImageTransform.scale), Math.min(0, e.target.y()));
                onChangeImageTransform?.({ ...resolvedImageTransform, x: e.target.x() / stageScale, y: clampedY / (stageHeight / 1920) });
              }}
              onDragStart={() => setIsDragging(true)}
              onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = imageToolActive ? "grab" : "default"; }}
              onMouseLeave={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "default"; }}
              width={stageWidth * resolvedImageTransform.scale}
              x={resolvedImageTransform.x * stageScale}
              y={resolvedImageTransform.y * (stageHeight / 1920)}
            />
          ) : null}

          {wasmPreviewReady && backgroundUrl && imageToolActive ? (
            <Rect
              draggable
              dragBoundFunc={(p) => ({
                x: p.x,
                y: Math.max(stageHeight * (1 - resolvedImageTransform.scale), Math.min(0, p.y)),
              })}
              fill="rgba(0,0,0,0.01)"
              height={stageHeight * resolvedImageTransform.scale}
              listening
              onDragEnd={(e) => {
                setIsDragging(false);
                const clampedY = Math.max(stageHeight * (1 - resolvedImageTransform.scale), Math.min(0, e.target.y()));
                onChangeImageTransform?.({ ...resolvedImageTransform, x: e.target.x() / stageScale, y: clampedY / (stageHeight / 1920) });
              }}
              onDragStart={() => setIsDragging(true)}
              onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "grab"; }}
              onMouseLeave={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = "default"; }}
              width={stageWidth * resolvedImageTransform.scale}
              x={resolvedImageTransform.x * stageScale}
              y={resolvedImageTransform.y * (stageHeight / 1920)}
            />
          ) : null}

          {/* Gradients */}
          {!wasmPreviewReady ? (
            <>
              <Rect
                fillLinearGradientColorStops={[0, `rgba(0,0,0,${0.62 * gradients.topOpacity})`, 0.55, `rgba(0,0,0,${0.28 * gradients.topOpacity})`, 1, "rgba(0,0,0,0)"]}
                fillLinearGradientEndPoint={{ x: 0, y: stageHeight * 0.32 }}
                fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                height={stageHeight * 0.32} listening={false} width={stageWidth} x={0} y={0}
              />
              <Rect
                fillLinearGradientColorStops={[0, "rgba(0,0,0,0)", 0.42, `rgba(0,0,0,${0.36 * gradients.bottomOpacity})`, 1, `rgba(0,0,0,${0.72 * gradients.bottomOpacity})`]}
                fillLinearGradientEndPoint={{ x: 0, y: stageHeight * 0.46 }}
                fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                height={stageHeight * 0.46} listening={false} width={stageWidth} x={0} y={stageHeight * 0.54}
              />
            </>
          ) : null}

          {colorBlocks.map((layer) => (
            <ColorBlockLayer
              isSelected={selectedId === layer.id}
              key={layer.id}
              layer={layer}
              onChange={(nextLayer) => onChangeColorBlocks?.(colorBlocks.map((item) => item.id === layer.id ? nextLayer : item))}
              onDragStateChange={setIsDragging}
              onSelect={setSelectedId}
              safeZoneY={SAFE_ZONE_Y}
              stageScale={stageScale}
            />
          ))}

          {/* Brand blocks */}
          {scaledBlocks.map((block) => config[block.id]?.hidden ? null : (
            <OverlayImage
              block={block} isSelected={selectedId === block.id} key={block.id}
              onChange={(id, nb) => onChange({ ...config, [id]: nb })}
              onDragStateChange={setIsDragging} onSelect={setSelectedId}
              position={config[block.id]} safeZoneY={SAFE_ZONE_Y} stageScale={stageScale}
            />
          ))}

          {/* Fixed text layers (headline + CTA) */}
          {textConfig && onChangeTextConfig ? (
            <>
              {textConfig.headline.hidden ? null : (
                <DraggableTextLayer
                  config={textConfig.headline} id="headline"
                  isEditing={editingBlock?.id === "headline"} isSelected={selectedId === "headline"}
                  onChange={(id, nb) => onChangeTextConfig({ ...textConfig, [id]: nb })}
                  onDblClick={startEditing} onDragStateChange={setIsDragging} onSelect={setSelectedId}
                  safeZoneY={SAFE_ZONE_Y} stageScale={stageScale} text={text?.headline ?? ""}
                />
              )}
              {textConfig.cta.hidden ? null : (
                <DraggableTextLayer
                  config={textConfig.cta} id="cta"
                  isEditing={editingBlock?.id === "cta"} isSelected={selectedId === "cta"}
                  onChange={(id, nb) => onChangeTextConfig({ ...textConfig, [id]: nb })}
                  onDblClick={startEditing} onDragStateChange={setIsDragging} onSelect={setSelectedId}
                  safeZoneY={SAFE_ZONE_Y} stageScale={stageScale} text={text?.cta ?? ""}
                />
              )}
            </>
          ) : null}

          {/* Free text layers */}
          {freeLayers.map((layer) => (
            <FreeTextLayer
              key={layer.id} layer={layer}
              isEditing={editingBlock?.id === layer.id} isSelected={selectedId === layer.id}
              onDblClick={startEditingFreeLayer}
              onDragEnd={(id, x, y, nextWidth, nextFontSize) => onChangeFreeLayers?.(freeLayers.map((l) => l.id === id ? { ...l, fontSize: nextFontSize ?? l.fontSize, width: nextWidth ?? l.width, x, y } : l))}
              onDragStateChange={setIsDragging} onSelect={setSelectedId}
              safeZoneY={SAFE_ZONE_Y} stageScale={stageScale}
            />
          ))}

          {/* Safe zone guides */}
          <Line dash={[6*stageScale,4*stageScale]} listening={false} opacity={isDragging?0:0.35} points={[0,stageHeight*0.2,stageWidth,stageHeight*0.2]} stroke="#888" strokeWidth={1.5*stageScale} />
          <Line dash={[6*stageScale,4*stageScale]} listening={false} opacity={isDragging?0:0.35} points={[0,stageHeight*0.8,stageWidth,stageHeight*0.8]} stroke="#888" strokeWidth={1.5*stageScale} />
          <Rect fill="rgba(30,30,30,0.72)" height={stageHeight*0.2} listening={false} opacity={isDragging?1:0} width={stageWidth} x={0} y={0} />
          <Line dash={[6*stageScale,4*stageScale]} listening={false} opacity={isDragging?1:0} points={[0,stageHeight*0.2,stageWidth,stageHeight*0.2]} stroke="rgba(255,255,255,0.9)" strokeWidth={2*stageScale} />
          <Text align="center" fill="rgba(255,255,255,0.9)" fontSize={13*stageScale} fontStyle="bold" letterSpacing={2*stageScale} listening={false} opacity={isDragging?1:0} text="SAFE ZONE" width={stageWidth} x={0} y={stageHeight*0.085} />
          <Rect fill="rgba(30,30,30,0.72)" height={stageHeight*0.2} listening={false} opacity={isDragging?1:0} width={stageWidth} x={0} y={stageHeight*0.8} />
          <Line dash={[6*stageScale,4*stageScale]} listening={false} opacity={isDragging?1:0} points={[0,stageHeight*0.8,stageWidth,stageHeight*0.8]} stroke="rgba(255,255,255,0.9)" strokeWidth={2*stageScale} />
          <Text align="center" fill="rgba(255,255,255,0.9)" fontSize={13*stageScale} fontStyle="bold" letterSpacing={2*stageScale} listening={false} opacity={isDragging?1:0} text="SAFE ZONE" width={stageWidth} x={0} y={stageHeight*0.8+stageHeight*0.085} />
          </Layer>
        </Stage>

        {/* Floating text editor */}
        {editingBlock ? (
          <textarea
            ref={textareaRef}
            className="konva-text-editor"
            style={{
              background: editingBlock.isCta ? editingBlock.backgroundColor : "rgba(0,0,0,0.25)",
              borderRadius: editingBlock.isCta ? 4 * stageScale : 4,
              color: editingBlock.color,
              fontFamily: ATELIER_FONT_STACK,
              fontSize: editingBlock.fontSize,
              fontStyle: editingBlock.fontStyle.includes("italic") ? "italic" : "normal",
              fontWeight: editingBlock.fontStyle.includes("bold") ? "bold" : "normal",
              left: editingBlock.x,
              letterSpacing: editingBlock.letterSpacing + "px",
              lineHeight: editingBlock.lineHeight,
              padding: editingBlock.ctaPadding,
              textAlign: editingBlock.textAlign as React.CSSProperties["textAlign"],
              textTransform: editingBlock.uppercase ? "uppercase" : "none",
              top: editingBlock.y,
              width: editingBlock.width,
            }}
            value={editingBlock.value}
            onChange={(e) => {
              setEditingBlock((p) => p ? { ...p, value: e.target.value } : null);
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === "Escape") setEditingBlock(null); }}
          />
        ) : null}
      </div>

      {/* Asset switcher */}
      {showAssetSwitcher ? (
        <div className="asset-switcher">
          {scaledBlocks.map((block) => (
            <label key={block.id}>
              <span>{block.label}</span>
              <select
                onChange={(e) => onChange({ ...config, [block.id]: { ...config[block.id], assetId: e.target.value as AtelierAssetId } })}
                value={config[block.id].assetId ?? block.defaultAssetId}
              >
                {ATELIER_ASSETS.map((asset) => <option key={asset.id} value={asset.id}>{asset.label}</option>)}
              </select>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
