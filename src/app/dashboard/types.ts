import type {
  AtelierColorBlockLayer,
  AtelierImageTransform,
  AtelierOverlayConfig,
  AtelierOverlayGradientConfig,
  AtelierOverlayTextBlockId,
  AtelierOverlayTextConfig,
  AtelierOverlayTextContent,
} from "../components/AtelierOverlayEditor";

export type ShadowPanelState =
  | { id: "atelierLogo" | "eventBlock"; label: string; type: "block" }
  | { id: AtelierOverlayTextBlockId; label: string; type: "text" };

export type BrandingSnapshot = {
  blocks: AtelierOverlayConfig;
  colorBlocks: AtelierColorBlockLayer[];
  gradients: AtelierOverlayGradientConfig;
  imageTransform: AtelierImageTransform;
  text: AtelierOverlayTextContent;
  textConfig: AtelierOverlayTextConfig;
};

export function isBrandingSnapshot(value: unknown): value is BrandingSnapshot {
  return Boolean(
    value &&
    typeof value === "object" &&
    "blocks" in value &&
    "gradients" in value &&
    "textConfig" in value,
  );
}
