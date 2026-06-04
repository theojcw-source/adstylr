import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  Images,
  LoaderCircle,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { AtelierGradientControls } from "./AtelierGradientControls";
import {
  AtelierOverlayEditor,
  type AtelierOverlayConfig,
  type AtelierOverlayGradientConfig,
} from "../../components/AtelierOverlayEditor";
import { LoadingImage } from "../../components/LoadingImage";
import { ATELIER_ASSET_BY_ID } from "../../atelierAssets";
import {
  ASPECT_RATIO_OPTIONS,
  ATELIER_BRAND_ID,
  GENERATION_MODELS,
  HD_IMAGE_SIZE_BY_RATIO,
  STANDARD_IMAGE_SIZE_BY_RATIO,
} from "../../constants";
import {
  COMFY_FAL_MODEL,
  FAL_SELECTED_LORA_URL_KEY,
  type GenerationModel,
} from "../../fal-models";
import type {
  AspectRatio,
  CustomImageSize,
  GeneratedImage,
  OrganizationStyleMatch,
  OutputFormat,
  PromptTemplate,
  ResolutionMode,
} from "../../types";
import { clampDimension, formatImageSize } from "../../utils/image";
import { buildPromptFromTemplate } from "../../utils/styles";
import { isBrandingSnapshot, type BrandingSnapshot } from "../types";
import { getBoardImageUrl } from "../utils/board";

export type ImageBoardItem = {
  id: string;
  image: GeneratedImage;
  label: string;
  onOpen: () => void;
  onRemove?: () => void;
  onRestore?: () => void;
  prompt?: string;
};

type Props = {
  selectedBrandId: string;
  organizationMatches: OrganizationStyleMatch[];
  atelierOverlayVersion: number;
  onApplyOrganization: (id: string) => void;

  visiblePromptTemplates: PromptTemplate[];
  promptTemplates: PromptTemplate[];
  selectedPromptTemplate: PromptTemplate | null;
  selectedPromptTemplateId: string | null;
  promptFlash: boolean;
  triggerWord: string;
  onApplyPromptTemplate: (t: PromptTemplate) => void;
  onClearTemplate: () => void;
  onOpenNewPromptModal: () => void;
  onOpenEditPromptModal: (t: PromptTemplate) => void;
  onDeletePromptTemplate: (id: string) => void;

  prompt: string;
  onPromptChange: (v: string) => void;
  generating: boolean;
  generationProgress: number;
  generationError: string;
  modelSupportsLora: boolean;
  activeLoras: Array<{ path: string; scale: number }>;
  onGenerate: () => void;

  generationModel: GenerationModel;
  aspectRatio: AspectRatio;
  resolutionMode: ResolutionMode;
  customImageSize: CustomImageSize;
  numImages: number;
  guidance: number;
  inferenceSteps: number;
  outputFormat: OutputFormat;
  loraUrl: string;
  loraScale: number;
  onSetGenerationModel: (v: GenerationModel) => void;
  onSetAspectRatio: (v: AspectRatio) => void;
  onSetResolutionMode: (v: ResolutionMode) => void;
  onSetCustomImageSize: (updater: (prev: CustomImageSize) => CustomImageSize) => void;
  onSetNumImages: (v: number) => void;
  onSetGuidance: (v: number) => void;
  onSetInferenceSteps: (v: number) => void;
  onSetOutputFormat: (v: OutputFormat) => void;
  onSetLoraUrl: (v: string) => void;
  onSetLoraScale: (v: number) => void;

  atelierOverlaySaving: boolean;
  atelierOverlayStatus: string;
  atelierOverlayConfig: AtelierOverlayConfig;
  atelierOverlayGradients: AtelierOverlayGradientConfig;
  onSaveAtelierOverlayConfig: () => void;
  onSetAtelierOverlayConfig: (config: AtelierOverlayConfig | ((prev: AtelierOverlayConfig) => AtelierOverlayConfig)) => void;
  onSetAtelierOverlayGradients: (config: AtelierOverlayGradientConfig | ((prev: AtelierOverlayGradientConfig) => AtelierOverlayGradientConfig)) => void;

  workflowSaving: boolean;
  workflowNameDraft: string;
  onSetWorkflowNameDraft: (v: string) => void;
  onSaveWorkflow: () => void;

  imageBoardItems: ImageBoardItem[];
  archiveMode: boolean;
  generationHistoryLoading: boolean;
  hasGenerationHistory: boolean;
  onArchiveModeChange: (value: boolean) => void;
  onClearHistory: () => void;
};

