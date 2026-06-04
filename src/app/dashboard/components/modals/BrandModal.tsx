import { Check, LoaderCircle, X } from "lucide-react";

type BrandDraft = { name: string; logo: File | null; tagline: File | null };

type Props = {
  open: boolean;
  draft: BrandDraft;
  uploading: boolean;
  onChange: (draft: BrandDraft) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function BrandModal({ open, draft, uploading, onChange, onSubmit, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="brand-modal-title">
      <div className="modal">
        <div className="modal-topline">
          <div>
            <h2 id="brand-modal-title">Ajouter un branding</h2>
            <p>Logo et tagline en PNG avec transparence.</p>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <div className="phase-stack tight">
          <label className="field">
            <span>Nom de l&apos;école / marque</span>
            <input
              maxLength={40}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              placeholder="ex: ESG Defense"
              value={draft.name}
            />
          </label>
          <label className="field">
            <span>Logo (PNG)</span>
            <input
              accept="image/png"
              onChange={(e) => onChange({ ...draft, logo: e.target.files?.[0] ?? null })}
              type="file"
            />
            {draft.logo ? <small>{draft.logo.name}</small> : null}
          </label>
          <label className="field">
            <span>Tagline (PNG)</span>
            <input
              accept="image/png"
              onChange={(e) => onChange({ ...draft, tagline: e.target.files?.[0] ?? null })}
              type="file"
            />
            {draft.tagline ? <small>{draft.tagline.name}</small> : null}
          </label>
        </div>
        <div className="modal-actions">
          <button
            className="button primary"
            disabled={!draft.name || !draft.logo || !draft.tagline || uploading}
            onClick={onSubmit}
            type="button"
          >
            {uploading ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
            Ajouter
          </button>
          <button className="button ghost" onClick={onClose} type="button">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
