"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Check, Download, Eye, EyeOff, Hand, RefreshCw, Square, Trash2, X } from "lucide-react";
import {
  ATELIER_OVERLAY_BLOCKS,
  AtelierOverlayEditor,
  type AtelierColorBlockLayer,
  type AtelierFreeTextLayer,
  type AtelierImageTransform,
  type AtelierOverlayBlock,
  type AtelierOverlayBlockId,
  type AtelierOverlayConfig,
  type AtelierOverlayGradientConfig,
  type AtelierOverlayTextBlock,
  type AtelierOverlayTextBlockId,
  type AtelierOverlayTextConfig,
} from "./AtelierOverlayEditor";
import { LoadingImage } from "./LoadingImage";
import { ATELIER_ASSETS, type AtelierAssetId } from "../atelierAssets";

// ── Types ──────────────────────────────────────────────────────────
export type CanvasImage = { url?: string; cleanUrl?: string; brandedUrl?: string };
export type CanvasEditorActive = {
  copy?: string; cta?: string;
  images: CanvasImage[];
  index: number;
  prompt: string;
  sourceName: string;
};

// ── Brand presets ─────────────────────────────────────────────────
const ADS_COLORS = ["#ffffff", "#000000", "#f7a964", "#009a68"];
const TEXT_PRESETS: Array<{ label: string; fill: string; preset: Omit<AtelierFreeTextLayer, "id" | "text"> }> = [
  { label: "Titre",      fill: "#ffffff", preset: { color: "#ffffff", fontSize: 80, fontStyle: "bold",   uppercase: true,  width: 900, x: 78, y: 380,  lineHeight: 0.96, textAlign: "left" } },
  { label: "Sous-titre", fill: "#ffffff", preset: { color: "#ffffff", fontSize: 50, fontStyle: "normal", uppercase: false, width: 900, x: 78, y: 580,  lineHeight: 1.1,  textAlign: "left" } },
  { label: "Corps",      fill: "#f1f0f0", preset: { color: "#f1f0f0", fontSize: 32, fontStyle: "normal", uppercase: false, width: 900, x: 78, y: 750,  lineHeight: 1.3,  textAlign: "left" } },
  { label: "Tag Art",    fill: "#f7a964", preset: { color: "#f7a964", fontSize: 26, fontStyle: "bold",   uppercase: true,  width: 600, x: 78, y: 1580, lineHeight: 1,    textAlign: "left" } },
  { label: "Tag Anim",   fill: "#009a68", preset: { color: "#009a68", fontSize: 26, fontStyle: "bold",   uppercase: true,  width: 600, x: 78, y: 1580, lineHeight: 1,    textAlign: "left" } },
];

// ── Sub-components ────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="cem-section-title">{children}</div>;
}

