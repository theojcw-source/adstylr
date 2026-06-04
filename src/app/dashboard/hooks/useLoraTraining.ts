import { fal } from "@fal-ai/client";
import JSZip from "jszip";
import { useEffect, useMemo, useState } from "react";
import { findDuplicates, type DuplicateGroup } from "../../../lib/perceptualHash";
import {
  FAL_FLUX_2_TRAINER_MODEL,
  FAL_SELECTED_LORA_URL_KEY,
  FAL_TRAINED_LORA_URL_KEY,
  FAL_TRAINING_REQUEST_ID_KEY,
} from "../../fal-models";
import { DEFAULT_PUBLISHED_STYLE, TRAINING_LABELS } from "../../constants";
import type { Brand, FalStatus, LoraDraft, PreviewFile, SavedLora, TrainingBadge, TrainingQueueResult, TrainingResult } from "../../types";
import { normalizeOrganizationKey } from "../../utils/brand";
import { readSessionValue } from "../../utils/storage";
import { createId, sleep, timeStamp } from "../../utils/misc";
import { migrateLoraUrl } from "../../utils/styles";

function summarizeTrainingResult(result: TrainingQueueResult) {
  const data = result.data as TrainingResult;
  return Object.keys(data).join(", ") || "aucune cle";
}

function getTrainingResultData(result: TrainingQueueResult): TrainingResult {
  return result.data;
}

type Options = {
  savedLoras: SavedLora[];
  persistLoras: (loras: SavedLora[]) => void;
  brands: Brand[];
  setSelectedBrandId: (id: string) => void;
  onRefreshFalCredits: () => void;
};

