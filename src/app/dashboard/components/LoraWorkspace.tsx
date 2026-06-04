import { AlertTriangle, Images, LoaderCircle, UploadCloud, X, Zap } from "lucide-react";
import type { DuplicateGroup } from "../../../lib/perceptualHash";
import type { PreviewFile, TrainingBadge } from "../../types";
import { LoadingImage } from "../../components/LoadingImage";
import { TrainingPanel } from "./TrainingPanel";

type Props = {
  files: PreviewFile[];
  onFilesAdd: (fileList: FileList | null) => void;
  onFileRemove: (id: string) => void;
  styleName: string;
  schoolName: string;
  triggerWord: string;
  steps: number;
  onStyleNameChange: (v: string) => void;
  onSchoolNameChange: (v: string) => void;
  onTriggerWordChange: (v: string) => void;
  onStepsChange: (v: number) => void;
  canTrain: boolean;
  training: boolean;
  onStartTraining: () => void;
  progress: number;
  progressLabel: string;
  trainingStatus: string;
  trainingBadge: TrainingBadge;
  trainedLoraUrl: string;
  logs: Array<{ text: string; tone?: string }>;
  copied: boolean;
  onCopyLoraUrl: () => void;
  duplicates: DuplicateGroup[];
};

export function LoraWorkspace({
  files, onFilesAdd, onFileRemove,
  styleName, schoolName, triggerWord, steps,
  onStyleNameChange, onSchoolNameChange, onTriggerWordChange, onStepsChange,
  canTrain, training, onStartTraining,
  progress, progressLabel, trainingStatus, trainingBadge, trainedLoraUrl,
  logs, copied, onCopyLoraUrl, duplicates,
}: Props) {
  return (
    <section className="workspace-single" aria-label="Entraîner un modèle">
      <section className="phase-stack">
        <div className="panel">
          <div className="panel-head">
            <h1>Entraîner un modèle</h1>
            <span className="tag">10-20 images</span>
          </div>
          <div className="notice">
            <Images size={18} />
            <span>
              Uploadez des images coherentes du style visuel: affiches, visuels reseaux,
              photos de campagne ou assets de marque.
            </span>
          </div>

          <label
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onFilesAdd(e.dataTransfer.files); }}
          >
            <input accept="image/*" multiple onChange={(e) => onFilesAdd(e.target.files)} type="file" />
            <UploadCloud size={34} />
            <strong>Glissez vos images ici</strong>
            <span>JPG, PNG, WEBP · minimum 3 pour tester, 10+ recommande</span>
          </label>

          {files.length > 0 ? (
            <>
              <div className="image-grid">
                {files.map((preview) => (
                  <div className="image-thumb" key={preview.id}>
                    <LoadingImage alt="" className="h-full w-full object-cover" src={preview.url} wrapperClassName="block" />
                    <button
                      aria-label="Retirer cette image"
                      className="remove-thumb"
                      onClick={() => onFileRemove(preview.id)}
                      type="button"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <p className="count">
                <strong>{files.length}</strong> image(s) selectionnee(s)
              </p>
              {duplicates.length > 0 && (
                <div className="notice warning">
                  <AlertTriangle size={18} />
                  <span>
                    {duplicates.length} groupe{duplicates.length > 1 ? "s" : ""} de doublons visuels détectés —{" "}
                    {duplicates.reduce((n, g) => n + g.files.length - 1, 0)} image(s) redondante(s).
                    Retirez-les pour améliorer l&apos;entraînement.
                  </span>
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Configuration du modèle</h2>
          </div>
          <div className="field-grid">
            <label className="field">
              <span>Nom du style</span>
              <input
                maxLength={40}
                onChange={(e) => onStyleNameChange(e.target.value)}
                placeholder="ex: ECV Paris"
                value={styleName}
              />
              <small>Nom lisible pour retrouver ce style.</small>
            </label>
            <label className="field">
              <span>Ecole</span>
              <input
                maxLength={40}
                onChange={(e) => onSchoolNameChange(e.target.value)}
                placeholder="ex: LISAA"
                value={schoolName}
              />
              <small>Organisation associee a ce LoRA.</small>
            </label>
            <label className="field">
              <span>Trigger word</span>
              <input
                maxLength={20}
                onChange={(e) => onTriggerWordChange(e.target.value.toUpperCase())}
                placeholder="ex: ECVSTYLE"
                value={triggerWord}
              />
              <small>Mot-cle a inclure dans vos prompts.</small>
            </label>
          </div>

          <label className="field">
            <span>Nombre de steps d&apos;entrainement</span>
            <div className="range-row">
              <input
                max={2000}
                min={500}
                onChange={(e) => onStepsChange(Number(e.target.value))}
                step={100}
                type="range"
                value={steps}
              />
              <output>{steps}</output>
            </div>
            <small>500 rapide · 1000 equilibre · 2000 plus precis.</small>
          </label>

          <button
            className="button primary full"
            disabled={!canTrain || training}
            onClick={onStartTraining}
            type="button"
          >
            {training ? <LoaderCircle className="spin" size={16} /> : <Zap size={16} />}
            Lancer l&apos;entraînement
          </button>
        </div>

        {(training || progress > 0 || trainedLoraUrl) ? (
          <TrainingPanel
            badge={trainingBadge}
            copied={copied}
            label={progressLabel}
            logs={logs}
            loraUrl={trainedLoraUrl}
            onCopy={onCopyLoraUrl}
            progress={progress}
            status={trainingStatus}
          />
        ) : null}
      </section>
    </section>
  );
}
