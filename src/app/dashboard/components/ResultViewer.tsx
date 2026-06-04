import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  Film,
  LoaderCircle,
  RefreshCcw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  ATELIER_OVERLAY_BLOCKS,
  AtelierOverlayEditor,
  type AtelierColorBlockLayer,
  type AtelierImageTransform,
  type AtelierOverlayBlock,
  type AtelierOverlayConfig,
  type AtelierOverlayGradientConfig,
  type AtelierOverlayTextBlock,
  type AtelierOverlayTextBlockId,
  type AtelierOverlayTextConfig,
  type AtelierOverlayTextContent,
} from "../../components/AtelierOverlayEditor";
import { LoadingImage } from "../../components/LoadingImage";
import { ATELIER_ASSETS } from "../../atelierAssets";
import type { GeneratedImage } from "../../types";
import type { BrandingSnapshot, ShadowPanelState } from "../types";
import { getDisplayImageUrl } from "../utils/board";

const ADS_CHARTER_COLORS = ["#ffffff", "#000000", "#f7a964", "#009a68"];

function TextBlockControls({
  block,
  id,
  label,
  onChange,
}: {
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
          <button className="cem-size-btn" onClick={() => onChange({ fontSize: Math.max(10, block.fontSize - 2) })} type="button">-</button>
          <span className="cem-size-val">{Math.round(block.fontSize)}</span>
          <button className="cem-size-btn" onClick={() => onChange({ fontSize: Math.min(200, block.fontSize + 2) })} type="button">+</button>
        </div>
      </div>
      <div className="cem-text-controls">
        <button className={`cem-style-btn${isBold ? " active" : ""}`} onClick={() => onChange({ fontStyle: isBold ? "normal" : "bold" })} type="button">B</button>
        <button className={`cem-style-btn${block.uppercase ? " active" : ""}`} onClick={() => onChange({ uppercase: !block.uppercase })} type="button">Aa</button>
        <div className="cem-colors">
          {ADS_CHARTER_COLORS.map((nextColor) => (
            <button
              aria-label={`Couleur ${nextColor}`}
              className={`cem-color-swatch${color === nextColor ? " active" : ""}`}
              key={nextColor}
              onClick={() => onChange({ color: nextColor })}
              style={{ background: nextColor }}
              type="button"
            />
          ))}
          <input
            aria-label={`Couleur ${label}`}
            className="cem-color-input"
            onChange={(event) => onChange({ color: event.target.value })}
            type="color"
            value={color}
          />
        </div>
        {id === "cta" ? (
          <div className="cem-colors" aria-label="Fond CTA">
            {ADS_CHARTER_COLORS.map((nextColor) => (
              <button
                aria-label={`Fond CTA ${nextColor}`}
                className={`cem-color-swatch${backgroundColor === nextColor ? " active" : ""}`}
                key={nextColor}
                onClick={() => onChange({ backgroundColor: nextColor })}
                style={{ background: nextColor }}
                type="button"
              />
            ))}
            <input
              aria-label="Fond CTA"
              className="cem-color-input"
              onChange={(event) => onChange({ backgroundColor: event.target.value })}
              type="color"
              value={backgroundColor}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

type Props = {
  results: GeneratedImage[];
  activeResult: GeneratedImage;
  activeResultIndex: number;
  editableImageUrl: string;
  supportsAtelierEdit: boolean;
  canExportBranded: boolean;
  atelierHasUnsavedChanges: boolean;
  onClose: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onDownload: (image: GeneratedImage, index: number, variant?: "clean" | "branded") => void;
  onOpenImg2Img: () => void;

  atelierConfig: AtelierOverlayConfig;
  atelierGradients: AtelierOverlayGradientConfig;
  atelierTextConfig: AtelierOverlayTextConfig;
  atelierText: AtelierOverlayTextContent;
  atelierImageTransform: AtelierImageTransform;
  atelierImageToolActive: boolean;
  atelierColorBlocks: AtelierColorBlockLayer[];
  atelierShadowPanel: ShadowPanelState | null;
  atelierSaving: boolean;
  atelierStatus: string;
  copiedBranding: BrandingSnapshot | null;

  onSetAtelierConfig: Dispatch<SetStateAction<AtelierOverlayConfig>>;
  onSetAtelierGradients: Dispatch<SetStateAction<AtelierOverlayGradientConfig>>;
  onSetAtelierTextConfig: Dispatch<SetStateAction<AtelierOverlayTextConfig>>;
  onSetAtelierImageTransform: Dispatch<SetStateAction<AtelierImageTransform>>;
  onSetAtelierImageToolActive: Dispatch<SetStateAction<boolean>>;
  onSetAtelierColorBlocks: Dispatch<SetStateAction<AtelierColorBlockLayer[]>>;
  onSetAtelierShadowPanel: (panel: ShadowPanelState | null) => void;

  onSaveAtelierConfig: (imageUrl: string, index: number) => void;
  onUpdateAtelierText: (id: AtelierOverlayTextBlockId, value: string) => void;
  onToggleBlockVisibility: (id: "atelierLogo" | "eventBlock") => void;
  onToggleTextVisibility: (id: AtelierOverlayTextBlockId) => void;
  onToggleBlockShadow: (block: AtelierOverlayBlock) => AtelierOverlayBlock;
  onToggleTextShadow: (id: AtelierOverlayTextBlockId) => void;
  onUpdateShadowPanel: (patch: Partial<AtelierOverlayBlock> | Partial<AtelierOverlayTextConfig[AtelierOverlayTextBlockId]>) => void;
  onCopyBranding: () => void;
  onApplyCopiedBranding: () => void;

  videoGenerating: boolean;
  videoResult: string | null;
  videoError: string;
  videoStep: string;
  videoPercent: number;
  videoPrompt: string;
  onVideoPromptChange: (v: string) => void;
  onGenerateVideo: (imageUrl: string) => void;
};

export function ResultViewer({
  results, activeResult, activeResultIndex, editableImageUrl, supportsAtelierEdit,
  canExportBranded, atelierHasUnsavedChanges,
  onClose, onMove, onRemove, onDownload, onOpenImg2Img,
  atelierConfig, atelierGradients, atelierTextConfig, atelierText,
  atelierImageTransform, atelierImageToolActive, atelierColorBlocks, atelierShadowPanel,
  atelierSaving, atelierStatus, copiedBranding,
  onSetAtelierConfig, onSetAtelierGradients, onSetAtelierTextConfig,
  onSetAtelierImageTransform, onSetAtelierImageToolActive, onSetAtelierColorBlocks,
  onSetAtelierShadowPanel,
  onSaveAtelierConfig, onUpdateAtelierText, onToggleBlockVisibility, onToggleTextVisibility,
  onToggleBlockShadow, onToggleTextShadow, onUpdateShadowPanel,
  onCopyBranding, onApplyCopiedBranding,
  videoGenerating, videoResult, videoError, videoStep, videoPercent, videoPrompt,
  onVideoPromptChange, onGenerateVideo,
}: Props) {
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  function requestClose() {
    if (supportsAtelierEdit && atelierHasUnsavedChanges) {
      setCloseConfirmOpen(true);
      return;
    }
    onClose();
  }

  function closeWithoutSaving() {
    setCloseConfirmOpen(false);
    onClose();
  }

  function saveBeforeClose() {
    if (editableImageUrl) {
      onSaveAtelierConfig(editableImageUrl, activeResultIndex);
    }
    setCloseConfirmOpen(false);
  }

  function updateTextBlock(id: AtelierOverlayTextBlockId, patch: Partial<AtelierOverlayTextBlock>) {
    onSetAtelierTextConfig((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (closeConfirmOpen) {
        setCloseConfirmOpen(false);
        return;
      }
      requestClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="cem-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }} role="dialog" aria-modal="true">
      <div className="cem-shell" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cem-header">
          <div className="cem-header-left">
            {results.length > 1 ? (
              <div className="cem-nav">
                <button className="cem-nav-btn" onClick={() => onMove(-1)} type="button"><ChevronLeft size={14} /></button>
                <span className="cem-nav-label">{activeResultIndex + 1}/{results.length}</span>
                <button className="cem-nav-btn" onClick={() => onMove(1)} type="button"><ChevronRight size={14} /></button>
              </div>
            ) : null}
            <span className="cem-title">Résultat {activeResultIndex + 1} / {results.length}</span>
          </div>
          <div className="cem-header-right">
            <button className="cem-header-btn" onClick={() => void onDownload(activeResult, activeResultIndex)} type="button">
              <Download size={13} />Clean
            </button>
            {activeResult.brandedUrl ? (
              <button
                className="cem-header-btn"
                disabled={!canExportBranded}
                onClick={() => void onDownload(activeResult, activeResultIndex, "branded")}
                title={canExportBranded ? "Exporter la version brandee" : "Appliquez le branding avant d'exporter"}
                type="button"
              >
                <Download size={13} />Brandé
              </button>
            ) : null}
            <button
              className="cem-header-btn"
              onClick={onOpenImg2Img}
              title="Régénérer à partir de cette image"
              type="button"
            >
              <RefreshCcw size={13} />Régénérer
            </button>
            <button className="cem-header-btn danger" onClick={() => void onRemove()} type="button"><Trash2 size={13} /></button>
            <button className="cem-header-btn" onClick={requestClose} type="button"><X size={16} /></button>
          </div>
        </div>

        <div className="cem-body">
          <aside className="cem-sidebar">
            {supportsAtelierEdit && (
              <>
                <div className="cem-section-title">Photo</div>
                <button
                  className={`cem-tool-btn${atelierImageToolActive ? " active" : ""}`}
                  onClick={() => onSetAtelierImageToolActive((v) => !v)}
                  type="button"
                >
                  Main
                </button>
                <label className="cem-grad-row cem-zoom-row">
                  <span>Zoom</span>
                  <input
                    max={1.6} min={1} step={0.05} type="range"
                    onChange={(e) => onSetAtelierImageTransform((c) => ({ ...c, scale: Number(e.target.value) }))}
                    value={atelierImageTransform.scale}
                  />
                  <span className="cem-grad-val">{atelierImageTransform.scale.toFixed(2)}</span>
                </label>
                <div className="cem-divider" />
                <div className="cem-section-title">Carrés couleur</div>
                <div className="cem-color-blocks">
                  {ADS_CHARTER_COLORS.map((color) => (
                    <button
                      className="cem-color-block-btn"
                      key={color}
                      onClick={() => onSetAtelierColorBlocks((c) => [
                        ...c,
                        { color, height: 240, id: crypto.randomUUID(), width: 240, x: 78, y: 780 },
                      ])}
                      style={{ background: color }}
                      type="button"
                    />
                  ))}
                </div>
                <div className="cem-divider" />
                <div className="cem-section-title">Calques</div>
                <div className="cem-layers">
                  {ATELIER_OVERLAY_BLOCKS.map((block) => (
                    <div key={block.id} className="cem-layer-row">
                      <span className="cem-layer-label">{block.label === "Logo" ? "🏷 Logo" : "🔲 Bloc"}</span>
                      <button
                        className={`cem-shadow-toggle${atelierConfig[block.id]?.shadowEnabled ? " active" : ""}`}
                        onClick={() => onSetAtelierConfig((c) => ({ ...c, [block.id]: onToggleBlockShadow(c[block.id]) }))}
                        onDoubleClick={() => onSetAtelierShadowPanel({ id: block.id, label: block.label, type: "block" })}
                        type="button"
                      >
                        Ombre
                      </button>
                      <button className="cem-layer-eye" onClick={() => onToggleBlockVisibility(block.id)} type="button">
                        {atelierConfig[block.id]?.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  ))}
                  <div className="cem-layer-row">
                    <span className="cem-layer-label">T Copy</span>
                    <button
                      className={`cem-shadow-toggle${(atelierTextConfig.headline.shadowBlur ?? 0) > 0 && (atelierTextConfig.headline.shadowOpacity ?? 0) > 0 ? " active" : ""}`}
                      onClick={() => onToggleTextShadow("headline")}
                      onDoubleClick={() => onSetAtelierShadowPanel({ id: "headline", label: "Copy", type: "text" })}
                      type="button"
                    >
                      Ombre
                    </button>
                    <button className="cem-layer-eye" onClick={() => onToggleTextVisibility("headline")} type="button">
                      {atelierTextConfig.headline.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <div className="cem-layer-row">
                    <span className="cem-layer-label">T CTA</span>
                    <button
                      className={`cem-shadow-toggle${(atelierTextConfig.cta.shadowBlur ?? 0) > 0 && (atelierTextConfig.cta.shadowOpacity ?? 0) > 0 ? " active" : ""}`}
                      onClick={() => onToggleTextShadow("cta")}
                      onDoubleClick={() => onSetAtelierShadowPanel({ id: "cta", label: "CTA", type: "text" })}
                      type="button"
                    >
                      Ombre
                    </button>
                    <button className="cem-layer-eye" onClick={() => onToggleTextVisibility("cta")} type="button">
                      {atelierTextConfig.cta.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  {atelierColorBlocks.map((layer) => (
                    <div key={layer.id} className="cem-layer-row">
                      <span className="cem-layer-label" style={{ color: ["#ffffff", "#f1f0f0"].includes(layer.color) ? undefined : layer.color }}>■ Carré</span>
                      <button className="cem-layer-eye danger" onClick={() => onSetAtelierColorBlocks((c) => c.filter((item) => item.id !== layer.id))} type="button">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>

                {atelierShadowPanel ? (
                  <div className="cem-shadow-panel">
                    <div className="cem-shadow-panel-head">
                      <span>Ombre {atelierShadowPanel.label}</span>
                      <button className="cem-layer-eye" onClick={() => onSetAtelierShadowPanel(null)} type="button"><X size={12} /></button>
                    </div>
                    {(() => {
                      const value = atelierShadowPanel.type === "block"
                        ? atelierConfig[atelierShadowPanel.id]
                        : atelierTextConfig[atelierShadowPanel.id];
                      const blur = value.shadowBlur ?? (atelierShadowPanel.type === "block" ? 36 : atelierShadowPanel.id === "cta" ? 0 : 12);
                      const opacity = value.shadowOpacity ?? (atelierShadowPanel.type === "block" ? 0.32 : atelierShadowPanel.id === "cta" ? 0 : 0.45);
                      const offsetY = value.shadowOffsetY ?? (atelierShadowPanel.type === "block" ? 18 : atelierShadowPanel.id === "cta" ? 0 : 8);
                      return (
                        <>
                          <label className="cem-grad-row cem-shadow-row">
                            <span>Flou</span>
                            <input max={72} min={0} step={1} type="range" value={blur} onChange={(e) => onUpdateShadowPanel({ shadowBlur: Number(e.target.value) })} />
                            <span className="cem-grad-val">{Math.round(blur)}</span>
                          </label>
                          <label className="cem-grad-row cem-shadow-row">
                            <span>Force</span>
                            <input max={1} min={0} step={0.05} type="range" value={opacity} onChange={(e) => onUpdateShadowPanel({ shadowOpacity: Number(e.target.value) })} />
                            <span className="cem-grad-val">{opacity.toFixed(2)}</span>
                          </label>
                          <label className="cem-grad-row cem-shadow-row">
                            <span>Y</span>
                            <input max={80} min={-40} step={1} type="range" value={offsetY} onChange={(e) => onUpdateShadowPanel({ shadowOffsetY: Number(e.target.value) })} />
                            <span className="cem-grad-val">{Math.round(offsetY)}</span>
                          </label>
                        </>
                      );
                    })()}
                  </div>
                ) : null}

                <div className="cem-divider" />
                <div className="cem-section-title">Assets</div>
                {ATELIER_OVERLAY_BLOCKS.map((block) => (
                  <div key={block.id} className="cem-asset-row">
                    <span className="cem-asset-label">{block.label}</span>
                    <select
                      className="cem-asset-select"
                      value={atelierConfig[block.id].assetId ?? block.defaultAssetId}
                      onChange={(e) => onSetAtelierConfig((c) => ({ ...c, [block.id]: { ...c[block.id], assetId: e.target.value } }))}
                    >
                      {ATELIER_ASSETS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                  </div>
                ))}

                <div className="cem-divider" />
                <div className="cem-section-title">Texte</div>
                <label className="cem-copy-field">
                  <span>Copy Atelier</span>
                  <textarea onChange={(e) => onUpdateAtelierText("headline", e.target.value)} rows={3} value={atelierText.headline ?? ""} />
                </label>
                <label className="cem-copy-field">
                  <span>CTA</span>
                  <textarea onChange={(e) => onUpdateAtelierText("cta", e.target.value)} rows={2} value={atelierText.cta ?? ""} />
                </label>
                <TextBlockControls block={atelierTextConfig.headline} id="headline" label="Copy Atelier" onChange={(patch) => updateTextBlock("headline", patch)} />
                <TextBlockControls block={atelierTextConfig.cta} id="cta" label="CTA" onChange={(patch) => updateTextBlock("cta", patch)} />

                <div className="cem-divider" />
                <div className="cem-section-title">Gradients</div>
                <label className="cem-grad-row">
                  <span>Haut</span>
                  <input type="range" min={0} max={1.6} step={0.05} value={atelierGradients.topOpacity}
                    onChange={(e) => onSetAtelierGradients((g) => ({ ...g, topOpacity: Number(e.target.value) }))} />
                  <span className="cem-grad-val">{atelierGradients.topOpacity.toFixed(2)}</span>
                </label>
                <label className="cem-grad-row">
                  <span>Bas</span>
                  <input type="range" min={0} max={1.6} step={0.05} value={atelierGradients.bottomOpacity}
                    onChange={(e) => onSetAtelierGradients((g) => ({ ...g, bottomOpacity: Number(e.target.value) }))} />
                  <span className="cem-grad-val">{atelierGradients.bottomOpacity.toFixed(2)}</span>
                </label>

                <div className="cem-divider" />
                <div className="cem-section-title">Recette branding</div>
                <div className="cem-branding-actions">
                  <button className="button ghost" onClick={onCopyBranding} type="button">
                    <Copy size={14} />
                    Copier
                  </button>
                  <button
                    className="button ghost"
                    disabled={!copiedBranding || atelierSaving}
                    onClick={() => void onApplyCopiedBranding()}
                    type="button"
                  >
                    <Check size={14} />
                    Appliquer copie
                  </button>
                </div>
                <div className="cem-divider" />
                <button
                  className="button primary"
                  disabled={atelierSaving}
                  onClick={() => void onSaveAtelierConfig(editableImageUrl, activeResultIndex)}
                  style={{ width: "100%" }}
                  type="button"
                >
                  {atelierSaving ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}
                  Appliquer le branding
                </button>
                {atelierHasUnsavedChanges ? (
                  <small className="cem-status">Branding modifie : appliquez-le avant d&apos;exporter.</small>
                ) : null}
                {atelierStatus ? <small className="cem-status">{atelierStatus}</small> : null}
                <div className="cem-divider" />
              </>
            )}

            <div className="cem-section-title">Vidéo Kling</div>
            <input
              className="video-prompt-input"
              disabled={videoGenerating}
              onChange={(e) => onVideoPromptChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !videoGenerating) void onGenerateVideo(editableImageUrl || activeResult.url); }}
              placeholder="Décrire le mouvement…"
              type="text"
              value={videoPrompt}
            />
            <button
              className="button ghost"
              disabled={videoGenerating}
              onClick={() => void onGenerateVideo(editableImageUrl || activeResult.url)}
              style={{ width: "100%", marginTop: 6 }}
              type="button"
            >
              {videoGenerating ? <LoaderCircle className="spin" size={14} /> : <Film size={14} />}
              {videoGenerating ? "Génération…" : "Générer vidéo"}
            </button>
            {videoGenerating ? (
              <div className="video-progress-wrap" style={{ marginTop: 8 }}>
                <div className="video-progress-bar"><div className="video-progress-fill" style={{ width: `${videoPercent}%` }} /></div>
                <span className="video-progress-label">{videoStep}</span>
              </div>
            ) : null}
            {videoError ? <small className="cem-status" style={{ color: "#ef4444" }}>{videoError}</small> : null}
            {videoResult ? (
              <div className="result-video-player" style={{ marginTop: 8 }}>
                <video autoPlay controls loop playsInline src={videoResult} />
                <a className="button ghost" download="adstylr-video.mp4" href={videoResult} rel="noreferrer" target="_blank" style={{ marginTop: 6 }}>
                  <Download size={14} />Télécharger
                </a>
              </div>
            ) : null}
          </aside>

          <main className="cem-canvas-wrap">
            {supportsAtelierEdit ? (
              <AtelierOverlayEditor
                backgroundUrl={editableImageUrl}
                colorBlocks={atelierColorBlocks}
                config={atelierConfig}
                gradients={atelierGradients}
                imageToolActive={atelierImageToolActive}
                imageTransform={atelierImageTransform}
                onChange={onSetAtelierConfig}
                onChangeColorBlocks={onSetAtelierColorBlocks}
                onChangeImageTransform={onSetAtelierImageTransform}
                onChangeText={onUpdateAtelierText}
                onChangeTextConfig={onSetAtelierTextConfig}
                showAssetSwitcher={false}
                text={atelierText}
                textConfig={atelierTextConfig}
              />
            ) : (
              <LoadingImage
                alt="Résultat"
                className="result-loading-img"
                fallbackSrc={activeResult.cleanUrl ?? activeResult.url}
                loading="eager"
                src={getDisplayImageUrl(activeResult)}
                style={{ maxHeight: "100%", maxWidth: "100%", borderRadius: 4, boxShadow: "0 4px 24px rgba(0,0,0,0.15)", objectFit: "contain" }}
                wrapperClassName="result-loading-image"
              />
            )}
          </main>
        </div>
      </div>
      {closeConfirmOpen ? (
        <div className="confirm-overlay" onMouseDown={() => setCloseConfirmOpen(false)} role="dialog" aria-modal="true" aria-labelledby="close-confirm-title">
          <div className="confirm-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <h2 id="close-confirm-title">Fermer sans enregistrer ?</h2>
            <p>Le branding de cette image a été modifié. Appliquez-le avant de fermer pour conserver l’export et la miniature.</p>
            <div className="confirm-actions">
              <button className="button ghost" onClick={() => setCloseConfirmOpen(false)} type="button">
                Annuler
              </button>
              <button className="button ghost danger-text" onClick={closeWithoutSaving} type="button">
                Fermer sans enregistrer
              </button>
              <button className="button primary" disabled={atelierSaving || !editableImageUrl} onClick={saveBeforeClose} type="button">
                {atelierSaving ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}
                Enregistrer le branding
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
