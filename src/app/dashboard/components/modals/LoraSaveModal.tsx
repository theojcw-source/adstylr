import { Check, Plus, X } from "lucide-react";
import type { LoraDraft } from "../../../types";
import { LoraDraftForm } from "../LoraDraftForm";

type Props = {
  open: boolean;
  title: string;
  description: string;
  draft: LoraDraft;
  saveLabel?: string;
  saveIcon?: "check" | "plus";
  closeLabel?: string;
  onChange: (draft: LoraDraft) => void;
  onSave: () => void;
  onClose: () => void;
};

export function LoraSaveModal({
  open,
  title,
  description,
  draft,
  saveLabel = "Sauvegarder",
  saveIcon = "check",
  closeLabel = "Plus tard",
  onChange,
  onSave,
  onClose,
}: Props) {
  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="lora-save-modal-title">
      <div className="modal">
        <div className="modal-topline">
          <div>
            <h2 id="lora-save-modal-title">{title}</h2>
            <p>{description}</p>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <LoraDraftForm draft={draft} onChange={onChange} />
        <div className="modal-actions">
          <button
            className="button primary"
            disabled={!draft.url.trim() || !draft.triggerWord.trim()}
            onClick={onSave}
            type="button"
          >
            {saveIcon === "plus" ? <Plus size={16} /> : <Check size={16} />}
            {saveLabel}
          </button>
          <button className="button ghost" onClick={onClose} type="button">
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
