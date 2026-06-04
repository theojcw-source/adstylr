"use client";

import { ChevronLeft, Images, Inbox, Zap } from "lucide-react";
import { fal } from "@fal-ai/client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";
import {
  type AtelierColorBlockLayer,
  type AtelierImageTransform,
  type AtelierOverlayBlock,
  type AtelierOverlayConfig,
  type AtelierOverlayGradientConfig,
  type AtelierOverlayTextBlockId,
  type AtelierOverlayTextConfig,
  type AtelierOverlayTextContent,
} from "../components/AtelierOverlayEditor";
import {
  COMFY_FAL_MODEL,
  FAL_FLUX_2_LORA_MODEL,
  FAL_SELECTED_LORA_URL_KEY,
  type GenerationModel,
} from "../fal-models";
import {
  ATELIER_BRAND_ID,
  ATELIER_OVERLAY_DEFAULT_CONFIG,
  ATELIER_OVERLAY_DEFAULT_GRADIENTS,
  ATELIER_OVERLAY_DEFAULT_TEXT_CONFIG,
  DEFAULT_BRANDS,
  DEFAULT_PROMPT_TEMPLATES,
  DEFAULT_PUBLISHED_STYLES,
  GENERATION_MODELS,
  LORA_CATALOG_URL,
  LORA_STORAGE_KEY,
  PROMPT_TEMPLATE_STORAGE_KEY,
  SELECTED_BRAND_STORAGE_KEY,
} from "../constants";
import type {
  AspectRatio,
  Brand,
  ComfyGenerationResponse,
  ComfyWorkflow,
  CustomImageSize,
  DirectGenerationInput,
  FalCreditsState,
  GeneratedImage,
  GenerationResult,
  OrganizationStyleMatch,
  OutputFormat,
  PromptTemplate,
  PublishedStyle,
  ResolutionMode,
  SavedLora,
  WorkspaceMode,
} from "../types";
import { findStyleForBrand, normalizeOrganizationKey } from "../utils/brand";
import { readCatalogPayload } from "../utils/catalog";
import { deriveCleanUrl, getImageSizeInput } from "../utils/image";
import { createId } from "../utils/misc";
import { readPromptTemplates, readSavedLoras, readSessionValue } from "../utils/storage";
import {
  buildPromptFromTemplate,
  buildStylePrompt,
  normalizePublishedStyles,
  normalizeStyleKey,
} from "../utils/styles";
import { type BrandingSnapshot, isBrandingSnapshot, type ShadowPanelState } from "./types";
import { isUnstableAtelierExportUrl } from "./utils/board";
import { LoadingImage } from "../components/LoadingImage";
import { useGenerationHistory } from "./hooks/useGenerationHistory";
import { useLoraTraining } from "./hooks/useLoraTraining";
import { useDoraTraining } from "./hooks/useDoraTraining";
import { BriefInbox } from "./components/BriefInbox";
import { WorkspaceHome } from "./components/WorkspaceHome";
import { LoraWorkspace } from "./components/LoraWorkspace";
import { DoraWorkspace } from "./components/DoraWorkspace";
import { ImageStudio, type ImageBoardItem } from "./components/ImageStudio";
import { ResultViewer } from "./components/ResultViewer";
import { LoraSaveModal } from "./components/modals/LoraSaveModal";
import { Img2ImgModal } from "./components/modals/Img2ImgModal";
import { PromptModal } from "./components/modals/PromptModal";

fal.config({ proxyUrl: "/api/fal/proxy" });

function getAtelierOverlaySignature(
  config: AtelierOverlayConfig,
  gradients: AtelierOverlayGradientConfig,
  textConfig: AtelierOverlayTextConfig,
  text: AtelierOverlayTextContent,
  imageTransform: AtelierImageTransform,
  colorBlocks: AtelierColorBlockLayer[],
) {
  return JSON.stringify({ colorBlocks, config, gradients, imageTransform, text, textConfig });
}

function getEditableImageUrl(image: GeneratedImage | null) {
  if (!image) return "";
  if (image.cleanUrl) return image.cleanUrl;
  const derived = deriveCleanUrl(image.url);
  if (derived) return derived;
  return isUnstableAtelierExportUrl(image.url) ? "" : image.url;
}

