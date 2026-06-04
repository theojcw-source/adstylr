import { LoaderCircle, UploadCloud, X, Zap } from "lucide-react";
import type { PreviewFile, TrainingBadge } from "../../types";
import { LoadingImage } from "../../components/LoadingImage";
import { TrainingPanel } from "./TrainingPanel";

type Props = {
  doraFiles: PreviewFile[];
  onDoraFilesAdd: (fileList: FileList | null) => void;
  onDoraFileRemove: (id: string) => void;
  doraStyleName: string;
  doraSchoolName: string;
  doraTriggerWord: string;
  doraSteps: number;
  doraRank: number;
  onDoraStyleNameChange: (v: string) => void;
  onDoraSchoolNameChange: (v: string) => void;
  onDoraTriggerWordChange: (v: string) => void;
  onDoraStepsChange: (v: number) => void;
  onDoraRankChange: (v: number) => void;
  doraTraining: boolean;
  onStartDoraTraining: () => void;
  doraProgress: number;
  doraProgressLabel: string;
  doraTrainingStatus: string;
  doraBadge: TrainingBadge;
  doraLoraUrl: string;
  doraLogs: Array<{ text: string; tone?: string }>;
};

export function DoraWorkspace({
  doraFiles, onDoraFilesAdd, onDoraFileRemove,
  doraStyleName, doraSchoolName, doraTriggerWord, doraSteps, doraRank,
  onDoraStyleNameChange, onDoraSchoolNameChange, onDoraTriggerWordChange, onDoraStepsChange, onDoraRankChange,
  doraTraining, onStartDoraTraining,
  doraProgress, doraProgressLabel, doraTrainingStatus, doraBadge, doraLoraUrl,
  doraLogs,
}: Props) {
  return (
    <section className="workspace-single" aria-label="Créer un DoRA">
      <section className="phase-stack">
        <div className="panel">
          <div className="panel-head">
            <h1>Entraînement avancé</h1>
            <span className="tag">~$1.24 · H100</span>
          </div>
          <div className="notice">
            <Zap size={18} />
            <span>
              Entraînement sur GPU H100 via Replicate. Plus rapide et souvent plus précis,
              compatible avec tous les endpoints de génération.
            </span>
          </div>

          <label
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onDoraFilesAdd(e.dataTransfer.files); }}
          >
            <input accept="image/*" multiple onChange={(e) => onDoraFilesAdd(e.target.files)} type="file" />
            <UploadCloud size={34} />
            <strong>Glissez vos images ici</strong>
            <span>JPG, PNG, WEBP · minimum 10 recommandé</span>
          </label>

          {doraFiles.length > 0 ? (
            <>
              <div className="image-grid">
                {doraFiles.map((preview) => (
                  <div className="image-thumb" key={preview.id}>
                    <LoadingImage alt="" className="h-full w-full object-cover" src={preview.url} wrapperClassName="block" />
                    <button
                      aria-label="Retirer cette image"
                      className="remove-thumb"
                      onClick={() => onDoraFileRemove(preview.id)}
                      type="button"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <p className="count">
                <strong>{doraFiles.length}</strong> image(s) selectionnee(s)
              </p>
            </>
          ) : null}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Configuration du DoRA</h2>
          </div>
          <div className="field-grid">
            <label className="field">
              <span>Nom du style</span>
              <input
                maxLength={40}
                onChange={(e) => onDoraStyleNameChange(e.target.value)}
                placeholder="ex: ECV Paris"
                value={doraStyleName}
              />
            </label>
            <label className="field">
              <span>Ecole</span>
              <input
                maxLength={40}
                onChange={(e) => onDoraSchoolNameChange(e.target.value)}
                placeholder="ex: LISAA"
                value={doraSchoolName}
              />
            </label>
            <label className="field">
              <span>Trigger word</span>
              <input
                maxLength={20}
                onChange={(e) => onDoraTriggerWordChange(e.target.value.toUpperCase())}
                placeholder="ex: ECVSTYLE"
                value={doraTriggerWord}
              />
            </label>
          </div>

          <label className="field">
            <span>Steps d&apos;entrainement</span>
            <div className="range-row">
              <input
                max={4000}
                min={500}
                onChange={(e) => onDoraStepsChange(Number(e.target.value))}
                step={100}
                type="range"
                value={doraSteps}
              />
              <output>{doraSteps}</output>
            </div>
            <small>500 rapide · 1000 equilibre · 2000+ precis.</small>
          </label>

          <label className="field">
            <span>Rang (LoRA rank)</span>
            <div className="range-row">
              <input
                max={64}
                min={8}
                onChange={(e) => onDoraRankChange(Number(e.target.value))}
                step={8}
                type="range"
                value={doraRank}
              />
              <output>{doraRank}</output>
            </div>
            <small>16 standard · 32 plus expressif · 64 max.</small>
          </label>

          <button
            className="button primary full"
            disabled={doraFiles.length < 3 || !doraTriggerWord.trim() || doraTraining}
            onClick={onStartDoraTraining}
            type="button"
          >
            {doraTraining ? <LoaderCircle className="spin" size={16} /> : <Zap size={16} />}
            Lancer l&apos;entrainement
          </button>
        </div>

        {(doraTraining || doraProgress > 0 || doraLoraUrl) ? (
          <TrainingPanel
            badge={doraBadge}
            copied={false}
            label={doraProgressLabel}
            logs={doraLogs}
            loraUrl={doraLoraUrl}
            onCopy={() => navigator.clipboard.writeText(doraLoraUrl)}
            progress={doraProgress}
            status={doraTrainingStatus}
          />
        ) : null}
      </section>
    </section>
  );
}
