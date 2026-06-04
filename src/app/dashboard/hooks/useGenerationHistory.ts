"use client";

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  GENERATION_HISTORY_KEY,
  GENERATION_MODELS,
  SELECTED_BRAND_STORAGE_KEY,
} from "../../constants";
import { COMFY_FAL_MODEL, type GenerationModel } from "../../fal-models";
import type { GeneratedImage, GenerationHistoryItem } from "../../types";
import { deriveCleanUrl } from "../../utils/image";
import { readGenerationHistory } from "../../utils/storage";

type GenerationApiRow = {
  id: string;
  url: string;
  brand_id?: string | null;
  branding_config?: unknown;
  branded_url?: string | null;
  clean_url?: string | null;
  created_at?: string | null;
  hidden_at?: string | null;
  loras?: unknown;
  model?: GenerationModel | string | null;
  prompt?: string | null;
  thumbnail_url?: string | null;
};

type PreviewImageState = { url: string; title: string; prompt?: string } | null;

type UseGenerationHistoryOptions = {
  activeResultId?: string;
  archiveMode: boolean;
  initialGenerationId?: string;
  schoolId: string;
  onClearAtelierOverlayStatus: () => void;
  onRestoreBrandingConfig: (brandingConfig: unknown) => void;
  results: GeneratedImage[];
  setActiveResultIndex: Dispatch<SetStateAction<number | null>>;
  setLastGenerationPrompt: Dispatch<SetStateAction<string>>;
  setPreviewImage: Dispatch<SetStateAction<PreviewImageState>>;
  setResults: Dispatch<SetStateAction<GeneratedImage[]>>;
  setSelectedBrandId: Dispatch<SetStateAction<string>>;
};

function isUnstableAtelierExportUrl(url: string | undefined) {
  return Boolean(url?.startsWith("/generated/branded/styleforge-atelier-"));
}

function normalizeGenerationRow(row: GenerationApiRow): GenerationHistoryItem {
  return {
    brandId: row.brand_id ?? undefined,
    brandingConfig: row.branding_config as GenerationHistoryItem["brandingConfig"],
    brandedUrl: row.branded_url ?? undefined,
    cleanUrl: row.clean_url ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    hiddenAt: row.hidden_at ?? undefined,
    id: row.id,
    loras: Array.isArray(row.loras) ? (row.loras as GenerationHistoryItem["loras"]) : [],
    model: GENERATION_MODELS.some((model) => model.value === row.model)
      ? (row.model as GenerationModel)
      : COMFY_FAL_MODEL,
    prompt: row.prompt ?? "",
    thumbnailUrl: row.thumbnail_url ?? undefined,
    url: row.branded_url ?? row.url,
  };
}