export default function DashboardPage({ schoolId, initialGenerationId }: { schoolId?: string; initialGenerationId?: string }) {
  const effectiveSchoolId = schoolId || DEFAULT_BRANDS[0]?.id || "lisaa";

  // --- Workspace ---
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("images");

  // --- Org / brands ---
  const [brands, setBrands] = useState<Brand[]>(DEFAULT_BRANDS);
  const [selectedBrandId, setSelectedBrandId] = useState(effectiveSchoolId);
  const [, setFalCredits] = useState<FalCreditsState>({ status: "loading" });
  const [publishedStyles, setPublishedStyles] = useState<PublishedStyle[]>(DEFAULT_PUBLISHED_STYLES);

  // --- Saved loras (shared between LoRA and DoRA hooks) ---
  const [savedLoras, setSavedLoras] = useState<SavedLora[]>([]);

  function persistLoras(nextLoras: SavedLora[]) {
    setSavedLoras(nextLoras);
    localStorage.setItem(LORA_STORAGE_KEY, JSON.stringify(nextLoras));
  }

  // --- LoRA scale (generation only, not training) ---
  const [loraScale, setLoraScale] = useState(1);

  // --- Prompt / templates ---
  const [prompt, setPrompt] = useState(buildStylePrompt(DEFAULT_PUBLISHED_STYLES[0] ?? { triggerWord: "", prompt: "" }));
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [selectedPromptTemplateId, setSelectedPromptTemplateId] = useState<string | null>(null);
  const [promptFlash, setPromptFlash] = useState(false);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState<{ id: string | null; label: string; category: string; prompt: string }>({ id: null, label: "", category: "", prompt: "" });
  const [promptSaving, setPromptSaving] = useState(false);

  // --- Workflows ---
  const [savedWorkflows, setSavedWorkflows] = useState<ComfyWorkflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [workflowNameDraft, setWorkflowNameDraft] = useState("");

  // --- Generation params ---
  const [generationModel, setGenerationModel] = useState<GenerationModel>(FAL_FLUX_2_LORA_MODEL);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("portrait_16_9");
  const [resolutionMode, setResolutionMode] = useState<ResolutionMode>("standard");
  const [customImageSize, setCustomImageSize] = useState<CustomImageSize>({ width: 1280, height: 720 });
  const [numImages, setNumImages] = useState(2);
  const [guidance, setGuidance] = useState(3.5);
  const [inferenceSteps, setInferenceSteps] = useState(28);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("jpeg");
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationError, setGenerationError] = useState("");

  // --- Results ---
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [activeResultIndex, setActiveResultIndex] = useState<number | null>(null);
  const [archiveMode, setArchiveMode] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string; prompt?: string } | null>(null);
  const [lastGenerationPrompt, setLastGenerationPrompt] = useState("");

  // --- Video ---
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoResult, setVideoResult] = useState<string | null>(null);
  const [videoError, setVideoError] = useState("");
  const [videoStep, setVideoStep] = useState("");
  const [videoPercent, setVideoPercent] = useState(0);
  const [videoPrompt, setVideoPrompt] = useState("");

  // --- Atelier overlay ---
  const [atelierOverlayConfig, setAtelierOverlayConfig] = useState<AtelierOverlayConfig>(ATELIER_OVERLAY_DEFAULT_CONFIG);
  const [atelierOverlayGradients, setAtelierOverlayGradients] = useState<AtelierOverlayGradientConfig>(ATELIER_OVERLAY_DEFAULT_GRADIENTS);
  const [atelierOverlayTextConfig, setAtelierOverlayTextConfig] = useState<AtelierOverlayTextConfig>(ATELIER_OVERLAY_DEFAULT_TEXT_CONFIG);
  const [atelierOverlayText, setAtelierOverlayText] = useState<AtelierOverlayTextContent>({ cta: "Candidater", headline: "Rejoignez un atelier creatif exigeant." });
  const [atelierImageTransform, setAtelierImageTransform] = useState<AtelierImageTransform>({ scale: 1, x: 0, y: 0 });
  const [atelierImageToolActive, setAtelierImageToolActive] = useState(false);
  const [atelierColorBlocks, setAtelierColorBlocks] = useState<AtelierColorBlockLayer[]>([]);
  const [copiedBranding, setCopiedBranding] = useState<BrandingSnapshot | null>(null);
  const [atelierShadowPanel, setAtelierShadowPanel] = useState<ShadowPanelState | null>(null);
  const [savedAtelierOverlaySignature, setSavedAtelierOverlaySignature] = useState(() =>
    getAtelierOverlaySignature(ATELIER_OVERLAY_DEFAULT_CONFIG, ATELIER_OVERLAY_DEFAULT_GRADIENTS, ATELIER_OVERLAY_DEFAULT_TEXT_CONFIG, { cta: "Candidater", headline: "Rejoignez un atelier creatif exigeant." }, { scale: 1, x: 0, y: 0 }, []),
  );
  const [atelierOverlaySaving, setAtelierOverlaySaving] = useState(false);
  const [atelierOverlayStatus, setAtelierOverlayStatus] = useState("");
  const [atelierOverlayVersion, setAtelierOverlayVersion] = useState(0);

  // --- Img2Img ---
  const [img2imgModalOpen, setImg2imgModalOpen] = useState(false);
  const [img2imgTarget, setImg2imgTarget] = useState<GeneratedImage | null>(null);
  const [img2imgPrompt, setImg2imgPrompt] = useState("");
  const [img2imgStrength, setImg2imgStrength] = useState(0.75);
  const [img2imgLoading, setImg2imgLoading] = useState(false);
  const [img2imgError, setImg2imgError] = useState("");

  // ─── Callbacks ────────────────────────────────────────────────────────────

  const refreshFalCredits = useCallback(async () => {
    try {
      const response = await fetch("/api/fal/credits", { cache: "no-store" });
      const payload = (await response.json()) as FalCreditsState;
      if (!response.ok) {
        setFalCredits({ message: payload.message ?? "Credits fal.ai indisponibles", status: response.status === 503 ? "unconfigured" : "error" });
        return;
      }
      setFalCredits(payload);
    } catch (error) {
      setFalCredits({ message: error instanceof Error ? error.message : "Credits fal.ai indisponibles", status: "error" });
    }
  }, []);

  const refreshBrands = useCallback(async () => {
    try {
      const response = await fetch("/api/brand", { cache: "no-store" });
      if (response.ok) setBrands((await response.json()) as Brand[]);
    } catch { /* ignore */ }
  }, []);

  // ─── Hooks ────────────────────────────────────────────────────────────────

  const lora = useLoraTraining({
    savedLoras,
    persistLoras,
    brands,
    setSelectedBrandId,
    onRefreshFalCredits: () => void refreshFalCredits(),
  });

  const dora = useDoraTraining({
    savedLoras,
    persistLoras,
    onRefreshFalCredits: () => void refreshFalCredits(),
  });

  // ─── Branding helpers ─────────────────────────────────────────────────────

  function buildCurrentBrandingSnapshot(): BrandingSnapshot {
    return {
      blocks: atelierOverlayConfig,
      colorBlocks: atelierColorBlocks,
      gradients: atelierOverlayGradients,
      imageTransform: atelierImageTransform,
      text: atelierOverlayText,
      textConfig: atelierOverlayTextConfig,
    };
  }

  function applyBrandingSnapshot(snapshot: BrandingSnapshot) {
    setAtelierOverlayConfig(snapshot.blocks);
    setAtelierOverlayGradients(snapshot.gradients);
    setAtelierOverlayTextConfig(snapshot.textConfig);
    setAtelierOverlayText(snapshot.text);
    setAtelierImageTransform(snapshot.imageTransform);
    setAtelierColorBlocks(snapshot.colorBlocks);
  }

  const restoreBrandingConfig = useCallback((brandingConfig: unknown) => {
    if (!isBrandingSnapshot(brandingConfig)) return;
    applyBrandingSnapshot(brandingConfig);
    setSavedAtelierOverlaySignature(
      getAtelierOverlaySignature(brandingConfig.blocks, brandingConfig.gradients, brandingConfig.textConfig, brandingConfig.text, brandingConfig.imageTransform, brandingConfig.colorBlocks),
    );
  }, []);

  // ─── Generation history hook ──────────────────────────────────────────────

  const {
    clearGenerationHistory,
    generationHistory,
    generationHistoryLoading,
    historyItemToGeneratedImage,
    openHistoryItem,
    persistGenerationHistory,
    persistRemoteGenerationHistory,
    restoreGeneration,
    setGenerationHistory,
  } = useGenerationHistory({
    activeResultId: activeResultIndex !== null && activeResultIndex >= 0 && activeResultIndex < results.length ? results[activeResultIndex]?.id : undefined,
    archiveMode,
    initialGenerationId,
    schoolId: effectiveSchoolId,
    onClearAtelierOverlayStatus: () => setAtelierOverlayStatus(""),
    onRestoreBrandingConfig: restoreBrandingConfig,
    results,
    setActiveResultIndex,
    setLastGenerationPrompt,
    setPreviewImage,
    setResults,
    setSelectedBrandId,
  });

  // ─── Computed values ──────────────────────────────────────────────────────

  const styleChoices = useMemo(() => {
    const publishedKeys = new Set(publishedStyles.flatMap((s) => [normalizeStyleKey(s.loraUrl), normalizeStyleKey(s.triggerWord)]));
    const uniqueSaved = savedLoras.filter((l) => !publishedKeys.has(normalizeStyleKey(l.url)) && !publishedKeys.has(normalizeStyleKey(l.triggerWord)));
    return [
      ...uniqueSaved.map((l) => ({ id: `saved-${l.id}`, name: l.name, school: l.school, triggerWord: l.triggerWord, loraUrl: l.url, prompt: "", thumbnailUrl: "" })),
      ...publishedStyles,
    ];
  }, [publishedStyles, savedLoras]);

  const organizationMatches = useMemo<OrganizationStyleMatch[]>(
    () => brands.map((brand) => ({ brand, style: findStyleForBrand(brand, styleChoices) })),
    [brands, styleChoices],
  );

  const selectedOrganizationMatch = useMemo(
    () => organizationMatches.find((m) => m.brand.id === selectedBrandId) ?? null,
    [organizationMatches, selectedBrandId],
  );

  const modelSupportsLora = useMemo(
    () => GENERATION_MODELS.find((m) => m.value === generationModel)?.supportsLora ?? false,
    [generationModel],
  );

  const activeLoras = useMemo(() => {
    if (!modelSupportsLora) return [];
    return lora.loraUrl.trim() ? [{ path: lora.loraUrl.trim(), scale: loraScale }] : [];
  }, [lora.loraUrl, loraScale, modelSupportsLora]);

  const imageSizeInput = useMemo(
    () => getImageSizeInput(aspectRatio, resolutionMode, customImageSize),
    [aspectRatio, customImageSize, resolutionMode],
  );

  const selectedPromptTemplate = useMemo(
    () => promptTemplates.find((t) => t.id === selectedPromptTemplateId) ?? null,
    [promptTemplates, selectedPromptTemplateId],
  );

  const visiblePromptTemplates = useMemo(
    () => (promptTemplates.length > 0 ? promptTemplates : DEFAULT_PROMPT_TEMPLATES),
    [promptTemplates],
  );

  const activeResult = activeResultIndex !== null && activeResultIndex >= 0 && activeResultIndex < results.length ? results[activeResultIndex] : null;
  const activeResultEditableImageUrl = getEditableImageUrl(activeResult);
  const activeResultSupportsAtelierEdit = Boolean(activeResultEditableImageUrl);

  const atelierOverlaySignature = useMemo(
    () => getAtelierOverlaySignature(atelierOverlayConfig, atelierOverlayGradients, atelierOverlayTextConfig, atelierOverlayText, atelierImageTransform, atelierColorBlocks),
    [atelierColorBlocks, atelierImageTransform, atelierOverlayConfig, atelierOverlayGradients, atelierOverlayText, atelierOverlayTextConfig],
  );
  const atelierOverlayHasUnsavedChanges = atelierOverlaySignature !== savedAtelierOverlaySignature;
  const activeResultCanExportBranded = Boolean(activeResult?.brandedUrl) && !atelierOverlayHasUnsavedChanges;

  const openResultViewer = useCallback((index: number) => {
    setPreviewImage(null);
    setActiveResultIndex(index);
    restoreBrandingConfig(results[index]?.brandingConfig);
    const id = results[index]?.id;
    if (id) window.history.pushState(null, "", `/dashboard/${id}`);
  }, [results, restoreBrandingConfig]);

  const imageBoardItems = useMemo<ImageBoardItem[]>(() => {
    const seen = new Set<string>();
    const items: ImageBoardItem[] = [];

    if (!archiveMode) {
      results.forEach((image, index) => {
        const key = image.brandedUrl ?? image.url;
        seen.add(key);
        items.push({
          id: `result-${index}-${key}`,
          image,
          label: `Resultat ${index + 1}`,
          onOpen: () => openResultViewer(index),
          onRemove: () => {
            setResults((c) => c.filter((_, i) => i !== index));
            if (image.id) {
              setGenerationHistory((c) => c.filter((h) => h.id !== image.id));
              void fetch(generationDeleteUrl(image), { method: "DELETE" });
            }
          },
          prompt: lastGenerationPrompt || prompt,
        });
      });
    }

    generationHistory.forEach((item, index) => {
      if (seen.has(item.url)) return;
      items.push({
        id: `history-${item.id}`,
        image: historyItemToGeneratedImage(item),
        label: archiveMode ? `Archive ${new Date(item.createdAt).toLocaleDateString("fr-FR")}` : new Date(item.createdAt).toLocaleDateString("fr-FR"),
        onOpen: () => openHistoryItem(item),
        onRemove: archiveMode ? undefined : () => {
          setGenerationHistory((c) => c.filter((h) => h.id !== item.id));
          void fetch(generationDeleteUrl(historyItemToGeneratedImage(item)), { method: "DELETE" });
        },
        onRestore: archiveMode ? () => void restoreGeneration(item) : undefined,
        prompt: item.prompt || `Generation ${index + 1}`,
      });
    });

    return items;
  }, [archiveMode, generationHistory, historyItemToGeneratedImage, lastGenerationPrompt, openHistoryItem, openResultViewer, prompt, restoreGeneration, results, setGenerationHistory]);

  // ─── Modal / scroll lock ──────────────────────────────────────────────────

  const anyModalOpen = !!(promptModalOpen || lora.saveModalOpen || lora.manualModalOpen || dora.doraSaveModalOpen || img2imgModalOpen || previewImage || activeResult);
  useEffect(() => {
    document.body.style.overflow = anyModalOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [anyModalOpen]);

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshFalCredits();
      void refreshBrands();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshFalCredits, refreshBrands]);

  useEffect(() => {
    if (selectedBrandId === ATELIER_BRAND_ID) void loadAtelierOverlayConfig();
  }, [selectedBrandId]);

  useEffect(() => {
    const schoolKey = normalizeOrganizationKey(effectiveSchoolId);
    const storedLoras = readSavedLoras().filter((l) => {
      if (!l.school) return true;
      const loraKey = normalizeOrganizationKey(l.school);
      return loraKey.includes(schoolKey) || schoolKey.includes(loraKey);
    });
    const storedPromptTemplates = readPromptTemplates();
    /* eslint-disable react-hooks/set-state-in-effect */
    setSavedLoras(storedLoras);
    setPromptTemplates(storedPromptTemplates);
    localStorage.setItem(SELECTED_BRAND_STORAGE_KEY, effectiveSchoolId);
    applyOrganization(effectiveSchoolId);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadPublishedStyles() {
      try {
        const response = await fetch(LORA_CATALOG_URL, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`Catalogue indisponible (${response.status})`);
        const payload = await response.json();
        const remoteStyles = normalizePublishedStyles(readCatalogPayload(payload));
        const defaultKeys = new Set(DEFAULT_PUBLISHED_STYLES.map((s) => normalizeStyleKey(s.loraUrl)));
        const styles = [...DEFAULT_PUBLISHED_STYLES, ...remoteStyles.filter((s) => !defaultKeys.has(normalizeStyleKey(s.loraUrl)))];
        setPublishedStyles(styles);
        if (!readSessionValue(FAL_SELECTED_LORA_URL_KEY) && styles[0]) {
          const def = styles[0];
          lora.setLoraUrl(def.loraUrl);
          lora.setTriggerWord(def.triggerWord.trim().toUpperCase());
          setPrompt(buildStylePrompt(def));
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    void loadPublishedStyles();
    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function loadFromMongo() {
      const [promptsResult, workflowsResult] = await Promise.allSettled([
        fetch("/api/prompts", { cache: "no-store" }),
        fetch("/api/workflows", { cache: "no-store" }),
      ]);
      if (promptsResult.status === "fulfilled" && promptsResult.value.ok) {
        const data = (await promptsResult.value.json()) as PromptTemplate[];
        setPromptTemplates(data);
        localStorage.setItem(PROMPT_TEMPLATE_STORAGE_KEY, JSON.stringify(data));
      }
      if (workflowsResult.status === "fulfilled" && workflowsResult.value.ok) {
        const data = (await workflowsResult.value.json()) as ComfyWorkflow[];
        setSavedWorkflows(data);
        const active = data.find((w) => w.isActive);
        if (active) setSelectedWorkflowId(active.id);
      }
    }
    void loadFromMongo();
  }, []);

  // ─── Atelier overlay ──────────────────────────────────────────────────────

  async function loadAtelierOverlayConfig() {
    try {
      const response = await fetch("/api/brand/atelier-overlay", { cache: "no-store" });
      if (!response.ok) throw new Error("Overlay Atelier indisponible");
      const payload = (await response.json()) as { blocks?: AtelierOverlayConfig; gradients?: AtelierOverlayGradientConfig } & Partial<AtelierOverlayConfig>;
      const nextConfig = payload.blocks ?? (payload as AtelierOverlayConfig);
      const nextGradients = payload.gradients ?? ATELIER_OVERLAY_DEFAULT_GRADIENTS;
      setAtelierOverlayConfig(nextConfig);
      setAtelierOverlayGradients(nextGradients);
      setSavedAtelierOverlaySignature(getAtelierOverlaySignature(nextConfig, nextGradients, ATELIER_OVERLAY_DEFAULT_TEXT_CONFIG, { cta: "Candidater", headline: "Rejoignez un atelier creatif exigeant." }, { scale: 1, x: 0, y: 0 }, []));
      setAtelierOverlayStatus("");
    } catch (error) {
      setAtelierOverlayStatus(error instanceof Error ? error.message : "Overlay Atelier indisponible");
    }
  }

  async function saveAtelierOverlayConfig(imageUrl?: string, resultIndex?: number, snapshot = buildCurrentBrandingSnapshot()) {
    setAtelierOverlaySaving(true);
    setAtelierOverlayStatus("");
    try {
      const response = await fetch("/api/brand/atelier-overlay", {
        body: JSON.stringify({ blocks: snapshot.blocks, colorBlocks: snapshot.colorBlocks, gradients: snapshot.gradients, imageTransform: snapshot.imageTransform, imageUrl, text: snapshot.text, textConfig: snapshot.textConfig }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("Sauvegarde impossible");
      const payload = (await response.json()) as {
        brandedUrl?: string | null;
        blocks?: AtelierOverlayConfig;
        gradients?: AtelierOverlayGradientConfig;
        thumbnailUrl?: string | null;
      };
      const nextSnapshot: BrandingSnapshot = { ...snapshot, blocks: payload.blocks ?? snapshot.blocks, gradients: payload.gradients ?? snapshot.gradients };
      if (imageUrl && !payload.brandedUrl) throw new Error("Application du branding impossible pour cette image.");
      applyBrandingSnapshot(nextSnapshot);
      setSavedAtelierOverlaySignature(getAtelierOverlaySignature(nextSnapshot.blocks, nextSnapshot.gradients, nextSnapshot.textConfig, nextSnapshot.text, nextSnapshot.imageTransform, nextSnapshot.colorBlocks));
      if (payload.brandedUrl && typeof resultIndex === "number") {
        const targetId = results[resultIndex]?.id ?? activeResult?.id;
        if (targetId) {
          await patchGeneration(targetId, {
            brand_id: results[resultIndex]?.brandId ?? selectedBrandId,
            branded_url: payload.brandedUrl,
            branding_config: nextSnapshot,
            clean_url: results[resultIndex]?.cleanUrl ?? imageUrl,
            thumbnail_url: payload.thumbnailUrl,
            url: payload.brandedUrl,
          });
        }
        setResults((c) => c.map((img, i) => i === resultIndex ? { ...img, brandId: img.brandId ?? ATELIER_BRAND_ID, brandedUrl: payload.brandedUrl ?? img.brandedUrl, brandingConfig: nextSnapshot, cleanUrl: img.cleanUrl ?? imageUrl, id: img.id ?? targetId, thumbnailUrl: payload.thumbnailUrl ?? img.thumbnailUrl, url: payload.brandedUrl ?? img.url } : img));
        if (targetId) {
          setGenerationHistory((c) => c.map((item) => item.id === targetId ? { ...item, brandedUrl: payload.brandedUrl ?? item.brandedUrl, brandingConfig: nextSnapshot, cleanUrl: item.cleanUrl ?? imageUrl, thumbnailUrl: payload.thumbnailUrl ?? item.thumbnailUrl, url: payload.brandedUrl ?? item.url } : item));
        }
      }
      setAtelierOverlayVersion(Date.now());
      setAtelierOverlayStatus(payload.brandedUrl ? "Image mise a jour" : "Overlay sauvegarde");
    } catch (error) {
      setAtelierOverlayStatus(error instanceof Error ? error.message : "Sauvegarde impossible");
    } finally {
      setAtelierOverlaySaving(false);
    }
  }

  function copyCurrentBranding() {
    setCopiedBranding(buildCurrentBrandingSnapshot());
    setAtelierOverlayStatus("Branding copie");
  }

  async function applyCopiedBrandingToActive() {
    if (!copiedBranding || activeResultIndex === null || !activeResultEditableImageUrl) return;
    applyBrandingSnapshot(copiedBranding);
    await saveAtelierOverlayConfig(activeResultEditableImageUrl, activeResultIndex, copiedBranding);
  }

  function updateAtelierOverlayText(id: AtelierOverlayTextBlockId, value: string) {
    setAtelierOverlayText((c) => ({ ...c, [id === "headline" ? "headline" : "cta"]: value }));
  }

  function updateAtelierOverlayTextBlock(id: AtelierOverlayTextBlockId, patch: Partial<AtelierOverlayTextConfig[AtelierOverlayTextBlockId]>) {
    setAtelierOverlayTextConfig((c) => ({ ...c, [id]: { ...c[id], ...patch } }));
  }

  function persistActiveBrandingSnapshot(snapshot: BrandingSnapshot) {
    if (activeResultIndex === null || !activeResultEditableImageUrl) return;
    void saveAtelierOverlayConfig(activeResultEditableImageUrl, activeResultIndex, snapshot);
  }

  function toggleAtelierOverlayBlockVisibility(id: "atelierLogo" | "eventBlock") {
    const nextBlocks = { ...atelierOverlayConfig, [id]: { ...atelierOverlayConfig[id], hidden: !atelierOverlayConfig[id]?.hidden } };
    setAtelierOverlayConfig(nextBlocks);
    persistActiveBrandingSnapshot({ ...buildCurrentBrandingSnapshot(), blocks: nextBlocks });
  }

  function toggleAtelierOverlayTextVisibility(id: AtelierOverlayTextBlockId) {
    const nextTextConfig = { ...atelierOverlayTextConfig, [id]: { ...atelierOverlayTextConfig[id], hidden: !atelierOverlayTextConfig[id].hidden } };
    setAtelierOverlayTextConfig(nextTextConfig);
    persistActiveBrandingSnapshot({ ...buildCurrentBrandingSnapshot(), textConfig: nextTextConfig });
  }

  function toggleAtelierOverlayBlockShadow(block: AtelierOverlayBlock): AtelierOverlayBlock {
    const nextEnabled = block.shadowEnabled !== true;
    return { ...block, shadowBlur: block.shadowBlur ?? 36, shadowEnabled: nextEnabled, shadowOffsetY: block.shadowOffsetY ?? 18, shadowOpacity: block.shadowOpacity ?? 0.32 };
  }

  function toggleAtelierOverlayTextShadow(id: AtelierOverlayTextBlockId) {
    setAtelierOverlayTextConfig((c) => {
      const block = c[id];
      const enabled = (block.shadowBlur ?? 0) > 0 && (block.shadowOpacity ?? 0) > 0;
      return { ...c, [id]: { ...block, shadowBlur: enabled ? 0 : id === "cta" ? 18 : 36, shadowOffsetY: block.shadowOffsetY ?? (id === "cta" ? 8 : 18), shadowOpacity: enabled ? 0 : id === "cta" ? 0.25 : 0.32 } };
    });
  }

  function updateAtelierShadowPanel(patch: Partial<AtelierOverlayBlock> | Partial<AtelierOverlayTextConfig[AtelierOverlayTextBlockId]>) {
    if (!atelierShadowPanel) return;
    if (atelierShadowPanel.type === "block") {
      setAtelierOverlayConfig((c) => ({ ...c, [atelierShadowPanel.id]: { ...c[atelierShadowPanel.id], ...patch, shadowEnabled: true } }));
      return;
    }
    updateAtelierOverlayTextBlock(atelierShadowPanel.id, patch as Partial<AtelierOverlayTextConfig[AtelierOverlayTextBlockId]>);
  }

  // ─── Organization ─────────────────────────────────────────────────────────

  function applyOrganization(brandId: string) {
    setSelectedBrandId(brandId);
    const match = organizationMatches.find((m) => m.brand.id === brandId);
    if (!match?.style) return;
    const cleanTriggerWord = match.style.triggerWord.trim().toUpperCase();
    lora.setLoraUrl(match.style.loraUrl);
    lora.setTriggerWord(cleanTriggerWord);
    setPrompt(buildStylePrompt(match.style));
    sessionStorage.setItem(FAL_SELECTED_LORA_URL_KEY, match.style.loraUrl);
  }

  // ─── Prompt templates ─────────────────────────────────────────────────────

  function applyPromptTemplate(template: PromptTemplate) {
    setPrompt(buildPromptFromTemplate(template, lora.triggerWord));
    setSelectedPromptTemplateId(template.id);
    setPromptFlash(true);
    window.setTimeout(() => setPromptFlash(false), 700);
  }

  function openNewPromptModal() {
    setPromptDraft({ id: null, label: "", category: "", prompt: "" });
    setPromptModalOpen(true);
  }

  function openEditPromptModal(template: PromptTemplate) {
    setPromptDraft({ id: template.id, label: template.label, category: template.category, prompt: template.prompt });
    setPromptModalOpen(true);
  }

  async function savePromptDraft() {
    if (!promptDraft.label.trim() || !promptDraft.prompt.trim()) return;
    setPromptSaving(true);
    try {
      if (promptDraft.id) {
        await fetch(`/api/prompts/${promptDraft.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: promptDraft.label, category: promptDraft.category, prompt: promptDraft.prompt }) });
        setPromptTemplates((c) => c.map((t) => t.id === promptDraft.id ? { ...t, label: promptDraft.label, category: promptDraft.category, prompt: promptDraft.prompt } : t));
      } else {
        const id = createId();
        await fetch("/api/prompts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, label: promptDraft.label, category: promptDraft.category, prompt: promptDraft.prompt }) });
        setPromptTemplates((c) => [{ id, label: promptDraft.label, category: promptDraft.category, prompt: promptDraft.prompt }, ...c]);
      }
      setPromptModalOpen(false);
    } finally {
      setPromptSaving(false);
    }
  }

  async function deletePromptTemplate(id: string) {
    await fetch(`/api/prompts/${id}`, { method: "DELETE" });
    setPromptTemplates((c) => c.filter((t) => t.id !== id));
    if (selectedPromptTemplateId === id) setSelectedPromptTemplateId(null);
  }

  // ─── Workflows ────────────────────────────────────────────────────────────

  async function saveWorkflow() {
    const name = workflowNameDraft.trim() || "Workflow sans nom";
    setWorkflowSaving(true);
    try {
      const id = createId();
      const res = await fetch("/api/workflows", { body: JSON.stringify({ id, name }), headers: { "Content-Type": "application/json" }, method: "POST" });
      if (res.ok) {
        setSavedWorkflows([{ id, name, description: "", isActive: true, createdAt: new Date().toISOString() }, ...savedWorkflows.map((w) => ({ ...w, isActive: false }))]);
        setSelectedWorkflowId(id);
        setWorkflowNameDraft("");
      }
    } finally {
      setWorkflowSaving(false);
    }
  }

  // ─── Generation ───────────────────────────────────────────────────────────

  async function generateImages() {
    if (!prompt.trim() || (modelSupportsLora && activeLoras.length === 0)) return;
    setGenerating(true);
    setGenerationProgress(10);
    setGenerationError("");
    setResults([]);

    try {
      const generationPrompt = prompt.trim();
      const input: DirectGenerationInput = { prompt: generationPrompt, num_images: numImages, image_size: imageSizeInput, num_inference_steps: inferenceSteps, guidance_scale: guidance, output_format: outputFormat, enable_safety_checker: true };
      if (modelSupportsLora) input.loras = activeLoras;

      const resultData = await generateImagesWithComfy({ ...input, brand_id: selectedBrandId, model: generationModel, workflow_id: generationModel === COMFY_FAL_MODEL ? (selectedWorkflowId ?? undefined) : undefined });
      const generatedImages = (resultData.images ?? []).map((image) => ({ ...image, brandId: image.brandId ?? selectedBrandId, brandingConfig: buildCurrentBrandingSnapshot(), id: createId() }));
      setResults(generatedImages);
      setActiveResultIndex(generatedImages.length > 0 ? 0 : null);
      setLastGenerationPrompt(generationPrompt);
      const historyItems = generatedImages.map((image) => ({ id: image.id ?? createId(), brandId: image.brandId ?? selectedBrandId, brandingConfig: image.brandingConfig, brandedUrl: image.brandedUrl, cleanUrl: image.cleanUrl, thumbnailUrl: image.thumbnailUrl, url: image.brandedUrl ?? image.url, prompt: generationPrompt, createdAt: new Date().toISOString(), model: generationModel, loras: activeLoras }));
      persistGenerationHistory(historyItems);
      void persistRemoteGenerationHistory(historyItems);
      setGenerationProgress(100);
      void refreshFalCredits();
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setGenerating(false);
    }
  }

  async function generateImagesWithComfy(input: Record<string, unknown>): Promise<GenerationResult> {
    setGenerationProgress(35);
    const response = await fetch("/api/comfy/generate", { body: JSON.stringify(input), headers: { "Content-Type": "application/json" }, method: "POST" });
    const payload = (await response.json()) as ComfyGenerationResponse;
    if (!response.ok) throw new Error(payload.message ?? "Generation Comfy indisponible");
    setGenerationProgress(90);
    return { images: payload.images ?? [] };
  }

  // ─── Result viewer ────────────────────────────────────────────────────────

  function closeResultViewer() {
    setActiveResultIndex(null);
    window.history.replaceState(null, "", "/dashboard");
    setVideoResult(null);
    setVideoError("");
    setVideoStep("");
    setVideoPercent(0);
  }

  function moveResultViewer(direction: -1 | 1) {
    if (activeResultIndex === null || results.length === 0) return;
    const nextIndex = (activeResultIndex + direction + results.length) % results.length;
    setActiveResultIndex(nextIndex);
    restoreBrandingConfig(results[nextIndex]?.brandingConfig);
    const id = results[nextIndex]?.id;
    if (id) window.history.replaceState(null, "", `/dashboard/${id}`);
    setVideoResult(null);
    setVideoError("");
  }

  async function removeActiveResult() {
    if (activeResultIndex === null) return;
    const removed = results[activeResultIndex];
    if (removed?.id) {
      try { await fetch(generationDeleteUrl(removed), { method: "DELETE" }); } catch { /* continue */ }
      setGenerationHistory((c) => c.filter((h) => h.id !== removed.id));
    }
    setResults((c) => {
      const next = c.filter((_, i) => i !== activeResultIndex);
      if (next.length === 0) { setActiveResultIndex(null); window.history.replaceState(null, "", "/dashboard"); return next; }
      const nextIndex = Math.min(activeResultIndex, next.length - 1);
      setActiveResultIndex(nextIndex);
      const nextId = next[nextIndex]?.id;
      if (nextId) window.history.replaceState(null, "", `/dashboard/${nextId}`);
      return next;
    });
  }

  async function downloadImage(image: GeneratedImage, index: number, variant: "clean" | "branded" = "clean") {
    if (variant === "branded" && atelierOverlayHasUnsavedChanges) { setAtelierOverlayStatus("Appliquez le branding avant d'exporter la version brandee."); return; }
    if (variant === "branded" && !image.brandedUrl) { setAtelierOverlayStatus("Aucune version brandee sauvegardee pour cette image."); return; }
    const imageUrl = variant === "branded" ? image.brandedUrl ?? image.url : image.cleanUrl ?? image.url;
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = obj; a.download = `styleforge-${variant}-${index + 1}.png`; a.click();
      URL.revokeObjectURL(obj);
    } catch { window.open(imageUrl, "_blank", "noopener,noreferrer"); }
  }

  // ─── Img2Img ──────────────────────────────────────────────────────────────

  async function runImg2Img() {
    if (!img2imgTarget || !img2imgPrompt.trim()) return;
    setImg2imgLoading(true);
    setImg2imgError("");
    try {
      const resultData = await generateImagesWithComfy({ image_url: img2imgTarget.cleanUrl ?? img2imgTarget.url, prompt: img2imgPrompt.trim(), strength: img2imgStrength, image_size: imageSizeInput, brand_id: selectedBrandId, num_inference_steps: inferenceSteps, guidance_scale: guidance });
      const generatedImages = (resultData.images ?? []).map((image) => ({ ...image, brandId: image.brandId ?? selectedBrandId, brandingConfig: img2imgTarget.brandingConfig, id: createId() }));
      if (generatedImages.length > 0) {
        setResults((c) => { const next = [...c, ...generatedImages]; setActiveResultIndex(next.length - 1); return next; });
        const historyItems = generatedImages.map((image) => ({
          id: image.id ?? createId(),
          brandId: image.brandId ?? selectedBrandId,
          brandingConfig: image.brandingConfig,
          brandedUrl: image.brandedUrl,
          cleanUrl: image.cleanUrl,
          thumbnailUrl: image.thumbnailUrl,
          url: image.brandedUrl ?? image.url,
          prompt: img2imgPrompt.trim(),
          createdAt: new Date().toISOString(),
          model: generationModel,
          loras: activeLoras,
        }));
        persistGenerationHistory(historyItems);
        void persistRemoteGenerationHistory(historyItems);
      }
      setImg2imgModalOpen(false);
    } catch (error) {
      setImg2imgError(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setImg2imgLoading(false);
    }
  }

  // ─── Video ────────────────────────────────────────────────────────────────

  async function generateVideo(imageUrl: string) {
    setVideoGenerating(true);
    setVideoResult(null);
    setVideoError("");
    setVideoStep("Initialisation…");
    setVideoPercent(0);
    try {
      const res = await fetch("/api/higgsfield/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl, prompt: videoPrompt.trim() || undefined }) });
      if (!res.body) { setVideoError("Pas de stream dans la réponse"); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const payload = line.replace(/^data: /, "").trim();
          if (!payload) continue;
          try {
            const event = JSON.parse(payload) as { type: "progress"; step: string; percent: number } | { type: "done"; videoUrl: string } | { type: "error"; message: string };
            if (event.type === "progress") { setVideoStep(event.step); setVideoPercent(event.percent); }
            else if (event.type === "done") { setVideoPercent(100); setVideoResult(event.videoUrl); }
            else if (event.type === "error") { setVideoError(event.message); }
          } catch { /* ignore malformed SSE */ }
        }
      }
    } catch { setVideoError("Impossible de joindre le serveur"); }
    finally { setVideoGenerating(false); }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function generationDeleteUrl(image: Pick<GeneratedImage, "brandedUrl" | "cleanUrl" | "id" | "url">) {
    const params = new URLSearchParams({ id: image.id ?? "" });
    params.set("url", image.url);
    if (image.cleanUrl) params.set("clean_url", image.cleanUrl);
    if (image.brandedUrl) params.set("branded_url", image.brandedUrl);
    return `/api/generations?${params.toString()}`;
  }

  async function patchGeneration(id: string, patch: Record<string, unknown>) {
    const response = await fetch(`/api/generations?id=${encodeURIComponent(id)}`, { body: JSON.stringify(patch), headers: { "Content-Type": "application/json" }, method: "PATCH" });
    if (!response.ok) {
      const p = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(p.message ?? "Mise a jour de la photo impossible");
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <div className="brand-name"><span className="brand-name-ad">Ad</span><b>Stylr</b></div>
          </div>
        </div>
        <div className="app-header-actions">
          <button
            className={`button ghost small${workspaceMode === "lora" || workspaceMode === "dora" ? " active" : ""}`}
            onClick={() => setWorkspaceMode(workspaceMode === "lora" ? "images" : "lora")}
            type="button"
          >
            <Zap size={14} />
            Training
          </button>
          <button
            className={`button ghost small${workspaceMode === "briefs" ? " active" : ""}`}
            onClick={() => setWorkspaceMode(workspaceMode === "briefs" ? "images" : "briefs")}
            type="button"
          >
            <Inbox size={14} />
            Briefs
          </button>
          <Link className="button ghost small" href="/veille">
            <Images size={14} />
            Veille SMA
          </Link>
          <button
            className="button ghost small"
            onClick={() => void createSupabaseBrowserClient().auth.signOut().then(() => { window.location.href = "/login"; })}
            type="button"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <main className="app-shell">
        {workspaceMode !== "home" && workspaceMode !== "images" && workspaceMode !== "briefs" ? (
          <>
            <nav className="workspace-switcher" aria-label="Choisir un espace de travail">
              <button className={workspaceMode === "lora" ? "active" : ""} onClick={() => setWorkspaceMode("lora")} type="button">
                <Zap size={16} />Entraînement
              </button>
              <button className={workspaceMode === "dora" ? "active" : ""} onClick={() => setWorkspaceMode("dora")} type="button">
                <Zap size={16} />Mode avancé
              </button>
            </nav>
            <div className="home-return">
              <button className="button ghost small" onClick={() => setWorkspaceMode("home")} type="button">
                <ChevronLeft size={14} />Retour au choix
              </button>
            </div>
          </>
        ) : null}

        {workspaceMode === "home" ? (
          <WorkspaceHome
            brandName={selectedOrganizationMatch?.brand.name ?? "Votre ecole"}
            onTrain={() => setWorkspaceMode("lora")}
            onGenerate={() => setWorkspaceMode("images")}
            onAdvanced={() => setWorkspaceMode("dora")}
          />
        ) : workspaceMode === "lora" ? (
          <LoraWorkspace
            files={lora.files}
            onFilesAdd={lora.handleFiles}
            onFileRemove={lora.removeFile}
            styleName={lora.styleName}
            schoolName={lora.schoolName}
            triggerWord={lora.triggerWord}
            steps={lora.steps}
            onStyleNameChange={lora.setStyleName}
            onSchoolNameChange={lora.setSchoolName}
            onTriggerWordChange={lora.setTriggerWord}
            onStepsChange={lora.setSteps}
            canTrain={lora.canTrain}
            training={lora.training}
            onStartTraining={() => void lora.startTraining()}
            progress={lora.progress}
            progressLabel={lora.progressLabel}
            trainingStatus={lora.trainingStatus}
            trainingBadge={lora.trainingBadge}
            trainedLoraUrl={lora.trainedLoraUrl}
            logs={lora.logs}
            copied={lora.copied}
            onCopyLoraUrl={() => void lora.handleCopyLoraUrl()}
            duplicates={lora.duplicates}
          />
        ) : workspaceMode === "dora" ? (
          <DoraWorkspace
            doraFiles={dora.doraFiles}
            onDoraFilesAdd={dora.handleDoraFiles}
            onDoraFileRemove={dora.removeDoraFile}
            doraStyleName={dora.doraStyleName}
            doraSchoolName={dora.doraSchoolName}
            doraTriggerWord={dora.doraTriggerWord}
            doraSteps={dora.doraSteps}
            doraRank={dora.doraRank}
            onDoraStyleNameChange={dora.setDoraStyleName}
            onDoraSchoolNameChange={dora.setDoraSchoolName}
            onDoraTriggerWordChange={dora.setDoraTriggerWord}
            onDoraStepsChange={dora.setDoraSteps}
            onDoraRankChange={dora.setDoraRank}
            doraTraining={dora.doraTraining}
            onStartDoraTraining={() => void dora.startDoraTraining()}
            doraProgress={dora.doraProgress}
            doraProgressLabel={dora.doraProgressLabel}
            doraTrainingStatus={dora.doraTrainingStatus}
            doraBadge={dora.doraBadge}
            doraLoraUrl={dora.doraLoraUrl}
            doraLogs={dora.doraLogs}
          />
        ) : workspaceMode === "briefs" ? (
          <BriefInbox brandId={selectedBrandId} />
        ) : (
          <ImageStudio
            selectedBrandId={selectedBrandId}
            organizationMatches={organizationMatches}
            atelierOverlayVersion={atelierOverlayVersion}
            onApplyOrganization={applyOrganization}
            visiblePromptTemplates={visiblePromptTemplates}
            promptTemplates={promptTemplates}
            selectedPromptTemplate={selectedPromptTemplate}
            selectedPromptTemplateId={selectedPromptTemplateId}
            promptFlash={promptFlash}
            triggerWord={lora.triggerWord}
            onApplyPromptTemplate={applyPromptTemplate}
            onClearTemplate={() => setSelectedPromptTemplateId(null)}
            onOpenNewPromptModal={openNewPromptModal}
            onOpenEditPromptModal={openEditPromptModal}
            onDeletePromptTemplate={(id) => void deletePromptTemplate(id)}
            prompt={prompt}
            onPromptChange={setPrompt}
            generating={generating}
            generationProgress={generationProgress}
            generationError={generationError}
            modelSupportsLora={modelSupportsLora}
            activeLoras={activeLoras}
            onGenerate={() => void generateImages()}
            generationModel={generationModel}
            aspectRatio={aspectRatio}
            resolutionMode={resolutionMode}
            customImageSize={customImageSize}
            numImages={numImages}
            guidance={guidance}
            inferenceSteps={inferenceSteps}
            outputFormat={outputFormat}
            loraUrl={lora.loraUrl}
            loraScale={loraScale}
            onSetGenerationModel={setGenerationModel}
            onSetAspectRatio={setAspectRatio}
            onSetResolutionMode={setResolutionMode}
            onSetCustomImageSize={setCustomImageSize}
            onSetNumImages={setNumImages}
            onSetGuidance={setGuidance}
            onSetInferenceSteps={setInferenceSteps}
            onSetOutputFormat={setOutputFormat}
            onSetLoraUrl={lora.setLoraUrl}
            onSetLoraScale={setLoraScale}
            atelierOverlaySaving={atelierOverlaySaving}
            atelierOverlayStatus={atelierOverlayStatus}
            atelierOverlayConfig={atelierOverlayConfig}
            atelierOverlayGradients={atelierOverlayGradients}
            onSaveAtelierOverlayConfig={() => void saveAtelierOverlayConfig()}
            onSetAtelierOverlayConfig={setAtelierOverlayConfig}
            onSetAtelierOverlayGradients={setAtelierOverlayGradients}
            workflowSaving={workflowSaving}
            workflowNameDraft={workflowNameDraft}
            onSetWorkflowNameDraft={setWorkflowNameDraft}
            onSaveWorkflow={() => void saveWorkflow()}
            imageBoardItems={imageBoardItems}
            archiveMode={archiveMode}
            generationHistoryLoading={generationHistoryLoading}
            hasGenerationHistory={!archiveMode && generationHistory.length > 0}
            onClearHistory={clearGenerationHistory}
            onArchiveModeChange={setArchiveMode}
          />
        )}
      </main>

      {/* Modals */}

      <LoraSaveModal
        open={lora.saveModalOpen}
        title="Sauvegarder ce modèle"
        description="Conservez ce style dans votre navigateur pour le reutiliser plus tard."
        draft={lora.saveDraft}
        onChange={lora.setSaveDraft}
        onSave={lora.confirmTrainingSave}
        onClose={() => lora.setSaveModalOpen(false)}
      />

      <LoraSaveModal
        open={dora.doraSaveModalOpen}
        title="Sauvegarder ce DoRA"
        description="Conservez ce style dans votre navigateur pour le reutiliser plus tard."
        draft={dora.doraSaveDraft}
        onChange={dora.setDoraSaveDraft}
        onSave={() => { dora.saveDoraLora(dora.doraSaveDraft); dora.setDoraSaveModalOpen(false); }}
        onClose={() => dora.setDoraSaveModalOpen(false)}
      />

      <LoraSaveModal
        open={lora.manualModalOpen}
        title="Ajouter un modèle existant"
        description="Collez une URL .safetensors et ajoutez les informations utiles."
        draft={lora.manualDraft}
        saveLabel="Ajouter"
        saveIcon="plus"
        closeLabel="Annuler"
        onChange={lora.setManualDraft}
        onSave={lora.confirmManualSave}
        onClose={() => lora.setManualModalOpen(false)}
      />

      <PromptModal
        open={promptModalOpen}
        draft={promptDraft}
        saving={promptSaving}
        onChange={setPromptDraft}
        onSave={() => void savePromptDraft()}
        onClose={() => setPromptModalOpen(false)}
      />

      <Img2ImgModal
        open={img2imgModalOpen}
        prompt={img2imgPrompt}
        strength={img2imgStrength}
        loading={img2imgLoading}
        error={img2imgError}
        onPromptChange={setImg2imgPrompt}
        onStrengthChange={setImg2imgStrength}
        onSubmit={() => void runImg2Img()}
        onClose={() => setImg2imgModalOpen(false)}
      />

      {previewImage ? (
        <div className="modal-overlay image-viewer" role="dialog" aria-modal="true" aria-labelledby="image-viewer-title">
          <div className="image-viewer-dialog">
            <div className="modal-topline">
              <div>
                <h2 id="image-viewer-title">{previewImage.title}</h2>
                {previewImage.prompt ? <p>{previewImage.prompt}</p> : null}
              </div>
              <button className="icon-button" onClick={() => setPreviewImage(null)} type="button">
                <Images size={16} />
              </button>
            </div>
            <div className="image-viewer-frame">
              <LoadingImage
                alt={previewImage.title}
                className="h-full w-full object-contain"
                loading="eager"
                src={previewImage.url}
                wrapperClassName="block"
              />
            </div>
          </div>
        </div>
      ) : null}

      {activeResult ? (
        <ResultViewer
          results={results}
          activeResult={activeResult}
          activeResultIndex={activeResultIndex ?? 0}
          editableImageUrl={activeResultEditableImageUrl}
          supportsAtelierEdit={activeResultSupportsAtelierEdit}
          canExportBranded={activeResultCanExportBranded}
          atelierHasUnsavedChanges={atelierOverlayHasUnsavedChanges}
          onClose={closeResultViewer}
          onMove={moveResultViewer}
          onRemove={() => void removeActiveResult()}
          onDownload={(image, index, variant) => void downloadImage(image, index, variant)}
          onOpenImg2Img={() => {
            if (!activeResult) return;
            setImg2imgTarget(activeResult);
            setImg2imgPrompt(lastGenerationPrompt);
            setImg2imgError("");
            setImg2imgModalOpen(true);
          }}
          atelierConfig={atelierOverlayConfig}
          atelierGradients={atelierOverlayGradients}
          atelierTextConfig={atelierOverlayTextConfig}
          atelierText={atelierOverlayText}
          atelierImageTransform={atelierImageTransform}
          atelierImageToolActive={atelierImageToolActive}
          atelierColorBlocks={atelierColorBlocks}
          atelierShadowPanel={atelierShadowPanel}
          atelierSaving={atelierOverlaySaving}
          atelierStatus={atelierOverlayStatus}
          copiedBranding={copiedBranding}
          onSetAtelierConfig={setAtelierOverlayConfig}
          onSetAtelierGradients={setAtelierOverlayGradients}
          onSetAtelierTextConfig={setAtelierOverlayTextConfig}
          onSetAtelierImageTransform={setAtelierImageTransform}
          onSetAtelierImageToolActive={setAtelierImageToolActive}
          onSetAtelierColorBlocks={setAtelierColorBlocks}
          onSetAtelierShadowPanel={setAtelierShadowPanel}
          onSaveAtelierConfig={(imageUrl, index) => void saveAtelierOverlayConfig(imageUrl, index)}
          onUpdateAtelierText={updateAtelierOverlayText}
          onToggleBlockVisibility={toggleAtelierOverlayBlockVisibility}
          onToggleTextVisibility={toggleAtelierOverlayTextVisibility}
          onToggleBlockShadow={toggleAtelierOverlayBlockShadow}
          onToggleTextShadow={toggleAtelierOverlayTextShadow}
          onUpdateShadowPanel={updateAtelierShadowPanel}
          onCopyBranding={copyCurrentBranding}
          onApplyCopiedBranding={() => void applyCopiedBrandingToActive()}
          videoGenerating={videoGenerating}
          videoResult={videoResult}
          videoError={videoError}
          videoStep={videoStep}
          videoPercent={videoPercent}
          videoPrompt={videoPrompt}
          onVideoPromptChange={setVideoPrompt}
          onGenerateVideo={(imageUrl) => void generateVideo(imageUrl)}
        />
      ) : null}
    </>
  );
}
