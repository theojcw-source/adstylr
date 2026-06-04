export function readCatalogPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const source = payload as Record<string, unknown>;
  if (source.encoding !== "base64" || typeof source.content !== "string") {
    return payload;
  }

  try {
    return JSON.parse(atob(source.content.replace(/\s/g, "")));
  } catch {
    return payload;
  }
}