export function ImageStudio({
  selectedBrandId, organizationMatches, atelierOverlayVersion, onApplyOrganization,
  visiblePromptTemplates, promptTemplates, selectedPromptTemplate, selectedPromptTemplateId,
  promptFlash, triggerWord, onApplyPromptTemplate, onClearTemplate, onOpenNewPromptModal,
  onOpenEditPromptModal, onDeletePromptTemplate,
  prompt, onPromptChange, generating, generationProgress, generationError,
  modelSupportsLora, activeLoras, onGenerate,
  generationModel, aspectRatio, resolutionMode, customImageSize, numImages,
  guidance, inferenceSteps, outputFormat, loraUrl, loraScale,
  onSetGenerationModel, onSetAspectRatio, onSetResolutionMode, onSetCustomImageSize,
  onSetNumImages, onSetGuidance, onSetInferenceSteps, onSetOutputFormat,
  onSetLoraUrl, onSetLoraScale,
  atelierOverlaySaving, atelierOverlayStatus, atelierOverlayConfig, atelierOverlayGradients,
  onSaveAtelierOverlayConfig, onSetAtelierOverlayConfig, onSetAtelierOverlayGradients,
  workflowSaving, workflowNameDraft,
  onSetWorkflowNameDraft, onSaveWorkflow,
  imageBoardItems, archiveMode, generationHistoryLoading, hasGenerationHistory,
  onArchiveModeChange, onClearHistory,
}: Props) {
  const [boardVariant, setBoardVariant] = useState<"clean" | "branded">("clean");
  const hasBrandVariants = imageBoardItems.some((item) => Boolean(item.image.brandedUrl || item.image.brandingConfig));
  const resolvedBoardVariant = hasBrandVariants ? boardVariant : "clean";

  return (
    <section className="clean-studio" aria-label="Generer des images">
      <section className="clean-control-panel">
        <div className="school-row">
          <label className="field school-select-field">
            <span>Ecole</span>
            <select onChange={(e) => onApplyOrganization(e.target.value)} value={selectedBrandId}>
              {organizationMatches.map(({ brand }) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
          {selectedBrandId ? (
            <div className="clean-brand-mark" aria-hidden="true">
              <LoadingImage
                alt=""
                className="h-full w-full object-contain"
                src={`/brand/${selectedBrandId}/logo.png${selectedBrandId === ATELIER_BRAND_ID && atelierOverlayVersion ? `?t=${atelierOverlayVersion}` : ""}`}
                wrapperClassName="block"
              />
            </div>
          ) : null}
        </div>

        <section className="prompt-catalog compact" aria-label="Catalogue de prompts">
          <div className="section-line">
            <span>Catalogue de prompts</span>
            <button className="icon-button" onClick={onOpenNewPromptModal} title="Ajouter un prompt" type="button">
              <Plus size={14} />
            </button>
          </div>
          <div className={`prompt-grid ${promptTemplates.length > 0 ? "editable" : "readonly"}`}>
            {visiblePromptTemplates.map((template) => (
              <article
                className={`prompt-card ${selectedPromptTemplateId === template.id ? "selected" : ""}`}
                key={template.id}
              >
                <button onClick={() => onApplyPromptTemplate(template)} type="button">
                  <span>{template.category}</span>
                  <strong>{template.label}</strong>
                  <small>{buildPromptFromTemplate(template, triggerWord)}</small>
                </button>
                {promptTemplates.length > 0 ? (
                  <div className="prompt-card-actions">
                    <button
                      aria-label="Modifier"
                      className="icon-button"
                      onClick={(e) => { e.stopPropagation(); onOpenEditPromptModal(template); }}
                      type="button"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      aria-label="Supprimer"
                      className="icon-button danger-text"
                      onClick={(e) => { e.stopPropagation(); void onDeletePromptTemplate(template.id); }}
                      type="button"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <label className="field prompt-field">
          <span>
            Invite
            {selectedPromptTemplate ? (
              <span className="template-active-badge">
                {selectedPromptTemplate.label}
                <button
                  aria-label="Retirer le modele"
                  onClick={(e) => { e.preventDefault(); onClearTemplate(); }}
                  type="button"
                >
                  ×
                </button>
              </span>
            ) : null}
          </span>
          <textarea
            className={promptFlash ? "prompt-flash" : ""}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="Décris l'image à générer..."
            rows={4}
            value={prompt}
          />
        </label>

        <div className="generate-row">
          <button
            className="button primary generate-button"
            disabled={generating || !prompt.trim() || (modelSupportsLora && activeLoras.length === 0)}
            onClick={onGenerate}
            type="button"
          >
            {generating ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
            Generer
          </button>
        </div>

        {generating ? (
          <div className="progress-wrap">
            <div className="progress-head">
              <span>Generation en cours</span>
              <strong>{Math.round(generationProgress)}%</strong>
            </div>
            <div className="progress-bar">
              <div className="progress-fill pulse" style={{ width: `${generationProgress}%` }} />
            </div>
          </div>
        ) : null}

        {generationError ? (
          <div className="notice error" role="alert">
            <AlertCircle size={18} />
            <span>{generationError}</span>
          </div>
        ) : null}

        <details className="advanced-options">
          <summary>
            <span>Options avancees</span>
            <ChevronDown size={15} />
          </summary>
          <div className="advanced-options-body">
            <div className="field-grid">
              <label className="field">
                <span>Modele</span>
                <select onChange={(e) => onSetGenerationModel(e.target.value as GenerationModel)} value={generationModel}>
                  {GENERATION_MODELS.map((model) => (
                    <option key={model.value} value={model.value}>{model.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Format</span>
                <select onChange={(e) => onSetAspectRatio(e.target.value as AspectRatio)} value={aspectRatio}>
                  {ASPECT_RATIO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Resolution</span>
                <select onChange={(e) => onSetResolutionMode(e.target.value as ResolutionMode)} value={resolutionMode}>
                  <option value="standard">{formatImageSize(STANDARD_IMAGE_SIZE_BY_RATIO[aspectRatio])}</option>
                  <option value="hd">{formatImageSize(HD_IMAGE_SIZE_BY_RATIO[aspectRatio])}</option>
                  <option value="custom">Personnalise</option>
                </select>
              </label>
              <label className="field">
                <span>Fichier</span>
                <select onChange={(e) => onSetOutputFormat(e.target.value as OutputFormat)} value={outputFormat}>
                  <option value="jpeg">JPEG</option>
                  <option value="png">PNG</option>
                </select>
              </label>
              <label className="field">
                <span>Nombre d&apos;images</span>
                <select onChange={(e) => onSetNumImages(Number(e.target.value))} value={numImages}>
                  <option value="1">1 image</option>
                  <option value="2">2 images</option>
                  <option value="4">4 images</option>
                </select>
              </label>
            </div>

            {resolutionMode === "custom" ? (
              <div className="field-grid">
                <label className="field">
                  <span>Largeur (px)</span>
                  <input
                    max={2048} min={256} step={64} type="number"
                    onChange={(e) => onSetCustomImageSize((c) => ({ ...c, width: clampDimension(Number(e.target.value)) }))}
                    value={customImageSize.width}
                  />
                </label>
                <label className="field">
                  <span>Hauteur (px)</span>
                  <input
                    max={2048} min={256} step={64} type="number"
                    onChange={(e) => onSetCustomImageSize((c) => ({ ...c, height: clampDimension(Number(e.target.value)) }))}
                    value={customImageSize.height}
                  />
                </label>
              </div>
            ) : null}

            <label className="field">
              <span>URL du LoRA</span>
              <input
                onChange={(e) => {
                  onSetLoraUrl(e.target.value);
                  sessionStorage.setItem(FAL_SELECTED_LORA_URL_KEY, e.target.value);
                }}
                placeholder="https://...safetensors"
                value={loraUrl}
              />
            </label>

            <div className="field-grid">
              <label className="field">
                <span>Scale du LoRA</span>
                <div className="range-row">
                  <input max={1.5} min={0.1} step={0.05} type="range"
                    onChange={(e) => onSetLoraScale(Number(e.target.value))} value={loraScale} />
                  <output>{loraScale.toFixed(2)}</output>
                </div>
              </label>
              <label className="field">
                <span>Guidance scale</span>
                <div className="range-row">
                  <input max={10} min={1} step={0.5} type="range"
                    onChange={(e) => onSetGuidance(Number(e.target.value))} value={guidance} />
                  <output>{guidance.toFixed(1)}</output>
                </div>
              </label>
              <label className="field">
                <span>Steps</span>
                <div className="range-row">
                  <input max={50} min={8} step={1} type="range"
                    onChange={(e) => onSetInferenceSteps(Number(e.target.value))} value={inferenceSteps} />
                  <output>{inferenceSteps}</output>
                </div>
              </label>
            </div>

            {generationModel === COMFY_FAL_MODEL ? (
              <div className="workflow-manager">
                <div className="workflow-save-row">
                  <input
                    className="workflow-name-input"
                    onChange={(e) => onSetWorkflowNameDraft(e.target.value)}
                    placeholder="Nom du workflow..."
                    value={workflowNameDraft}
                  />
                  <button
                    className="button ghost small"
                    disabled={workflowSaving}
                    onClick={() => void onSaveWorkflow()}
                    type="button"
                  >
                    {workflowSaving ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}
                    Sauvegarder
                  </button>
                </div>
              </div>
            ) : null}

            {selectedBrandId === ATELIER_BRAND_ID ? (
              <section className="overlay-editor" aria-label="Editeur overlay Atelier de Sevres">
                <div className="inline-head">
                  <span>Overlay Atelier</span>
                  <button
                    className="button primary small"
                    disabled={atelierOverlaySaving}
                    onClick={() => void onSaveAtelierOverlayConfig()}
                    type="button"
                  >
                    {atelierOverlaySaving ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}
                    Enregistrer
                  </button>
                </div>
                <AtelierOverlayEditor
                  config={atelierOverlayConfig}
                  gradients={atelierOverlayGradients}
                  onChange={onSetAtelierOverlayConfig}
                />
                <AtelierGradientControls
                  gradients={atelierOverlayGradients}
                  onChange={onSetAtelierOverlayGradients}
                />
                {atelierOverlayStatus ? <small className="overlay-editor-status">{atelierOverlayStatus}</small> : null}
              </section>
            ) : null}
          </div>
        </details>
      </section>

      <section className="image-board-panel" aria-label="Board images">
        <div className="board-toolbar">
          <div>
            <h2>Board</h2>
            <span>{generationHistoryLoading && imageBoardItems.length === 0 ? "Chargement..." : `${imageBoardItems.length} image(s)`}</span>
          </div>
          <div className="board-actions">
            <button
              className={`button ghost small${archiveMode ? " active" : ""}`}
              onClick={() => onArchiveModeChange(!archiveMode)}
              type="button"
            >
              <Archive size={14} />
              Archive
            </button>
            <label
              className={`relative inline-flex h-8 w-[154px] items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-1 text-[11px] font-semibold text-[var(--muted)] transition ${hasBrandVariants ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
              title={hasBrandVariants ? "Afficher les versions clean ou brandées" : "Aucune version brandée disponible"}
            >
              <input
                aria-label="Basculer le board entre version clean et version brandée"
                checked={resolvedBoardVariant === "branded"}
                className="peer sr-only"
                disabled={!hasBrandVariants}
                onChange={(event) => setBoardVariant(event.target.checked ? "branded" : "clean")}
                type="checkbox"
              />
              <span
                aria-hidden="true"
                className="absolute left-1 top-1 h-6 w-[72px] rounded-full bg-[var(--surface)] shadow-sm transition-transform duration-200 peer-checked:translate-x-[72px] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--blue)]"
              />
              <span className={`relative z-10 flex-1 text-center transition-colors ${resolvedBoardVariant === "clean" ? "text-[var(--foreground)]" : ""}`}>Clean</span>
              <span className={`relative z-10 flex-1 text-center transition-colors ${resolvedBoardVariant === "branded" ? "text-[var(--foreground)]" : ""}`}>
                Brandée
              </span>
            </label>
            {hasGenerationHistory ? (
              <button className="button ghost small" onClick={onClearHistory} type="button">
                <Trash2 size={14} />
                {archiveMode ? "Vider la vue" : "Effacer"}
              </button>
            ) : null}
          </div>
        </div>

        {imageBoardItems.length > 0 ? (
          <div className="figma-board">
            {imageBoardItems.map((item) => (
              <div className="board-image-wrap" key={item.id}>
                <button className="board-image-node" onClick={item.onOpen} type="button">
                  <BoardThumbnail image={item.image} label={item.label} variant={resolvedBoardVariant} />
                  <span>{item.label}</span>
                </button>
                {item.onRemove ? (
                  <button className="board-remove-btn" onClick={item.onRemove} title="Archiver" type="button">
                    <Trash2 size={12} />
                  </button>
                ) : null}
                {item.onRestore ? (
                  <button className="board-remove-btn" onClick={item.onRestore} title="Restaurer" type="button">
                    <ArchiveRestore size={12} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : generationHistoryLoading ? (
          <div className="figma-board" aria-label="Chargement des images">
            {Array.from({ length: 8 }).map((_, index) => (
              <div className="board-image-skeleton" key={`board-skeleton-${index}`}>
                <span />
                <small />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-board">
            <Images size={24} />
            <span>{archiveMode ? "Aucune image archivee." : "Les generations apparaitront ici."}</span>
          </div>
        )}
      </section>
    </section>
  );
}

function percent(value: number, base: number) {
  return `${(value / base) * 100}%`;
}

function estimateWrappedLineCount(value: string, width: number, fontSize: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;

  const averageCharWidth = fontSize * 0.58;
  const maxChars = Math.max(4, Math.floor(width / averageCharWidth));
  let lines = 1;
  let current = 0;

  for (const word of words) {
    const wordLength = word.length;
    if (current === 0) {
      current = wordLength;
      continue;
    }

    if (current + 1 + wordLength > maxChars) {
      lines += 1;
      current = wordLength;
    } else {
      current += 1 + wordLength;
    }
  }

  return lines;
}

function BoardThumbnail({ image, label, variant }: { image: GeneratedImage; label: string; variant: "clean" | "branded" }) {
  const branding = isBrandingSnapshot(image.brandingConfig) ? image.brandingConfig : null;
  const canDrawOverlay = variant === "branded" && Boolean(branding && !image.thumbnailUrl && !image.brandedUrl);
  const imageTransform = branding?.imageTransform ?? { scale: 1, x: 0, y: 0 };
  const source = getBoardImageUrl(image, variant);
  const imageStyle = image.placeholderUrl
    ? { backgroundImage: `url(${image.placeholderUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
    : undefined;

  return (
    <div className="board-thumbnail-frame">
      <LoadingImage
        alt={label}
        className={`board-thumbnail-image${canDrawOverlay ? " cover" : ""}`}
        fallbackSrc={variant === "branded" ? image.brandedUrl ?? image.cleanUrl ?? image.url : image.cleanUrl ?? image.url}
        loading="lazy"
        src={source}
        style={{
          ...imageStyle,
          height: canDrawOverlay ? `${imageTransform.scale * 100}%` : undefined,
          left: canDrawOverlay ? percent(imageTransform.x, 1080) : undefined,
          top: canDrawOverlay ? percent(imageTransform.y, 1920) : undefined,
          width: canDrawOverlay ? `${imageTransform.scale * 100}%` : undefined,
        }}
        wrapperClassName="fill"
      />
      {canDrawOverlay && branding ? <BoardThumbnailOverlay branding={branding} /> : null}
    </div>
  );
}

function BoardThumbnailOverlay({ branding }: { branding: BrandingSnapshot }) {
  const colorBlocks = branding.colorBlocks ?? [];

  return (
    <div className="board-thumbnail-overlay" aria-hidden="true">
      <div
        className="board-thumbnail-gradient top"
        style={{ opacity: branding.gradients.topOpacity }}
      />
      <div
        className="board-thumbnail-gradient bottom"
        style={{ opacity: branding.gradients.bottomOpacity }}
      />
      {colorBlocks.map((layer) => layer.hidden ? null : (
        <div
          className="board-thumbnail-color-block"
          key={layer.id}
          style={{
            background: layer.color,
            borderRadius: `${((layer.radius ?? 0) / 1080) * 100}cqw`,
            height: percent(layer.height, 1920),
            left: percent(layer.x, 1080),
            opacity: layer.opacity ?? 1,
            top: percent(layer.y, 1920),
            width: percent(layer.width, 1080),
          }}
        />
      ))}
      <BoardThumbnailAsset blockId="atelierLogo" branding={branding} fallbackAssetId="logo-original" />
      <BoardThumbnailAsset blockId="eventBlock" branding={branding} fallbackAssetId="event-original" />
      <BoardThumbnailText id="headline" branding={branding} />
      <BoardThumbnailText id="cta" branding={branding} />
    </div>
  );
}

function BoardThumbnailAsset({
  blockId,
  branding,
  fallbackAssetId,
}: {
  blockId: "atelierLogo" | "eventBlock";
  branding: BrandingSnapshot;
  fallbackAssetId: "logo-original" | "event-original";
}) {
  const block = branding.blocks[blockId];
  if (block.hidden) return null;
  const asset = ATELIER_ASSET_BY_ID[block.assetId ?? fallbackAssetId] ?? ATELIER_ASSET_BY_ID[fallbackAssetId];

  return (
    <LoadingImage
      alt=""
      className="board-thumbnail-asset"
      showStatus={false}
      src={`/brand/atelier-de-sevres/assets/${asset.file}`}
      style={{
        height: percent(asset.height * block.scaleY, 1920),
        left: percent(block.x, 1080),
        top: percent(block.y, 1920),
        width: percent(asset.width * block.scaleX, 1080),
      }}
      wrapperClassName="fill"
    />
  );
}

function BoardThumbnailText({
  id,
  branding,
}: {
  id: "headline" | "cta";
  branding: BrandingSnapshot;
}) {
  const config = branding.textConfig[id];
  const value = (id === "headline" ? branding.text?.headline : branding.text?.cta)?.trim();
  if (config.hidden || !value) return null;
  const isCta = id === "cta";
  const fontSize = config.fontSize;
  const lineHeight = config.lineHeight ?? (isCta ? 1 : 0.96);
  const ctaPadding = 12;
  const ctaLineCount = isCta ? estimateWrappedLineCount(config.uppercase === false ? value : value.toUpperCase(), config.width - ctaPadding * 2, fontSize) : 1;
  const ctaHeight = ctaLineCount * fontSize * 1.15 + ctaPadding * 2;

  return (
    <div
      className={`board-thumbnail-text ${id}`}
      style={{
        color: config.color ?? (isCta ? "#111111" : "#f1f0f0"),
        fontSize: `${(config.fontSize / 1080) * 100}cqw`,
        fontStyle: config.fontStyle?.includes("italic") ? "italic" : undefined,
        fontWeight: config.fontStyle?.includes("normal") ? 400 : 700,
        height: isCta ? percent(ctaHeight, 1920) : undefined,
        left: percent(config.x, 1080),
        letterSpacing: `${config.letterSpacing ?? 0}px`,
        lineHeight,
        padding: isCta ? percent(ctaPadding, 1080) : undefined,
        textAlign: config.textAlign ?? (isCta ? "center" : "left"),
        textShadow: (config.shadowBlur ?? (isCta ? 0 : 12)) > 0 && (config.shadowOpacity ?? (isCta ? 0 : 0.45)) > 0
          ? `0 ${config.shadowOffsetY ?? 8}px ${config.shadowBlur ?? 12}px rgba(0,0,0,${config.shadowOpacity ?? 0.45})`
          : undefined,
        textTransform: config.uppercase === false ? "none" : "uppercase",
        top: percent(config.y, 1920),
        width: percent(config.width, 1080),
      }}
    >
      {value}
    </div>
  );
}
