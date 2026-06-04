import { LoaderCircle, RefreshCcw, X } from "lucide-react";

type Props = {
  open: boolean;
  prompt: string;
  strength: number;
  loading: boolean;
  error: string;
  onPromptChange: (v: string) => void;
  onStrengthChange: (v: number) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function Img2ImgModal({ open, prompt, strength, loading, error, onPromptChange, onStrengthChange, onSubmit, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="img2img-modal-title">
      <div className="modal">
        <div className="modal-topline">
          <div>
            <h2 id="img2img-modal-title">Régénérer à partir de l&apos;image</h2>
            <p>Décrit la nouvelle version — la structure visuelle est conservée.</p>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <div className="phase-stack tight">
          <label className="field">
            <span>Prompt</span>
            <textarea
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Une scène lumineuse, tons chauds, architecture moderne…"
              rows={3}
              value={prompt}
            />
          </label>
          <label className="field">
            <span>
              Force{" "}
              <small style={{ opacity: 0.6 }}>
                — {Math.round(strength * 100)}% (bas = fidèle à l&apos;original, haut = plus créatif)
              </small>
            </span>
            <input
              max={1}
              min={0.1}
              onChange={(e) => onStrengthChange(Number(e.target.value))}
              step={0.05}
              type="range"
              value={strength}
            />
          </label>
          {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p> : null}
        </div>
        <div className="modal-actions">
          <button
            className="button primary"
            disabled={loading || !prompt.trim()}
            onClick={onSubmit}
            type="button"
          >
            {loading ? <LoaderCircle className="spin" size={16} /> : <RefreshCcw size={16} />}
            Régénérer
          </button>
          <button className="button ghost" onClick={onClose} type="button">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