export function useGenerationHistory({
  activeResultId,
  archiveMode,
  initialGenerationId,
  schoolId,
  onClearAtelierOverlayStatus,
  onRestoreBrandingConfig,
  results,
  setActiveResultIndex,
  setLastGenerationPrompt,
  setPreviewImage,
  setResults,
  setSelectedBrandId,
}: UseGenerationHistoryOptions) {
  const [generationHistory, setGenerationHistory] = useState<GenerationHistoryItem[]>([]);
  const [generationHistoryLoading, setGenerationHistoryLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGenerationHistory(readGenerationHistory());
  }, []);

  useEffect(() => {
    async function loadRemoteHistory() {
      try {
        const params = new URLSearchParams();
        if (schoolId) params.set("school", schoolId);
        if (archiveMode) params.set("view", "archive");
        const query = params.toString();
        const url = query
          ? `/api/generations?${query}`
          : "/api/generations";
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as GenerationApiRow[];
        const remoteHistory = data.map(normalizeGenerationRow);
        if (remoteHistory.length > 0 || archiveMode) {
          setGenerationHistory(remoteHistory);
          if (!archiveMode) {
            localStorage.setItem(GENERATION_HISTORY_KEY, JSON.stringify(remoteHistory));
          }
        }
      } finally {
        setGenerationHistoryLoading(false);
      }
    }

    void loadRemoteHistory();
  }, [archiveMode, schoolId]);

  const persistGenerationHistory = useCallback((newItems: GenerationHistoryItem[]) => {
    setGenerationHistory((current) => {
      const nextHistory = [...newItems, ...current].slice(0, 36);
      localStorage.setItem(GENERATION_HISTORY_KEY, JSON.stringify(nextHistory));
      return nextHistory;
    });
  }, []);

  const persistRemoteGenerationHistory = useCallback(async (newItems: GenerationHistoryItem[]) => {
    if (newItems.length === 0) return;

    try {
      await fetch("/api/generations", {
        body: JSON.stringify(
          newItems.map((item) => ({
            brand_id: item.brandId,
            branded_url: item.brandedUrl,
            branding_config: item.brandingConfig,
            clean_url: item.cleanUrl,
            id: item.id,
            loras: item.loras,
            model: item.model,
            prompt: item.prompt,
            source: "dashboard",
            thumbnail_url: item.thumbnailUrl,
            url: item.url,
          })),
        ),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
    } catch {
      // Local history is still enough for the current session; the next load can fall back to Storage.
    }
  }, []);

  const historyItemToGeneratedImage = useCallback((item: GenerationHistoryItem): GeneratedImage => {
    const cleanUrl = item.cleanUrl ?? deriveCleanUrl(item.url);
    const rawBrandedUrl = item.brandedUrl ?? (item.url.startsWith("/generated/branded/") ? item.url : undefined);
    const brandedUrl = isUnstableAtelierExportUrl(rawBrandedUrl) ? undefined : rawBrandedUrl;

    return {
      brandId: item.brandId,
      brandingConfig: item.brandingConfig,
      brandedUrl,
      cleanUrl: cleanUrl || undefined,
      id: item.id,
      thumbnailUrl: item.thumbnailUrl,
      url: brandedUrl ?? cleanUrl ?? item.url,
    };
  }, []);

  const openHistoryItem = useCallback((item: GenerationHistoryItem) => {
    if (item.brandId) {
      setSelectedBrandId(item.brandId);
      localStorage.setItem(SELECTED_BRAND_STORAGE_KEY, item.brandId);
    }
    onRestoreBrandingConfig(item.brandingConfig);
    setPreviewImage(null);
    setResults([historyItemToGeneratedImage(item)]);
    setActiveResultIndex(0);
    setLastGenerationPrompt(item.prompt);
    onClearAtelierOverlayStatus();
    const basePath = schoolId ? `/dashboard/${schoolId}` : "/dashboard";
    window.history.pushState(null, "", `${basePath}/${item.id}`);
  }, [schoolId,
    historyItemToGeneratedImage,
    onClearAtelierOverlayStatus,
    onRestoreBrandingConfig,
    setActiveResultIndex,
    setLastGenerationPrompt,
    setPreviewImage,
    setResults,
    setSelectedBrandId,
  ]);

  const clearGenerationHistory = useCallback(() => {
    setGenerationHistory([]);
    localStorage.removeItem(GENERATION_HISTORY_KEY);
  }, []);

  const restoreGeneration = useCallback(async (item: GenerationHistoryItem) => {
    await fetch(`/api/generations?id=${encodeURIComponent(item.id)}`, {
      body: JSON.stringify({ hidden_at: null }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    setGenerationHistory((current) => current.filter((entry) => entry.id !== item.id));
  }, []);

  useEffect(() => {
    if (!initialGenerationId || generationHistoryLoading || activeResultId === initialGenerationId) return;

    const resultIndex = results.findIndex((image) => image.id === initialGenerationId);
    if (resultIndex >= 0) {
      onRestoreBrandingConfig(results[resultIndex]?.brandingConfig);
      setActiveResultIndex(resultIndex);
      return;
    }

    const historyItem = generationHistory.find((item) => item.id === initialGenerationId);
    if (historyItem) {
      openHistoryItem(historyItem);
    }
  }, [
    activeResultId,
    generationHistory,
    generationHistoryLoading,
    initialGenerationId,
    onRestoreBrandingConfig,
    openHistoryItem,
    results,
    setActiveResultIndex,
  ]);

  return {
    clearGenerationHistory,
    generationHistory,
    generationHistoryLoading,
    historyItemToGeneratedImage,
    openHistoryItem,
    persistGenerationHistory,
    persistRemoteGenerationHistory,
    restoreGeneration,
    setGenerationHistory,
  };
}
