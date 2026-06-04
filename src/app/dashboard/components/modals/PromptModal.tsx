import { Check, LoaderCircle, X } from "lucide-react";

type PromptDraft = { id: string | null; label: string; category: string; prompt: string };

type Props = {
  open: boolean;
  draft: PromptDraft;
  saving: boolean;
  onChange: (draft: PromptDraft) => void;
  onSave: () => void;
  onClose: () => void;
};

export function PromptModal({ open, draft, saving, onChange, onSave, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="prompt-modal-title">
      <div className="modal">
        <div className="modal-topline">
          <div>
            <h2 id="prompt-modal-title">{draft.id ? "Modifier le prompt" : "Nouveau prompt"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <div className="phase-stack tight">
          <div className="field-grid">
            <label className="field">
              <span>Catégorie</span>
              <input
                onChange={(e) => onChange({ ...draft, category: e.target.value })}
                placeholder="Ex: Social, Affiche, Editorial…"
                type="text"
                value={draft.category}
              />
            </label>
            <label className="field">
              <span>Nom</span>
              <input
                onChange={(e) => onChange({ ...draft, label: e.target.value })}
                placeholder="Ex: Portes ouvertes"
                type="text"
                value={draft.label}
              />
            </label>
          </div>
          <label className="field">
            <span>
              Prompt{" "}
              <small style={{ opacity: 0.6 }}>— utilise {"{{TRIGGER}}"} pour le mot déclencheur</small>
            </span>
            <textarea
              onChange={(e) => onChange({ ...draft, prompt: e.target.value })}
              placeholder="{{TRIGGER}} campaign poster, …"
              rows={4}
              value={draft.prompt}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button
            className="button primary"
            disabled={saving || !draft.label.trim() || !draft.prompt.trim()}
            onClick={onSave}
            type="button"
          >
            {saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
            {draft.id ? "Enregistrer" : "Créer"}
          </button>
          <button className="button ghost" onClick={onClose} type="button">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
