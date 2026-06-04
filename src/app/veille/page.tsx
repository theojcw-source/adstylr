"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Filter, RefreshCw, Sparkles, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
const CanvasEditorModal = dynamic(() => import("../components/CanvasEditorModal"), { ssr: false });
import { LoadingImage } from "../components/LoadingImage";
import {
  type AtelierColorBlockLayer,
  type AtelierImageTransform,
  type AtelierOverlayConfig,
  type AtelierOverlayGradientConfig,
  type AtelierOverlayTextConfig,
} from "../components/AtelierOverlayEditor";
import { ATELIER_DE_SEVRES_FLUX_2_URL } from "../constants";
import { FAL_FLUX_2_LORA_MODEL } from "../fal-models";
import { createId } from "../utils/misc";

const VEILLE_BRAND_ID = "atelier-de-sevres";
const ATELIER_OVERLAY_DEFAULT_CONFIG: AtelierOverlayConfig = {
  atelierLogo: { assetId: "logo-original", scaleX: 1, scaleY: 1, x: 110, y: 210 },
  eventBlock: { assetId: "event-original", scaleX: 1, scaleY: 1, x: 78, y: 896 },
};
const ATELIER_OVERLAY_DEFAULT_TEXT_CONFIG: AtelierOverlayTextConfig = {
  headline: { fontSize: 70, width: 850, x: 78, y: 1180 },
  cta: { fontSize: 34, width: 440, x: 78, y: 1410 },
};
const VEILLE_LOGO_ONLY_GRADIENTS: AtelierOverlayGradientConfig = {
  bottomOpacity: 0,
  topOpacity: 0,
};
const VEILLE_TEXT_CONFIG: AtelierOverlayTextConfig = {
  headline: {
    ...ATELIER_OVERLAY_DEFAULT_TEXT_CONFIG.headline,
    color: "#ffffff",
    fontStyle: "bold",
    lineHeight: 0.96,
    shadowBlur: 28,
    shadowOffsetY: 12,
    shadowOpacity: 0.35,
    uppercase: false,
  },
  cta: {
    ...ATELIER_OVERLAY_DEFAULT_TEXT_CONFIG.cta,
    color: "#111111",
    fontStyle: "bold",
    lineHeight: 1,
    shadowBlur: 0,
    shadowOpacity: 0,
    uppercase: false,
  },
};
const VEILLE_COPY_MAX_CHARS = 180;
const VEILLE_CTA_MAX_CHARS = 20;
const ATELIER_DA_COLORS: Record<string, string> = {
  black: "#1A1A1A",
  cream: "#F8F5F0",
  gold: "#B8973A",
  graphite: "#4A4A4A",
  terracotta: "#C85A3A",
  white: "#ffffff",
};

function forceVeilleLogoOnlyConfig(config?: Partial<AtelierOverlayConfig>): AtelierOverlayConfig {
  return {
    atelierLogo: config?.atelierLogo ?? ATELIER_OVERLAY_DEFAULT_CONFIG.atelierLogo,
    eventBlock: {
      ...(config?.eventBlock ?? ATELIER_OVERLAY_DEFAULT_CONFIG.eventBlock),
      hidden: true,
    },
  };
}

function getVeilleBrandingConfig({ showCopy }: { showCopy: boolean }, config?: Partial<AtelierOverlayConfig>): AtelierOverlayConfig {
  return {
    atelierLogo: config?.atelierLogo ?? ATELIER_OVERLAY_DEFAULT_CONFIG.atelierLogo,
    eventBlock: {
      ...(config?.eventBlock ?? ATELIER_OVERLAY_DEFAULT_CONFIG.eventBlock),
      hidden: showCopy,
    },
  };
}

type AdGroup = {
  n: number;
  r: number;
  s: string;
  b: string;
  t: string;
  p: string[];
  ta: string[];
  tg: string;
  tl: string[];
  d: Record<string, number[]>;
  ids: string[];
  snapshotIds?: string[];
  previewUrl?: string;
  adLibraryUrl?: string;
  metaKpis?: {
    advertiserCreativeCount?: number;
    libraryRank?: number;
    score?: number;
    scoreBasis?: string;
  };
  metaRank?: number;
  metaScore?: number;
  platform_source?: string;
  video_urls?: string[];
};

type Advertiser = {
  id: string;
  name: string;
  tags: string[];
  pageIds: string[];
  platform: string;
  totalAds: number;
  totalReach: number;
  reach7d?: number;
  collectedAt: string;
  groups: AdGroup[];
};

type AdsData = {
  collectedAt: string | null;
  advertisers: Advertiser[];
};

type GeneratedImage = {
  brandId?: string;
  brandingConfig?: VeilleBrandingSnapshot;
  url?: string;
  cleanUrl?: string;
  brandedUrl?: string;
  id?: string;
};

type VeilleBrandingSnapshot = {
  blocks: AtelierOverlayConfig;
  colorBlocks: AtelierColorBlockLayer[];
  gradients: AtelierOverlayGradientConfig;
  imageTransform: AtelierImageTransform;
  text: {
    cta: string;
    headline: string;
  };
  textConfig: AtelierOverlayTextConfig;
};

type VeilleBrandingRefinement = {
  copy?: string;
  cta?: string;
  reason?: string;
  textConfig?: Partial<AtelierOverlayTextConfig>;
};

type VeilleBrandingRecipe = {
  colorBlocks: AtelierColorBlockLayer[];
  daNotes?: string;
  gradients: AtelierOverlayGradientConfig;
};

type GenerationState = {
  analysis?: string;
  copy?: string;
  cta?: string;
  loraReason?: string;
  loading: boolean;
  phase?: "analyzing" | "generating";
  error?: string;
  images: GeneratedImage[];
  brandingRecipe?: VeilleBrandingRecipe;
  useLora?: boolean;
};

