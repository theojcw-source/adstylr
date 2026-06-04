import {
  HD_IMAGE_SIZE_BY_RATIO,
} from "../constants";
import type { AspectRatio, CustomImageSize, ImageSizeName, ResolutionMode } from "../types";

export function deriveCleanUrl(url: string) {
  const path = url.split("?")[0] ?? "";
  const fileName = path.split("/").pop() ?? "";

  if (fileName.startsWith("styleforge-atelier-")) {
    return "";
  }

  if (path.startsWith("/api/images/clean/")) {
    return path;
  }

  if (path.startsWith("/api/images/branded/")) {
    return path.replace("/api/images/branded/", "/api/images/clean/");
  }

  if (path.startsWith("/generated/clean/")) {
    return path;
  }

  if (path.startsWith("/generated/branded/") && !path.includes("styleforge-atelier-")) {
    return path.replace("/generated/branded/", "/generated/clean/");
  }

  return "";
}

export function getImageThumbnailUrl(url: string, width = 360) {
  if (!url.startsWith("/api/images/")) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}w=${width}`;
}

export function clampDimension(value: number) {
  if (!Number.isFinite(value)) {
    return 1024;
  }

  return Math.min(Math.max(Math.round(value), 256), 2048);
}

export function formatImageSize(size: CustomImageSize | "square_hd") {
  if (size === "square_hd") {
    return "1024 x 1024 px";
  }

  return `${size.width} x ${size.height} px`;
}

export function getImageSizeInput(
  aspectRatio: AspectRatio,
  resolutionMode: ResolutionMode,
  customSize: CustomImageSize,
): ImageSizeName | CustomImageSize {
  if (resolutionMode === "standard") {
    return aspectRatio;
  }

  if (resolutionMode === "hd") {
    return HD_IMAGE_SIZE_BY_RATIO[aspectRatio];
  }

  return {
    width: clampDimension(customSize.width),
    height: clampDimension(customSize.height),
  };
}
