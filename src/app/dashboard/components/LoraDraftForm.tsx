import type { LoraDraft } from "../../types";

type Props = {
  draft: LoraDraft;
  onChange: (draft: LoraDraft) => void;
};

export function LoraDraftForm({ draft, onChange }: Props) {
  return (
    <div className="phase-stack tight">
      <div className="field-grid">
        <label className="field">
          <span>Nom</span>
          <input
            maxLength={40}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="ex: LISAA archi"
            value={draft.name}
          />
        </label>
        <label className="field">
          <span>Ecole</span>
          <input
            maxLength={40}
            onChange={(e) => onChange({ ...draft, school: e.target.value })}
            placeholder="ex: LISAA"
            value={draft.school}
          />
        </label>
      </div>
      <label className="field">
        <span>Trigger word</span>
        <input
          maxLength={30}
          onChange={(e) => onChange({ ...draft, triggerWord: e.target.value.toUpperCase() })}
          placeholder="ex: LISAA ARCHI"
          value={draft.triggerWord}
        />
      </label>
      <label className="field">
        <span>URL du LoRA</span>
        <input
          onChange={(e) => onChange({ ...draft, url: e.target.value })}
          placeholder="https://...safetensors"
          value={draft.url}
        />
      </label>
    </div>
  );
}