export function useLoraTraining({
  savedLoras,
  persistLoras,
  brands,
  setSelectedBrandId,
  onRefreshFalCredits,
}: Options) {
  const [files, setFiles] = useState<PreviewFile[]>([]);
  const [styleName, setStyleName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [loraUrl, setLoraUrl] = useState(DEFAULT_PUBLISHED_STYLE.loraUrl);
  const [triggerWord, setTriggerWord] = useState(DEFAULT_PUBLISHED_STYLE.triggerWord);
  const [steps, setSteps] = useState(1000);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [training, setTraining] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("En attente");
  const [trainingStatus, setTrainingStatus] = useState("Initialisation");
  const [trainingBadge, setTrainingBadge] = useState<TrainingBadge>("training");
  const [trainedLoraUrl, setTrainedLoraUrl] = useState("");
  const [logs, setLogs] = useState<Array<{ text: string; tone?: string }>>([{ text: "Pret a demarrer" }]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveDraft, setSaveDraft] = useState<LoraDraft>({ name: "", school: "", triggerWord: "", url: "" });
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState<LoraDraft>({ name: "", school: "", triggerWord: "", url: "" });
  const [copied, setCopied] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);

  useEffect(() => {
    const storedRequestId = localStorage.getItem(FAL_TRAINING_REQUEST_ID_KEY);
    const storedLoraUrl = readSessionValue(FAL_SELECTED_LORA_URL_KEY);
    const storedTrainedLoraUrl = localStorage.getItem(FAL_TRAINED_LORA_URL_KEY);

    /* eslint-disable react-hooks/set-state-in-effect */
    if (storedLoraUrl) {
      const migrated = migrateLoraUrl(storedLoraUrl);
      setLoraUrl(migrated);
      if (migrated !== storedLoraUrl) sessionStorage.setItem(FAL_SELECTED_LORA_URL_KEY, migrated);
    }
    if (storedTrainedLoraUrl) {
      setTrainedLoraUrl(storedTrainedLoraUrl);
      setProgress(100);
      setProgressLabel("Entrainement termine");
      setTrainingStatus("Termine");
      setTrainingBadge("done");
    }
    if (storedRequestId) setRequestId(storedRequestId);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    return () => { files.forEach((p) => URL.revokeObjectURL(p.url)); };
  }, [files]);

  const canTrain = useMemo(() => Boolean(files.length >= 3 && triggerWord.trim()), [files.length, triggerWord]);

  function addLog(text: string, tone?: string) {
    setLogs((c) => [...c.slice(-40), { text: `[${timeStamp()}] ${text}`, tone }]);
  }

  function resetLog(text: string, tone?: string) {
    setLogs([{ text: `[${timeStamp()}] ${text}`, tone }]);
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const next = Array.from(fileList)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({ id: `${f.name}-${f.lastModified}-${crypto.randomUUID()}`, file: f, url: URL.createObjectURL(f) }));
    setFiles((c) => {
      const merged = [...c, ...next].slice(0, 25);
      void findDuplicates(merged.map((p) => p.file)).then(setDuplicates).catch(() => setDuplicates([]));
      return merged;
    });
  }

  function removeFile(id: string) {
    setFiles((c) => {
      const removed = c.find((p) => p.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      const next = c.filter((p) => p.id !== id);
      void findDuplicates(next.map((p) => p.file)).then(setDuplicates).catch(() => setDuplicates([]));
      return next;
    });
  }

  function saveLora(draft: LoraDraft) {
    const cleanUrl = draft.url.trim();
    const cleanTrigger = draft.triggerWord.trim().toUpperCase();
    if (!cleanUrl || !cleanTrigger) return null;
    const lora: SavedLora = {
      id: createId(),
      name: draft.name.trim() || cleanTrigger,
      school: draft.school.trim(),
      triggerWord: cleanTrigger,
      url: cleanUrl,
      createdAt: new Date().toISOString(),
    };
    persistLoras([lora, ...savedLoras]);
    return lora;
  }

  function applySavedLora(lora: SavedLora) {
    setLoraUrl(lora.url);
    setTriggerWord(lora.triggerWord);
    const match = brands.find(
      (b) =>
        normalizeOrganizationKey(lora.school) === normalizeOrganizationKey(b.name) ||
        normalizeOrganizationKey(lora.school) === normalizeOrganizationKey(b.id),
    );
    if (match) setSelectedBrandId(match.id);
    sessionStorage.setItem(FAL_SELECTED_LORA_URL_KEY, lora.url);
  }

  function confirmTrainingSave() {
    saveLora(saveDraft);
    setSaveModalOpen(false);
  }

  function confirmManualSave() {
    const lora = saveLora(manualDraft);
    if (lora) applySavedLora(lora);
    setManualModalOpen(false);
  }

  async function handleCopyLoraUrl() {
    await navigator.clipboard.writeText(trainedLoraUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function pollTraining(activeRequestId: string) {
    let percent = 35;
    let labelIndex = 0;

    while (true) {
      await sleep(8000);

      const status = (await fal.queue.status(FAL_FLUX_2_TRAINER_MODEL, {
        requestId: activeRequestId,
        logs: true,
      })) as FalStatus;

      const lastLog = status.logs?.at(-1)?.message;
      if (lastLog) addLog(lastLog);

      if (status.status === "COMPLETED") {
        const result = (await fal.queue.result(FAL_FLUX_2_TRAINER_MODEL, {
          requestId: activeRequestId,
        })) as TrainingQueueResult;
        const data = getTrainingResultData(result);
        const url = data.diffusers_lora_file?.url ?? data.lora_file?.url;

        if (!url) throw new Error(`URL LoRA introuvable (${summarizeTrainingResult(result)})`);

        setTrainedLoraUrl(url);
        setLoraUrl(url);
        sessionStorage.setItem(FAL_SELECTED_LORA_URL_KEY, url);
        localStorage.setItem(FAL_TRAINED_LORA_URL_KEY, url);
        localStorage.removeItem(FAL_TRAINING_REQUEST_ID_KEY);
        setRequestId(null);
        setProgress(100);
        setProgressLabel("Entrainement termine");
        setTrainingBadge("done");
        setTrainingStatus("Termine");
        addLog(`LoRA disponible: ${url}`, "ok");
        setSaveDraft({
          name: styleName,
          school: schoolName,
          triggerWord: triggerWord.trim().toUpperCase() || "STYLE",
          url,
        });
        setSaveModalOpen(true);
        onRefreshFalCredits();
        return;
      }

      if (status.status === "FAILED") throw new Error("Entrainement echoue sur fal.ai");

      percent = Math.min(percent + 3, 88);
      if (percent > 50 && labelIndex < TRAINING_LABELS.length - 1) labelIndex += 1;
      setProgress(percent);
      setProgressLabel(TRAINING_LABELS[labelIndex]);
      setTrainingStatus("Entrainement");
    }
  }

  async function startTraining() {
    setTraining(true);
    setTrainingBadge("training");
    setTrainingStatus("Initialisation");
    setProgress(5);
    setProgressLabel("Compression des images");
    setTrainedLoraUrl("");
    localStorage.removeItem(FAL_TRAINED_LORA_URL_KEY);
    resetLog("Creation du ZIP", "info");

    try {
      const zip = new JSZip();
      files.forEach(({ file }) => zip.file(file.name, file));
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipFile = new File([zipBlob], "styleforge-images.zip", { type: "application/zip" });

      addLog("Upload vers fal.ai");
      setProgress(20);
      setProgressLabel("Upload des images");
      const imageUrl = await fal.storage.upload(zipFile);
      addLog(`Upload OK: ${imageUrl.slice(0, 72)}...`, "ok");

      setProgress(30);
      setProgressLabel("Soumission du job");
      const { request_id: submittedId } = await fal.queue.submit(FAL_FLUX_2_TRAINER_MODEL, {
        input: {
          default_caption: `a ${triggerWord.trim() || "STYLE"} style image`,
          image_data_url: imageUrl,
          output_lora_format: "fal",
          steps,
        },
      });

      setRequestId(submittedId);
      localStorage.setItem(FAL_TRAINING_REQUEST_ID_KEY, submittedId);
      addLog(`Job soumis: ${submittedId}`, "ok");
      await pollTraining(submittedId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      addLog(`Erreur: ${message}`, "err");
      setTrainingBadge("error");
      setTrainingStatus("Erreur");
      setProgressLabel("Erreur");
    } finally {
      setTraining(false);
    }
  }

  async function resumeTraining(activeRequestId: string) {
    setTraining(true);
    setTrainingBadge("training");
    setTrainingStatus("Reprise");
    setProgress(35);
    setProgressLabel("Entrainement en cours");
    addLog(`Reprise du job: ${activeRequestId}`, "info");

    try {
      await pollTraining(activeRequestId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      addLog(`Impossible de reprendre: ${message}`, "err");
      setTrainingBadge("error");
      setTrainingStatus("Erreur");
    } finally {
      setTraining(false);
    }
  }

  useEffect(() => {
    if (!requestId || training) return;
    const timer = window.setTimeout(() => void resumeTraining(requestId), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, training]);

  return {
    loraUrl, setLoraUrl,
    triggerWord, setTriggerWord,
    files,
    styleName, setStyleName,
    schoolName, setSchoolName,
    steps, setSteps,
    training, progress, progressLabel, trainingStatus, trainingBadge, trainedLoraUrl,
    logs, canTrain, copied,
    saveModalOpen, setSaveModalOpen, saveDraft, setSaveDraft,
    manualModalOpen, setManualModalOpen, manualDraft, setManualDraft,
    duplicates,
    handleFiles, removeFile, startTraining,
    saveLora, applySavedLora,
    confirmTrainingSave, confirmManualSave, handleCopyLoraUrl,
  };
}