function fmtK(n: number) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".0", "") + "M";
  if (n >= 1_000) return Math.round(n / 1_000).toLocaleString("fr-FR") + "K";
  return n.toLocaleString("fr-FR");
}

function fmtDate(s: string) {
  if (!s) return "";
  return new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function VeillePage() {
  const [data, setData] = useState<AdsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [selectedAdvertiser, setSelectedAdvertiser] = useState<string>("all");
  const [platform, setPlatform] = useState<"all" | "Meta" | "TikTok">("all");
  const [search, setSearch] = useState("");
  const [generations, setGenerations] = useState<Record<string, GenerationState>>({});
  const [activeGeneration, setActiveGeneration] = useState<{
    copy?: string;
    cta?: string;
    generationKey: string;
    images: GeneratedImage[];
    index: number;
    prompt: string;
    sourceName: string;
  } | null>(null);
  const [promptReview, setPromptReview] = useState<{
    analysis: string;
    brandingRecipe?: VeilleBrandingRecipe;
    prompt: string;
    copy: string;
    cta: string;
    group: AdCardGroup;
    loraReason?: string;
    useLora?: boolean;
  } | null>(null);
  const [atelierOverlayConfig, setAtelierOverlayConfig] = useState<AtelierOverlayConfig>(forceVeilleLogoOnlyConfig());
  const [atelierOverlayGradients, setAtelierOverlayGradients] = useState<AtelierOverlayGradientConfig>(VEILLE_LOGO_ONLY_GRADIENTS);
  const [atelierOverlayTextConfig, setAtelierOverlayTextConfig] = useState<AtelierOverlayTextConfig>(VEILLE_TEXT_CONFIG);
  const [atelierImageTransform, setAtelierImageTransform] = useState<AtelierImageTransform>({ scale: 1, x: 0, y: 0 });
  const [atelierImageToolActive, setAtelierImageToolActive] = useState(false);
  const [atelierColorBlocks, setAtelierColorBlocks] = useState<AtelierColorBlockLayer[]>([]);
  const [atelierOverlaySaving, setAtelierOverlaySaving] = useState(false);
  const [atelierOverlayStatus, setAtelierOverlayStatus] = useState("");

  useEffect(() => {
    fetch("/api/veille/ads", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: AdsData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/brand/atelier-overlay", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: ({ blocks?: AtelierOverlayConfig; gradients?: AtelierOverlayGradientConfig } & Partial<AtelierOverlayConfig>) | null) => {
        if (!payload) return;
        setAtelierOverlayConfig(forceVeilleLogoOnlyConfig(payload.blocks ?? (payload as AtelierOverlayConfig)));
        setAtelierOverlayGradients(VEILLE_LOGO_ONLY_GRADIENTS);
        setAtelierOverlayTextConfig(VEILLE_TEXT_CONFIG);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (activeGeneration || promptReview) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
    document.body.style.overflow = "";
    return undefined;
  }, [activeGeneration, promptReview]);

  const allTags = useMemo(() => {
    if (!data) return [];
    const s = new Set<string>();
    data.advertisers.forEach((a) => a.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [data]);

  const filteredAdvertisers = useMemo(() => {
    if (!data) return [];
    return data.advertisers.filter((a) => {
      if (selectedTag !== "all" && !a.tags.includes(selectedTag)) return false;
      if (selectedAdvertiser !== "all" && a.id !== selectedAdvertiser) return false;
      return true;
    });
  }, [data, selectedTag, selectedAdvertiser]);

  const allGroups = useMemo(() => {
    return filteredAdvertisers.flatMap((a) =>
      a.groups
        .filter((g) => {
          if (platform === "Meta" && g.platform_source === "TikTok") return false;
          if (platform === "TikTok" && g.platform_source !== "TikTok") return false;
          if (search) {
            const q = search.toLowerCase();
            if (!g.b.toLowerCase().includes(q) && !a.name.toLowerCase().includes(q)) return false;
          }
          return true;
        })
        .map((g) => ({ ...g, advertiserName: a.name, advertiserId: a.id, advertiserTags: a.tags }))
    ).sort((a, b) => creativeScore(b) - creativeScore(a));
  }, [filteredAdvertisers, platform, search]);

  const totalReach = useMemo(() => allGroups.reduce((s, g) => s + g.r, 0), [allGroups]);

  async function analyzeCreative(group: AdCardGroup) {
    const key = creativeKey(group);
    setGenerations((current) => ({
      ...current,
      [key]: {
        analysis: "Claude analyse la crea concurrente et prepare une piste Atelier de Sevres...",
        images: current[key]?.images ?? [],
        loading: true,
        phase: "analyzing",
      },
    }));

    try {
      const analyzed = await analyzeCreativePrompt(group);
      setGenerations((current) => ({
        ...current,
        [key]: {
          analysis: analyzed.analysis,
          brandingRecipe: analyzed.brandingRecipe,
          copy: analyzed.copy,
          cta: analyzed.cta,
          loraReason: analyzed.loraReason,
          images: current[key]?.images ?? [],
          loading: false,
          useLora: analyzed.useLora,
        },
      }));
      setPromptReview({
        analysis: analyzed.analysis,
        brandingRecipe: analyzed.brandingRecipe,
        copy: analyzed.copy,
        cta: analyzed.cta,
        group,
        loraReason: analyzed.loraReason,
        prompt: analyzed.prompt,
        useLora: analyzed.useLora,
      });
    } catch (error) {
      setGenerations((current) => ({
        ...current,
        [key]: { images: current[key]?.images ?? [], loading: false, error: error instanceof Error ? error.message : "Erreur inconnue" },
      }));
    }
  }

  async function launchGeneration(edited: { copy: string; cta: string; prompt: string }) {
    if (!promptReview) return;
    const { brandingRecipe, group, useLora } = promptReview;
    const { copy, cta, prompt: editedPrompt } = edited;
    const key = creativeKey(group);
    setPromptReview(null);

    setGenerations((current) => ({
      ...current,
      [key]: { ...current[key], images: current[key]?.images ?? [], loading: true, phase: "generating" },
    }));

    try {
      const response = await fetch("/api/comfy/generate", {
        body: JSON.stringify({
          brand_id: VEILLE_BRAND_ID,
          enable_safety_checker: true,
          guidance_scale: 3.5,
          image_size: "portrait_16_9",
          logo_only_branding: true,
          loras: useLora ? [{ path: ATELIER_DE_SEVRES_FLUX_2_URL, scale: 0.8 }] : undefined,
          model: useLora ? FAL_FLUX_2_LORA_MODEL : undefined,
          num_images: 2,
          num_inference_steps: 28,
          output_format: "jpeg",
          prompt: editedPrompt,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { images?: GeneratedImage[]; message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Generation indisponible");
      }

      const images = await applyVeilleBrandingToImages(payload.images ?? [], {
        colorBlocks: brandingRecipe?.colorBlocks ?? atelierColorBlocks,
        copy,
        cta,
        config: getVeilleBrandingConfig({ showCopy: Boolean(copy.trim()) }, atelierOverlayConfig),
        gradients: brandingRecipe?.gradients ?? atelierOverlayGradients,
        imageTransform: atelierImageTransform,
        loras: useLora ? [{ path: ATELIER_DE_SEVRES_FLUX_2_URL, scale: 0.8 }] : [],
        model: useLora ? FAL_FLUX_2_LORA_MODEL : undefined,
        prompt: editedPrompt,
        textConfig: atelierOverlayTextConfig,
      });
      setGenerations((current) => ({
        ...current,
        [key]: { ...current[key], images, loading: false },
      }));
      if (images.length > 0) {
        const refinedText = images[0]?.brandingConfig?.text;
        setActiveGeneration({
          copy: refinedText?.headline ?? copy,
          cta: refinedText?.cta ?? cta,
          generationKey: key,
          images,
          index: 0,
          prompt: editedPrompt,
          sourceName: group.advertiserName,
        });
      }
    } catch (error) {
      setGenerations((current) => ({
        ...current,
        [key]: { images: current[key]?.images ?? [], loading: false, error: error instanceof Error ? error.message : "Erreur inconnue" },
      }));
    }
  }

  function moveActiveGeneration(direction: -1 | 1) {
    setActiveGeneration((current) => {
      if (!current || current.images.length === 0) return current;
      return {
        ...current,
        index: (current.index + direction + current.images.length) % current.images.length,
      };
    });
  }

  async function saveAtelierOverlayConfig(imageUrl?: string) {
    if (!imageUrl || !activeGeneration) return;
    setAtelierOverlaySaving(true);
    setAtelierOverlayStatus("");

    try {
      const showCopy =
        (Boolean(activeGeneration.copy?.trim()) && atelierOverlayTextConfig.headline.hidden !== true) ||
        (Boolean(activeGeneration.cta?.trim()) && atelierOverlayTextConfig.cta.hidden !== true);
      const nextConfig = getVeilleBrandingConfig({ showCopy }, atelierOverlayConfig);
      const nextSnapshot = buildVeilleBrandingSnapshot({
        colorBlocks: atelierColorBlocks,
        config: nextConfig,
        copy: activeGeneration.copy ?? "",
        cta: activeGeneration.cta ?? "",
        gradients: atelierOverlayGradients,
        imageTransform: atelierImageTransform,
        textConfig: atelierOverlayTextConfig,
      });
      const response = await fetch("/api/brand/atelier-overlay", {
        body: JSON.stringify({
          blocks: nextConfig,
          colorBlocks: atelierColorBlocks,
          gradients: atelierOverlayGradients,
          imageTransform: atelierImageTransform,
          imageUrl,
          text: {
            cta: activeGeneration.cta,
            headline: activeGeneration.copy,
          },
          textConfig: atelierOverlayTextConfig,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        brandedUrl?: string | null;
        blocks?: AtelierOverlayConfig;
        gradients?: AtelierOverlayGradientConfig;
      };

      if (!response.ok) {
        throw new Error("Sauvegarde impossible");
      }

      if (!payload.brandedUrl) {
        throw new Error("Application du branding impossible");
      }

      setAtelierOverlayConfig(getVeilleBrandingConfig({ showCopy }, payload.blocks ?? nextConfig));
      setAtelierOverlayGradients(payload.gradients ?? atelierOverlayGradients);
      const activeImage = activeGeneration.images[activeGeneration.index];
      const generationId = activeImage?.id;
      if (generationId) {
        await patchVeilleGeneration(generationId, {
          brand_id: VEILLE_BRAND_ID,
          branded_url: payload.brandedUrl,
          branding_config: nextSnapshot,
          clean_url: activeImage.cleanUrl ?? imageUrl,
          url: payload.brandedUrl,
        });
      }
      setActiveGeneration((current) => {
        if (!current) return current;
        return {
          ...current,
          images: current.images.map((image, index) =>
            index === current.index
              ? {
                  ...image,
                  brandId: VEILLE_BRAND_ID,
                  brandedUrl: payload.brandedUrl ?? image.brandedUrl,
                  brandingConfig: nextSnapshot,
                  cleanUrl: image.cleanUrl ?? imageUrl,
                  url: payload.brandedUrl ?? image.url,
                }
              : image,
          ),
        };
      });
      setGenerations((current) => ({
        ...current,
        [activeGeneration.generationKey]: {
          ...current[activeGeneration.generationKey],
          images: (current[activeGeneration.generationKey]?.images ?? activeGeneration.images).map((image, index) =>
            index === activeGeneration.index
              ? {
                  ...image,
                  brandId: VEILLE_BRAND_ID,
                  brandedUrl: payload.brandedUrl ?? image.brandedUrl,
                  brandingConfig: nextSnapshot,
                  cleanUrl: image.cleanUrl ?? imageUrl,
                  url: payload.brandedUrl ?? image.url,
                }
              : image,
          ),
        },
      }));
      setAtelierOverlayStatus("Branding applique");
    } catch (error) {
      setAtelierOverlayStatus(error instanceof Error ? error.message : "Sauvegarde impossible");
    } finally {
      setAtelierOverlaySaving(false);
    }
  }

  function updateVeilleOverlayConfig(config: AtelierOverlayConfig) {
    setAtelierOverlayConfig((current) => {
      const blockWasEnabled = current.eventBlock.hidden === true && config.eventBlock.hidden !== true;
      if (!blockWasEnabled) {
        return config;
      }

      setAtelierOverlayTextConfig((textConfig) => ({
        ...textConfig,
        headline: { ...textConfig.headline, hidden: true },
        cta: { ...textConfig.cta, hidden: true },
      }));
      return config;
    });
  }

  function updateVeilleTextConfig(textConfig: AtelierOverlayTextConfig) {
    const copyWasEnabled = atelierOverlayTextConfig.headline.hidden === true && textConfig.headline.hidden !== true;
    const ctaWasEnabled = atelierOverlayTextConfig.cta.hidden === true && textConfig.cta.hidden !== true;
    setAtelierOverlayTextConfig(textConfig);
    if (copyWasEnabled || ctaWasEnabled) {
      setAtelierOverlayConfig((config) => ({
        ...config,
        eventBlock: { ...config.eventBlock, hidden: true },
      }));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="animate-spin text-[var(--muted)]" size={24} />
      </div>
    );
  }

  const isEmpty = !data || data.advertisers.length === 0;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <div className="border-b border-[var(--border)] bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">← AdStylr</Link>
          <span className="text-[var(--border)]">/</span>
          <h1 className="font-semibold text-[var(--foreground)]">Veille concurrentielle</h1>
        </div>
        {data?.collectedAt && (
          <span className="text-xs text-[var(--muted)]">
            Collecté le {new Date(data.collectedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </span>
        )}
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {isEmpty ? (
          <EmptyState />
        ) : (
          <>
            {/* Stats bar */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <StatCard label="Annonceurs" value={filteredAdvertisers.length} />
              <StatCard label="Créatifs" value={allGroups.length} />
              <StatCard label="Reach total" value={fmtK(totalReach)} />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
              <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <Filter size={14} />
                <span>Filtres</span>
              </div>

              {/* Platform */}
              <div className="flex gap-1 bg-[var(--surface-2)] rounded-lg p-1">
                {(["all", "Meta", "TikTok"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      platform === p
                        ? "bg-white text-[var(--foreground)] shadow-sm"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {p === "all" ? "Tous" : p}
                  </button>
                ))}
              </div>

              {/* Tag filter */}
              <select
                value={selectedTag}
                onChange={(e) => { setSelectedTag(e.target.value); setSelectedAdvertiser("all"); }}
                className="text-sm border border-[var(--border)] rounded-lg px-3 py-1.5 bg-white text-[var(--foreground)] cursor-pointer"
              >
                <option value="all">Toutes les catégories</option>
                {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>

              {/* Advertiser filter */}
              <select
                value={selectedAdvertiser}
                onChange={(e) => setSelectedAdvertiser(e.target.value)}
                className="text-sm border border-[var(--border)] rounded-lg px-3 py-1.5 bg-white text-[var(--foreground)] cursor-pointer"
              >
                <option value="all">Tous les annonceurs</option>
                {filteredAdvertisers.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>

              {/* Search */}
              <input
                type="text"
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-sm border border-[var(--border)] rounded-lg px-3 py-1.5 bg-white text-[var(--foreground)] min-w-[200px]"
              />
            </div>

            {/* Grid */}
            {allGroups.length === 0 ? (
              <p className="text-center text-[var(--muted)] py-12">Aucun créatif pour ces filtres.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {allGroups.map((g, i) => (
                  <AdCard
                    generation={generations[creativeKey(g)]}
                    key={`${g.advertiserId}-${g.ids[0]}-${i}`}
                    group={g}
                    onGenerate={analyzeCreative}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {promptReview ? (
        <PromptReviewModal
          review={promptReview}
          onGenerate={launchGeneration}
          onClose={() => setPromptReview(null)}
        />
      ) : null}
      {activeGeneration ? (
        <CanvasEditorModal
          active={activeGeneration}
          colorBlocks={atelierColorBlocks}
          config={atelierOverlayConfig}
          gradients={atelierOverlayGradients}
          imageToolActive={atelierImageToolActive}
          imageTransform={atelierImageTransform}
          onChangeConfig={updateVeilleOverlayConfig}
          onChangeColorBlocks={setAtelierColorBlocks}
          onChangeGradients={setAtelierOverlayGradients}
          onChangeImageToolActive={setAtelierImageToolActive}
          onChangeImageTransform={setAtelierImageTransform}
          onChangeText={(patch) => setActiveGeneration((current) => current ? { ...current, ...patch } : current)}
          onChangeTextConfig={updateVeilleTextConfig}
          onClose={() => setActiveGeneration(null)}
          onMove={moveActiveGeneration}
          onBrandedUrl={saveAtelierOverlayConfig}
          saving={atelierOverlaySaving}
          status={atelierOverlayStatus}
          textConfig={atelierOverlayTextConfig}
          title={`Créa générée ${activeGeneration.index + 1} / ${activeGeneration.images.length}`}
        />
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-xl p-4">
      <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-bold text-[var(--foreground)]">{value}</div>
    </div>
  );
}

type AdCardGroup = AdGroup & { advertiserName: string; advertiserId: string; advertiserTags: string[] };

function creativeKey(group: AdCardGroup) {
  return `${group.advertiserId}:${group.ids[0] ?? group.previewUrl ?? group.b}`;
}

function creativeScore(group: Pick<AdGroup, "metaKpis" | "metaScore" | "r">) {
  return group.metaScore ?? group.metaKpis?.score ?? Math.min(100, Math.round((group.r || 0) / 1000));
}

function compactVeilleText(value: string | undefined, fallback: string, maxChars: number) {
  const text = (value?.trim() || fallback).replace(/\s+/g, " ");
  if (text.length <= maxChars) return text;

  const clipped = text.slice(0, maxChars + 1);
  const wordBoundary = clipped.lastIndexOf(" ");
  return clipped.slice(0, wordBoundary > maxChars * 0.58 ? wordBoundary : maxChars).trim().replace(/[,:;.!?]+$/, "");
}

function usableObservedCopy(value: string | undefined, advertiserName: string) {
  const text = value?.trim().replace(/\s+/g, " ") ?? "";
  if (!text) return "";

  const lower = text.toLowerCase();
  if (lower.includes("meta ads library") || lower.includes("crea meta")) return "";
  if (lower === advertiserName.toLowerCase()) return "";
  return compactVeilleText(text, "", VEILLE_COPY_MAX_CHARS);
}

function clampVeilleNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(Math.round(number), min), max);
}

function clampVeilleOpacity(value: unknown, fallback: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(number, 0), 1.2);
}

function normalizeAtelierDaColor(value: unknown) {
  if (typeof value !== "string") return ATELIER_DA_COLORS.cream;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  return ATELIER_DA_COLORS[value.trim().toLowerCase()] ?? ATELIER_DA_COLORS.cream;
}

function normalizeVeilleBrandingRecipe(value: unknown): VeilleBrandingRecipe | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as {
    colorBlocks?: unknown;
    da_notes?: unknown;
    gradients?: { bottomOpacity?: unknown; topOpacity?: unknown };
  };
  const rawBlocks = Array.isArray(source.colorBlocks) ? source.colorBlocks : [];
  const colorBlocks = rawBlocks.slice(0, 8).map((item, index) => {
    const block = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      color: normalizeAtelierDaColor(block.color),
      height: clampVeilleNumber(block.height, 220, 12, 1400),
      id: typeof block.id === "string" && block.id.trim() ? block.id.trim() : `da-css-${index}`,
      opacity: clampVeilleOpacity(block.opacity, 0.85),
      radius: clampVeilleNumber(block.radius, 0, 0, 120),
      width: clampVeilleNumber(block.width, 420, 12, 1400),
      x: clampVeilleNumber(block.x, 78, -200, 1080),
      y: clampVeilleNumber(block.y, 1180, -200, 1920),
    };
  });

  return {
    colorBlocks,
    daNotes: typeof source.da_notes === "string" ? source.da_notes.trim() : undefined,
    gradients: {
      bottomOpacity: clampVeilleOpacity(source.gradients?.bottomOpacity, VEILLE_LOGO_ONLY_GRADIENTS.bottomOpacity),
      topOpacity: clampVeilleOpacity(source.gradients?.topOpacity, VEILLE_LOGO_ONLY_GRADIENTS.topOpacity),
    },
  };
}

async function applyVeilleBrandingToImages(
  images: GeneratedImage[],
  branding: {
    colorBlocks: AtelierColorBlockLayer[];
    config: AtelierOverlayConfig;
    copy: string;
    cta: string;
    gradients: AtelierOverlayGradientConfig;
    imageTransform: AtelierImageTransform;
    loras: unknown[];
    model?: string;
    prompt: string;
    textConfig: AtelierOverlayTextConfig;
  },
) {
  return Promise.all(
    images.map(async (image) => {
      const imageUrl = image.cleanUrl ?? image.url;
      if (!imageUrl) {
        return image;
      }

      try {
        const initialBrandingConfig = buildVeilleBrandingSnapshot({
          colorBlocks: branding.colorBlocks,
          config: branding.config,
          copy: branding.copy,
          cta: branding.cta,
          gradients: branding.gradients,
          imageTransform: branding.imageTransform,
          textConfig: branding.textConfig,
        });
        const initialPayload = await renderVeilleBranding(imageUrl, initialBrandingConfig);
        if (!initialPayload.brandedUrl) {
          return image;
        }

        const refinement = await refineVeilleBrandingSnapshot({
          brandedUrl: initialPayload.brandedUrl,
          copy: branding.copy,
          cta: branding.cta,
          textConfig: branding.textConfig,
        });
        const refinedCopy = refinement?.copy?.trim() || branding.copy;
        const refinedCta = refinement?.cta?.trim() || branding.cta;
        const refinedTextConfig = mergeVeilleTextConfig(branding.textConfig, refinement?.textConfig);
        const brandingConfig = buildVeilleBrandingSnapshot({
          colorBlocks: branding.colorBlocks,
          config: branding.config,
          copy: refinedCopy,
          cta: refinedCta,
          gradients: branding.gradients,
          imageTransform: branding.imageTransform,
          textConfig: refinedTextConfig,
        });
        const finalPayload = refinement
          ? await renderVeilleBranding(imageUrl, brandingConfig)
          : initialPayload;
        const brandedUrl = finalPayload.brandedUrl ?? initialPayload.brandedUrl;

        const persistedImage = {
          ...image,
          brandId: VEILLE_BRAND_ID,
          brandedUrl,
          brandingConfig,
          cleanUrl: image.cleanUrl ?? imageUrl,
          id: image.id ?? createId(),
          url: brandedUrl,
        };
        await persistVeilleGeneration(persistedImage, {
          loras: branding.loras,
          model: branding.model,
          prompt: branding.prompt,
        });
        return persistedImage;
      } catch {
        return image;
      }
    }),
  );
}

function buildVeilleBrandingSnapshot({
  colorBlocks,
  config,
  copy,
  cta,
  gradients,
  imageTransform,
  textConfig,
}: {
  colorBlocks: AtelierColorBlockLayer[];
  config: AtelierOverlayConfig;
  copy: string;
  cta: string;
  gradients: AtelierOverlayGradientConfig;
  imageTransform: AtelierImageTransform;
  textConfig: AtelierOverlayTextConfig;
}): VeilleBrandingSnapshot {
  return {
    blocks: config,
    colorBlocks,
    gradients,
    imageTransform,
    text: {
      cta,
      headline: copy,
    },
    textConfig,
  };
}

function mergeVeilleTextConfig(
  current: AtelierOverlayTextConfig,
  patch?: Partial<AtelierOverlayTextConfig>,
): AtelierOverlayTextConfig {
  if (!patch) return current;

  return {
    cta: {
      ...current.cta,
      fontSize: patch.cta?.fontSize ?? current.cta.fontSize,
      hidden: patch.cta?.hidden ?? current.cta.hidden,
      width: patch.cta?.width ?? current.cta.width,
      x: patch.cta?.x ?? current.cta.x,
      y: patch.cta?.y ?? current.cta.y,
    },
    headline: {
      ...current.headline,
      fontSize: patch.headline?.fontSize ?? current.headline.fontSize,
      hidden: patch.headline?.hidden ?? current.headline.hidden,
      width: patch.headline?.width ?? current.headline.width,
      x: patch.headline?.x ?? current.headline.x,
      y: patch.headline?.y ?? current.headline.y,
    },
  };
}

async function renderVeilleBranding(imageUrl: string, brandingConfig: VeilleBrandingSnapshot) {
  const response = await fetch("/api/brand/atelier-overlay", {
    body: JSON.stringify({
      blocks: brandingConfig.blocks,
      colorBlocks: brandingConfig.colorBlocks,
      gradients: brandingConfig.gradients,
      imageTransform: brandingConfig.imageTransform,
      imageUrl,
      text: {
        cta: brandingConfig.text.cta,
        headline: brandingConfig.text.headline,
      },
      textConfig: brandingConfig.textConfig,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json()) as { brandedUrl?: string | null; thumbnailUrl?: string | null };
  if (!response.ok) {
    return {};
  }
  return payload;
}

async function refineVeilleBrandingSnapshot({
  brandedUrl,
  copy,
  cta,
  textConfig,
}: {
  brandedUrl: string;
  copy: string;
  cta: string;
  textConfig: AtelierOverlayTextConfig;
}): Promise<VeilleBrandingRefinement | null> {
  try {
    const response = await fetch("/api/veille/refine-branding", {
      body: JSON.stringify({
        copy,
        cta,
        imageUrl: brandedUrl,
        textConfig,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) return null;
    return (await response.json()) as VeilleBrandingRefinement;
  } catch {
    return null;
  }
}

async function persistVeilleGeneration(
  image: GeneratedImage,
  metadata: { loras: unknown[]; model?: string; prompt: string },
) {
  if (!image.id || !image.url) return;

  await fetch("/api/generations", {
    body: JSON.stringify({
      brand_id: VEILLE_BRAND_ID,
      branded_url: image.brandedUrl,
      branding_config: image.brandingConfig,
      clean_url: image.cleanUrl,
      id: image.id,
      loras: metadata.loras,
      model: metadata.model,
      prompt: metadata.prompt,
      source: "veille",
      url: image.url,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

async function patchVeilleGeneration(id: string, patch: Record<string, unknown>) {
  await fetch(`/api/generations?id=${encodeURIComponent(id)}`, {
    body: JSON.stringify(patch),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

function buildCreativePrompt(group: AdCardGroup) {
  const tags = group.advertiserTags.length ? `Categorie: ${group.advertiserTags.join(", ")}.` : "";
  const platform = group.platform_source === "TikTok" ? "TikTok" : "Meta/Instagram";
  const copy = group.b ? `Annonce observee: ${group.b}` : "Annonce observee: campagne ecole creative.";

  return [
    "Cree une nouvelle publicite verticale premium pour Atelier de Sevres, ecole d'art et d'animation a Paris.",
    `Reference concurrente a decrire librement: ${group.advertiserName} sur ${platform}.`,
    tags,
    copy,
    "Genere une scene originale d'ecole d'art: etudiants en atelier, gestes creatifs, croquis, peinture, storyboard, animation, matieres, lumiere naturelle.",
    "Direction artistique: photo editoriale contemporaine, vivante, sensible, pas corporate, pas trop litterale.",
    "Aucun texte lisible integre dans l'image, aucune lettre, aucun logo, aucun watermark.",
  ].filter(Boolean).join(" ");
}

async function analyzeCreativePrompt(group: AdCardGroup) {
  const observedCopy = usableObservedCopy(group.b, group.advertiserName);
  const fallbackCopy = observedCopy || "Donnez forme à votre singularité artistique.";
  const fallbackCta = "Candidater";
  const fallback = {
    analysis: "",
    brandingRecipe: undefined,
    copy: fallbackCopy,
    cta: fallbackCta,
    loraReason: "Pas d'analyse Claude disponible.",
    prompt: buildCreativePrompt(group),
    useLora: true,
  };

  if (!group.previewUrl && !group.b) return fallback;

  const response = await fetch("/api/veille/prompt", {
    body: JSON.stringify({
      advertiserName: group.advertiserName,
      copy: group.b,
      imageUrl: group.previewUrl,
      tags: group.advertiserTags,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json()) as {
    analysis?: string;
    branding?: unknown;
    copy?: string;
    cta?: string;
    loraReason?: string;
    message?: string;
    prompt?: string;
    useLora?: boolean;
    visualBrief?: unknown;
  };

  if (!response.ok || !payload.prompt) {
    return fallback;
  }

  return {
    analysis: payload.analysis ?? "",
    brandingRecipe: normalizeVeilleBrandingRecipe(payload.branding),
    copy: compactVeilleText(payload.copy, fallbackCopy, VEILLE_COPY_MAX_CHARS),
    cta: compactVeilleText(payload.cta, fallbackCta, VEILLE_CTA_MAX_CHARS),
    loraReason: payload.loraReason ?? "",
    prompt: payload.prompt,
    useLora: payload.useLora === true,
  };
}

function generationLabel(generation?: GenerationState) {
  if (!generation?.loading) return "Générer";
  return generation.phase === "analyzing" ? "Analyse..." : "IA...";
}

function fullGenerationLabel(generation?: GenerationState) {
  if (!generation?.loading) return "Générer une créa";
  return generation.phase === "analyzing" ? "Analyse Claude..." : "Génération IA...";
}

function AdCard({
  generation,
  group: g,
  onGenerate,
}: {
  generation?: GenerationState;
  group: AdCardGroup;
  onGenerate: (group: AdCardGroup) => void;
}) {
  const isVideo = g.platform_source === "TikTok" && g.video_urls && g.video_urls.length > 0;
  const score = creativeScore(g);
  const rank = g.metaRank ?? g.metaKpis?.libraryRank;
  const advertiserCreativeCount = g.metaKpis?.advertiserCreativeCount;

  return (
    <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden hover:shadow-md transition-shadow group">
      {/* Preview */}
      <div className="relative aspect-square bg-[var(--surface-2)] overflow-hidden">
        {g.previewUrl ? (
          isVideo ? (
            <video
              src={g.previewUrl}
              className="w-full h-full object-cover"
              muted
              playsInline
              onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play()}
              onMouseLeave={(e) => { (e.currentTarget as HTMLVideoElement).pause(); (e.currentTarget as HTMLVideoElement).currentTime = 0; }}
            />
          ) : (
            <LoadingImage alt="" className="w-full h-full object-cover" src={g.previewUrl} wrapperClassName="block" />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--muted)] text-xs text-center px-4">
            {g.b.slice(0, 80) || "Pas d'aperçu"}
          </div>
        )}

        {/* Platform badge */}
        <div className="absolute top-2 left-2">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
            g.platform_source === "TikTok"
              ? "bg-black text-white"
              : "bg-[#1877F2] text-white"
          }`}>
            {g.platform_source === "TikTok" ? "TikTok" : "Meta"}
          </span>
        </div>

        <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--foreground)]">
          Score {score}/100
        </div>

        {/* Reach badge */}
        {g.r > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-md">
            <TrendingUp size={10} />
            {fmtK(g.r)}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end justify-center pb-3 opacity-0 group-hover:opacity-100">
          <div className="flex gap-2">
            <button
              className="flex items-center gap-1.5 bg-[var(--blue)] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[var(--blue-hover)] transition-colors disabled:opacity-70"
              disabled={generation?.loading}
              onClick={() => onGenerate(g)}
              type="button"
            >
              <Sparkles className={generation?.loading ? "animate-spin" : ""} size={12} />
              {generationLabel(generation)}
            </button>
            {g.adLibraryUrl && (
              <a
                href={g.adLibraryUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 bg-white/90 text-[var(--foreground)] text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-white transition-colors"
              >
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="text-[11px] font-semibold text-[var(--blue)] mb-1 truncate">{g.advertiserName}</div>
        {g.b && (
          <p className="text-[11px] text-[var(--foreground)] line-clamp-3 leading-snug mb-2">{g.b}</p>
        )}
        <div className="mb-2 grid grid-cols-3 gap-1">
          <KpiPill label="Score" value={`${score}`} />
          <KpiPill label="Rang" value={rank ? `#${rank}` : "-"} />
          <KpiPill label="Volume" value={advertiserCreativeCount ? `${advertiserCreativeCount}` : `${g.n}`} />
        </div>
        <div className="flex items-center justify-between text-[10px] text-[var(--muted)]">
          <span>{g.n} variante{g.n > 1 ? "s" : ""}</span>
          {g.s && <span>{fmtDate(g.s)}</span>}
        </div>
        <button
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--blue)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--blue-hover)] disabled:opacity-70"
          disabled={generation?.loading}
          onClick={() => onGenerate(g)}
          type="button"
        >
          <Sparkles className={generation?.loading ? "animate-spin" : ""} size={13} />
          {fullGenerationLabel(generation)}
        </button>
        {generation?.analysis ? (
          <div className="mt-2 rounded-lg bg-[var(--surface-2)] p-2">
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--muted)]">Pensée Claude</p>
            <p className="line-clamp-4 text-[10px] leading-snug text-[var(--foreground)]">{generation.analysis}</p>
            {generation.loraReason && !generation.loading ? (
              <p className="mt-1 line-clamp-2 text-[9px] leading-snug text-[var(--muted)]">
                Style ADS: {generation.useLora ? "oui" : "non"} - {generation.loraReason}
              </p>
            ) : null}
          </div>
        ) : null}
        {generation?.error && (
          <p className="mt-2 text-[10px] text-red-600 line-clamp-2">{generation.error}</p>
        )}
        {generation?.images.length ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {generation.images.map((image, index) => (
              <a
                href={image.brandedUrl ?? image.url}
                key={`${image.url ?? image.brandedUrl}-${index}`}
                rel="noreferrer"
                target="_blank"
                className="block aspect-[9/16] overflow-hidden rounded-lg bg-[var(--surface-2)]"
              >
                <LoadingImage
                  alt=""
                  className="h-full w-full object-cover"
                  src={image.brandedUrl ?? image.url ?? ""}
                  wrapperClassName="block"
                />
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function KpiPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface-2)] px-2 py-1">
      <div className="text-[9px] uppercase text-[var(--muted)]">{label}</div>
      <div className="text-[11px] font-semibold text-[var(--foreground)]">{value}</div>
    </div>
  );
}

function PromptReviewModal({
  review,
  onGenerate,
  onClose,
}: {
  review: {
    analysis: string;
    brandingRecipe?: VeilleBrandingRecipe;
    copy: string;
    cta: string;
    group: AdCardGroup;
    loraReason?: string;
    prompt: string;
    useLora?: boolean;
  };
  onGenerate: (edited: { copy: string; cta: string; prompt: string }) => void;
  onClose: () => void;
}) {
  const [editedPrompt, setEditedPrompt] = useState(review.prompt);
  const [editedCopy, setEditedCopy] = useState(review.copy);
  const [editedCta, setEditedCta] = useState(review.cta);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const generatePayload = { copy: editedCopy, cta: editedCta, prompt: editedPrompt };

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="cem-overlay" onClick={onClose}>
      <div className="cem-shell" onClick={(e) => e.stopPropagation()}>
        <div className="cem-header">
          <div className="cem-header-left">
            <span className="cem-title">Analyse de la créa</span>
            <span className="cem-source">{review.group.advertiserName}</span>
          </div>
          <div className="cem-header-right">
            <button
              className="cem-header-btn"
              disabled={!editedPrompt.trim() || !editedCopy.trim()}
              onClick={() => onGenerate(generatePayload)}
              type="button"
            >
              <Sparkles size={13} />
              Générer
            </button>
            <button className="cem-header-btn" onClick={onClose} type="button"><X size={16} /></button>
          </div>
        </div>

        <div className="cem-body">
          <aside className="cem-sidebar">
            <div className="cem-section-title">Réflexion Claude</div>
            <p className="text-xs leading-relaxed text-[var(--foreground)] whitespace-pre-wrap">
              {review.analysis || "Claude a préparé une piste à partir de la créa source."}
            </p>
            <div className="cem-divider" />
            <div className="cem-section-title">Décision</div>
            <p className="text-xs font-semibold text-[var(--foreground)]">
              Style Atelier de Sèvres {review.useLora ? "activé" : "non appliqué"}
            </p>
            {review.loraReason ? <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">{review.loraReason}</p> : null}
            {review.brandingRecipe ? (
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
                DA captée: {review.brandingRecipe.daNotes || `${review.brandingRecipe.colorBlocks.length} élément(s) CSS Atelier`}
              </p>
            ) : null}
          </aside>

          <main className="cem-canvas-wrap items-stretch justify-center">
            <div className="w-full max-w-3xl rounded-lg border border-[var(--border)] bg-white p-5 shadow-sm">
              <label className="cem-copy-field">
                <span>Copy Atelier</span>
                <textarea
                  onChange={(e) => setEditedCopy(e.target.value)}
                  rows={5}
                  value={editedCopy}
                />
              </label>
              <label className="cem-copy-field">
                <span>CTA</span>
                <textarea
                  onChange={(e) => setEditedCta(e.target.value)}
                  rows={2}
                  value={editedCta}
                />
              </label>
              <label className="cem-copy-field">
                <span>Prompt de génération</span>
                <textarea
                  ref={textareaRef}
                  onChange={(e) => setEditedPrompt(e.target.value)}
                  rows={8}
                  value={editedPrompt}
                />
              </label>
              <div className="modal-actions">
                <button className="button ghost" onClick={onClose} type="button">
                  Annuler
                </button>
                <button
                  className="button primary"
                  disabled={!editedPrompt.trim() || !editedCopy.trim()}
                  onClick={() => onGenerate(generatePayload)}
                  type="button"
                >
                  <Sparkles size={14} />
                  Générer en text-to-img
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 bg-[var(--surface-2)] rounded-2xl flex items-center justify-center mb-4">
        <TrendingUp size={28} className="text-[var(--muted)]" />
      </div>
      <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Aucune donnée collectée</h2>
      <p className="text-sm text-[var(--muted)] max-w-md mb-6">
        Lance la collecte Meta depuis GitHub Actions pour commencer la veille.
        Les données se mettront à jour automatiquement chaque jour à 6h.
      </p>
      <div className="bg-[var(--surface-2)] rounded-xl p-4 text-left text-sm font-mono text-[var(--foreground)] max-w-sm">
        <p className="text-[var(--muted)] text-xs mb-2"># Variables d&apos;env requises</p>
        <p>META_ACCESS_TOKEN=...</p>
        <p>BLOB_READ_WRITE_TOKEN=...</p>
      </div>
    </div>
  );
}
