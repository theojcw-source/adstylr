import type { GeneratedImage } from "../../types";
import { getImageThumbnailUrl } from "../../utils/image";

export function isUnstableAtelierExportUrl(url: string | undefined) {
  return Boolean(url?.startsWith("/generated/branded/styleforge-atelier-"));
}

export function getDisplayImageUrl(image: GeneratedImage) {
  return image.cleanUrl ?? image.url;
}

function getImageCacheKey(image: GeneratedImage, displayUrl: string, variant: "clean" | "branded") {
  return encodeURIComponent(`${variant}:${displayUrl}:${JSON.stringify(image.brandingConfig ?? null)}`);
}

export function getBoardImageUrl(image: GeneratedImage, variant: "clean" | "branded" = "branded") {
  if (variant === "branded" && image.thumbnailUrl) {
    return image.thumbnailUrl;
  }

  const displayUrl = variant === "branded"
    ? image.brandedUrl ?? getDisplayImageUrl(image)
    : getDisplayImageUrl(image);
  const thumbnailUrl = getImageThumbnailUrl(displayUrl);
  const separator = thumbnailUrl.includes("?") ? "&" : "?";
  return `${thumbnailUrl}${separator}v=${getImageCacheKey(image, displayUrl, variant)}`;
}