function TextBlockControls({ block, id, label, onChange }: {
  block: AtelierOverlayTextBlock;
  id: AtelierOverlayTextBlockId;
  label: string;
  onChange: (patch: Partial<AtelierOverlayTextBlock>) => void;
}) {
  const isBold = (block.fontStyle ?? "bold").includes("bold");
  const color = block.color ?? (id === "cta" ? "#111111" : "#ffffff");
  const backgroundColor = block.backgroundColor ?? "#f1f0f0";
  return (
    <div className="cem-text-block">
      <div className="cem-text-block-header">
        <span className="cem-text-label">{label}</span>
        <div className="cem-text-size">
          <button className="cem-size-btn" onClick={() => onChange({ fontSize: Math.max(10, block.fontSize - 2) })}>−</button>
          <span className="cem-size-val">{Math.round(block.fontSize)}</span>
          <button className="cem-size-btn" onClick={() => onChange({ fontSize: Math.min(200, block.fontSize + 2) })}>+</button>
        </div>
      </div>
      <div className="cem-text-controls">
        <button className={`cem-style-btn${isBold ? " active" : ""}`} onClick={() => onChange({ fontStyle: isBold ? "normal" : "bold" })}>B</button>
        <button className={`cem-style-btn${block.uppercase ? " active" : ""}`} onClick={() => onChange({ uppercase: !block.uppercase })}>Aa</button>
        <div className="cem-colors">
          {ADS_COLORS.map((c) => (
            <button key={c} className={`cem-color-swatch${color === c ? " active" : ""}`} style={{ background: c }} onClick={() => onChange({ color: c })} />
          ))}
          <input type="color" value={color} onChange={(e) => onChange({ color: e.target.value })} className="cem-color-input" />
        </div>
        {id === "cta" ? (
          <div className="cem-colors" aria-label="Fond CTA">
            {ADS_COLORS.map((c) => (
              <button
                aria-label={`Fond CTA ${c}`}
                className={`cem-color-swatch${backgroundColor === c ? " active" : ""}`}
                key={c}
                onClick={() => onChange({ backgroundColor: c })}
                style={{ background: c }}
                type="button"
              />
            ))}
            <input
              aria-label="Fond CTA"
              className="cem-color-input"
              onChange={(e) => onChange({ backgroundColor: e.target.value })}
              type="color"
              value={backgroundColor}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function withToggledBlockShadow(block: AtelierOverlayBlock): AtelierOverlayBlock {
  const nextEnabled = block.shadowEnabled !== true;
  return {
    ...block,
    shadowBlur: block.shadowBlur ?? 36,
    shadowEnabled: nextEnabled,
    shadowOffsetY: block.shadowOffsetY ?? 18,
    shadowOpacity: block.shadowOpacity ?? 0.32,
  };
}

type ShadowTarget =
  | { id: AtelierOverlayBlockId; label: string; type: "block" }
  | { id: AtelierOverlayTextBlockId; label: string; type: "text" };

function ShadowControls({ onClose, onUpdateBlock, onUpdateText, target, value }: {
  onClose: () => void;
  onUpdateBlock: (patch: Partial<AtelierOverlayBlock>) => void;
  onUpdateText: (patch: Partial<AtelierOverlayTextBlock>) => void;
  target: ShadowTarget;
  value: AtelierOverlayBlock | AtelierOverlayTextBlock;
}) {
  const blur = value.shadowBlur ?? (target.type === "block" ? 36 : target.id === "cta" ? 0 : 12);
  const opacity = value.shadowOpacity ?? (target.type === "block" ? 0.32 : target.id === "cta" ? 0 : 0.45);
  const offsetY = value.shadowOffsetY ?? (target.type === "block" ? 18 : target.id === "cta" ? 0 : 8);
  const update = target.type === "block" ? onUpdateBlock : onUpdateText;

  return (
    <div className="cem-shadow-panel">
      <div className="cem-shadow-panel-head">
        <span>Ombre {target.label}</span>
        <button className="cem-layer-eye" onClick={onClose} type="button"><X size={12} /></button>
      </div>
      <label className="cem-grad-row cem-shadow-row">
        <span>Flou</span>
        <input max={72} min={0} onChange={(e) => update({ shadowBlur: Number(e.target.value) })} step={1} type="range" value={blur} />
        <span className="cem-grad-val">{Math.round(blur)}</span>
      </label>
      <label className="cem-grad-row cem-shadow-row">
        <span>Force</span>
        <input max={1} min={0} onChange={(e) => update({ shadowOpacity: Number(e.target.value) })} step={0.05} type="range" value={opacity} />
        <span className="cem-grad-val">{opacity.toFixed(2)}</span>
      </label>
      <label className="cem-grad-row cem-shadow-row">
        <span>Y</span>
        <input max={80} min={-40} onChange={(e) => update({ shadowOffsetY: Number(e.target.value) })} step={1} type="range" value={offsetY} />
        <span className="cem-grad-val">{Math.round(offsetY)}</span>
      </label>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────
export function CanvasEditorModal({
  active,
  colorBlocks = [],
  config,
  extraFooter,
  freeLayers = [],
  gradients,
  imageToolActive = false,
  imageTransform,
  onChangeConfig,
  onChangeColorBlocks,
  onChangeFreeLayers,
  onChangeGradients,
  onChangeImageToolActive,
  onChangeImageTransform,
  onChangeText,
  onChangeTextConfig,
  onClose,
  onMove,
  onRemove,
  onBrandedUrl,
  saving: savingProp = false,
  status = "",
  textConfig,
  title,
}: {
  active: CanvasEditorActive;
  colorBlocks?: AtelierColorBlockLayer[];
  config?: AtelierOverlayConfig;
  extraFooter?: React.ReactNode;
  freeLayers?: AtelierFreeTextLayer[];
  gradients?: AtelierOverlayGradientConfig;
  imageToolActive?: boolean;
  imageTransform?: AtelierImageTransform;
  onChangeConfig?: (c: AtelierOverlayConfig) => void;
  onChangeColorBlocks?: (layers: AtelierColorBlockLayer[]) => void;
  onChangeFreeLayers?: (layers: AtelierFreeTextLayer[]) => void;
  onChangeGradients?: (g: AtelierOverlayGradientConfig) => void;
  onChangeImageToolActive?: (active: boolean) => void;
  onChangeImageTransform?: (transform: AtelierImageTransform) => void;
  onChangeText?: (patch: { copy?: string; cta?: string }) => void;
  onChangeTextConfig?: (c: AtelierOverlayTextConfig) => void;
  onClose: () => void;
  onMove?: (d: -1 | 1) => void;
  onRemove?: () => void;
  onBrandedUrl?: (url: string) => Promise<void> | void;
  saving?: boolean;
  status?: string;
  textConfig?: AtelierOverlayTextConfig;
  title?: string;
}) {
  const [saving, setSaving] = useState(savingProp);
  const [shadowTarget, setShadowTarget] = useState<ShadowTarget | null>(null);
  const activeImage = active.images[active.index];
  const cleanUrl = activeImage?.cleanUrl ?? activeImage?.url;
  const brandedUrl = activeImage?.brandedUrl ?? activeImage?.url;
  const canEdit = Boolean(config && textConfig && gradients && cleanUrl && onChangeConfig && onChangeTextConfig && onChangeGradients);
  const modalTitle = title ?? `Résultat ${active.index + 1} / ${active.images.length}`;

  async function handleSave() {
    setSaving(true);
    try {
      await onBrandedUrl?.(cleanUrl ?? "");
    } finally {
      setSaving(false);
    }
  }

  function setBlockHidden(id: AtelierOverlayBlockId, hidden: boolean) {
    if (!config || !onChangeConfig) return;
    onChangeConfig({ ...config, [id]: { ...config[id], hidden } });
  }
  function toggleBlockShadow(id: AtelierOverlayBlockId) {
    if (!config || !onChangeConfig) return;
    onChangeConfig({ ...config, [id]: withToggledBlockShadow(config[id]) });
  }
  function toggleTextShadow(id: AtelierOverlayTextBlockId) {
    if (!textConfig || !onChangeTextConfig) return;
    const block = textConfig[id];
    const enabled = (block.shadowBlur ?? 0) > 0 && (block.shadowOpacity ?? 0) > 0;
    onChangeTextConfig({
      ...textConfig,
      [id]: {
        ...block,
        shadowBlur: enabled ? 0 : id === "cta" ? 18 : 36,
        shadowOffsetY: block.shadowOffsetY ?? (id === "cta" ? 8 : 18),
        shadowOpacity: enabled ? 0 : id === "cta" ? 0.25 : 0.32,
      },
    });
  }
  function setTextHidden(id: "headline" | "cta", hidden: boolean) {
    if (!textConfig || !onChangeTextConfig) return;
    onChangeTextConfig({ ...textConfig, [id]: { ...textConfig[id], hidden } });
  }
  function updateTextBlock(id: AtelierOverlayTextBlockId, patch: Partial<AtelierOverlayTextBlock>) {
    if (!textConfig || !onChangeTextConfig) return;
    onChangeTextConfig({ ...textConfig, [id]: { ...textConfig[id], ...patch } });
  }

  return (
    <div className="cem-overlay">
      <div className="cem-shell">

        {/* Header */}
        <div className="cem-header">
          <div className="cem-header-left">
            {active.images.length > 1 && onMove ? (
              <div className="cem-nav">
                <button className="cem-nav-btn" onClick={() => onMove(-1)}><ChevronLeft size={14} /></button>
                <span className="cem-nav-label">{active.index + 1}/{active.images.length}</span>
                <button className="cem-nav-btn" onClick={() => onMove(1)}><ChevronRight size={14} /></button>
              </div>
            ) : null}
            <span className="cem-title">{modalTitle}</span>
            {active.sourceName ? <span className="cem-source">{active.sourceName}</span> : null}
          </div>
          <div className="cem-header-right">
            {cleanUrl ? <a className="cem-header-btn" href={cleanUrl} rel="noreferrer" target="_blank"><Download size={13} />Clean</a> : null}
            {brandedUrl && brandedUrl !== cleanUrl ? <a className="cem-header-btn" href={brandedUrl} rel="noreferrer" target="_blank"><Download size={13} />Brandé</a> : null}
            {onRemove ? <button className="cem-header-btn danger" onClick={onRemove}><Trash2 size={13} /></button> : null}
            <button className="cem-header-btn" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {/* Body */}
        <div className="cem-body">

          {/* Sidebar */}
          <aside className="cem-sidebar">

            {onChangeFreeLayers ? (
              <>
                <SectionTitle>Ajouter un texte</SectionTitle>
                <div className="cem-presets">
                  {TEXT_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      className="cem-preset-btn"
                      style={{ color: ["#ffffff", "#f1f0f0"].includes(p.fill) ? "var(--foreground)" : p.fill }}
                      onClick={() => onChangeFreeLayers([...(freeLayers ?? []), { ...p.preset, id: crypto.randomUUID(), text: p.label }])}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="cem-divider" />
              </>
            ) : null}
            <SectionTitle>Photo</SectionTitle>
            <button
              className={`cem-tool-btn${imageToolActive ? " active" : ""}`}
              onClick={() => onChangeImageToolActive?.(!imageToolActive)}
              type="button"
            >
              <Hand size={13} /> Main
            </button>
            {imageTransform && onChangeImageTransform ? (
              <label className="cem-grad-row cem-zoom-row">
                <span>Zoom</span>
                <input
                  max={1.6}
                  min={1}
                  onChange={(e) => onChangeImageTransform({ ...imageTransform, scale: Number(e.target.value) })}
                  step={0.05}
                  type="range"
                  value={imageTransform.scale}
                />
                <span className="cem-grad-val">{imageTransform.scale.toFixed(2)}</span>
              </label>
            ) : null}

            <div className="cem-divider" />
            <SectionTitle>Carrés couleur</SectionTitle>
            <div className="cem-color-blocks">
              {ADS_COLORS.map((color) => (
                <button
                  className="cem-color-block-btn"
                  key={color}
                  onClick={() => onChangeColorBlocks?.([
                    ...colorBlocks,
                    { color, height: 240, id: crypto.randomUUID(), width: 240, x: 78, y: 780 },
                  ])}
                  style={{ background: color }}
                  type="button"
                >
                  <Square size={12} />
                </button>
              ))}
            </div>

            {canEdit && config && textConfig && gradients && onChangeConfig && onChangeTextConfig && onChangeGradients ? (
              <>
                <div className="cem-divider" />

                {/* Calques */}
                <SectionTitle>Calques</SectionTitle>
                <div className="cem-layers">
                  {ATELIER_OVERLAY_BLOCKS.map((block) => (
                    <div key={block.id} className="cem-layer-row">
                      <span className="cem-layer-label">{block.label === "Logo" ? "🏷 Logo" : "🔲 Bloc"}</span>
                      <button
                        className={`cem-shadow-toggle${config[block.id]?.shadowEnabled ? " active" : ""}`}
                        onDoubleClick={() => setShadowTarget({ id: block.id, label: block.label, type: "block" })}
                        onClick={() => toggleBlockShadow(block.id)}
                        type="button"
                      >
                        Ombre
                      </button>
                      <button className="cem-layer-eye" onClick={() => setBlockHidden(block.id, !config[block.id]?.hidden)}>
                        {config[block.id]?.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  ))}
                  <div className="cem-layer-row">
                    <span className="cem-layer-label">T Copy</span>
                    <button
                      className={`cem-shadow-toggle${(textConfig.headline.shadowBlur ?? 0) > 0 && (textConfig.headline.shadowOpacity ?? 0) > 0 ? " active" : ""}`}
                      onClick={() => toggleTextShadow("headline")}
                      onDoubleClick={() => setShadowTarget({ id: "headline", label: "Copy", type: "text" })}
                      type="button"
                    >
                      Ombre
                    </button>
                    <button className="cem-layer-eye" onClick={() => setTextHidden("headline", !textConfig.headline.hidden)}>
                      {textConfig.headline.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <div className="cem-layer-row">
                    <span className="cem-layer-label">T CTA</span>
                    <button
                      className={`cem-shadow-toggle${(textConfig.cta.shadowBlur ?? 0) > 0 && (textConfig.cta.shadowOpacity ?? 0) > 0 ? " active" : ""}`}
                      onClick={() => toggleTextShadow("cta")}
                      onDoubleClick={() => setShadowTarget({ id: "cta", label: "CTA", type: "text" })}
                      type="button"
                    >
                      Ombre
                    </button>
                    <button className="cem-layer-eye" onClick={() => setTextHidden("cta", !textConfig.cta.hidden)}>
                      {textConfig.cta.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  {freeLayers.map((l) => (
                    <div key={l.id} className="cem-layer-row">
                      <span className="cem-layer-label" style={{ color: ["#ffffff", "#f1f0f0"].includes(l.color) ? undefined : l.color }}>
                        T {l.text.slice(0, 16)}
                      </span>
                      <button className="cem-layer-eye" onClick={() => onChangeFreeLayers?.(freeLayers.filter((x) => x.id !== l.id))}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                  {colorBlocks.map((l) => (
                    <div key={l.id} className="cem-layer-row">
                      <span className="cem-layer-label" style={{ color: ["#ffffff", "#f1f0f0"].includes(l.color) ? undefined : l.color }}>
                        ■ Carré
                      </span>
                      <button className="cem-layer-eye" onClick={() => onChangeColorBlocks?.(colorBlocks.filter((x) => x.id !== l.id))}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>

                {shadowTarget ? (
                  <ShadowControls
                    onClose={() => setShadowTarget(null)}
                    onUpdateBlock={(patch) => {
                      if (!config || shadowTarget.type !== "block") return;
                      onChangeConfig({ ...config, [shadowTarget.id]: { ...config[shadowTarget.id], ...patch, shadowEnabled: true } });
                    }}
                    onUpdateText={(patch) => {
                      if (!textConfig || shadowTarget.type !== "text") return;
                      onChangeTextConfig({ ...textConfig, [shadowTarget.id]: { ...textConfig[shadowTarget.id], ...patch } });
                    }}
                    target={shadowTarget}
                    value={shadowTarget.type === "block" ? config[shadowTarget.id] : textConfig[shadowTarget.id]}
                  />
                ) : null}

                <div className="cem-divider" />

                {/* Text formatting */}
                <SectionTitle>Texte</SectionTitle>
                <TextBlockControls block={textConfig.headline} id="headline" label="Headline" onChange={(p) => updateTextBlock("headline", p)} />
                <TextBlockControls block={textConfig.cta} id="cta" label="CTA" onChange={(p) => updateTextBlock("cta", p)} />

                <div className="cem-divider" />

                {/* Gradients */}
                <SectionTitle>Gradients</SectionTitle>
                <label className="cem-grad-row">
                  <span>Haut</span>
                  <input type="range" min={0} max={1.6} step={0.05} value={gradients.topOpacity}
                    onChange={(e) => onChangeGradients({ ...gradients, topOpacity: Number(e.target.value) })} />
                  <span className="cem-grad-val">{gradients.topOpacity.toFixed(2)}</span>
                </label>
                <label className="cem-grad-row">
                  <span>Bas</span>
                  <input type="range" min={0} max={1.6} step={0.05} value={gradients.bottomOpacity}
                    onChange={(e) => onChangeGradients({ ...gradients, bottomOpacity: Number(e.target.value) })} />
                  <span className="cem-grad-val">{gradients.bottomOpacity.toFixed(2)}</span>
                </label>

                <div className="cem-divider" />

                {/* Assets */}
                <SectionTitle>Assets</SectionTitle>
                {ATELIER_OVERLAY_BLOCKS.map((block) => (
                  <div key={block.id} className="cem-asset-row">
                    <span className="cem-asset-label">{block.label}</span>
                    <select
                      className="cem-asset-select"
                      value={(config[block.id] as AtelierOverlayBlock & { assetId?: AtelierAssetId }).assetId ?? block.defaultAssetId}
                      onChange={(e) => onChangeConfig({ ...config, [block.id]: { ...config[block.id], assetId: e.target.value as AtelierAssetId } })}
                    >
                      {ATELIER_ASSETS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                  </div>
                ))}

                <div className="cem-divider" />

                {/* Save */}
                <button
                  className="button primary"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  style={{ width: "100%" }}
                  type="button"
                >
                  {saving ? <RefreshCw className="animate-spin" size={14} /> : <Check size={14} />}
                  Appliquer le branding
                </button>
                {status ? <small className="cem-status">{status}</small> : null}
              </>
            ) : null}
          </aside>

          {/* Canvas */}
          <main className="cem-canvas-wrap">
            {canEdit && config && gradients && textConfig && onChangeConfig && onChangeTextConfig ? (
              <AtelierOverlayEditor
                backgroundUrl={cleanUrl}
                colorBlocks={colorBlocks}
                config={config}
                freeLayers={freeLayers}
                gradients={gradients}
                imageToolActive={imageToolActive}
                imageTransform={imageTransform}
                onChange={onChangeConfig}
                onChangeColorBlocks={onChangeColorBlocks}
                onChangeFreeLayers={onChangeFreeLayers}
                onChangeImageTransform={onChangeImageTransform}
                onChangeText={onChangeText ? (id, value) => onChangeText(id === "headline" ? { copy: value } : { cta: value }) : undefined}
                onChangeTextConfig={onChangeTextConfig}
                showAssetSwitcher={false}
                text={{ cta: active.cta, headline: active.copy }}
                textConfig={textConfig}
              />
            ) : (
              <LoadingImage
                alt="Résultat"
                className="result-loading-img"
                loading="eager"
                src={brandedUrl ?? cleanUrl}
                style={{ maxHeight: "100%", maxWidth: "100%", borderRadius: 4, boxShadow: "0 4px 24px rgba(0,0,0,0.15)", objectFit: "contain" }}
                wrapperClassName="result-loading-image"
              />
            )}
          </main>
        </div>

        {extraFooter ? <div className="cem-extra-footer">{extraFooter}</div> : null}
      </div>
    </div>
  );
}

export default CanvasEditorModal;
