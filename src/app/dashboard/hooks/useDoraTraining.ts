import { fal } from "@fal-ai/client";
import JSZip from "jszip";
import { useEffect, useState } from "react";
import { REPLICATE_TRAINING_ID_KEY } from "../../constants";
import type { LoraDraft, PreviewFile, SavedLora, TrainingBadge } from "../../types";
import { readSessionValue } from "../../utils/storage";
import { createId, sleep, timeStamp } from "../../utils/misc";

type Options = {
  savedLoras: SavedLora[];
  persistLoras: (loras: SavedLora[]) => void;
  onRefreshFalCredits: () => void;
};

export function useDoraTraining({ savedLoras, persistLoras, onRefreshFalCredits }: Options) {
  const [doraFiles, setDoraFiles] = useState<PreviewFile[]>([]);
  const [doraStyleName, setDoraStyleName] = useState("");
  const [doraSchoolName, setDoraSchoolName] = useState("");
  const [doraTriggerWord, setDoraTriggerWord] = useState("");
  const [doraSteps, setDoraSteps] = useState(1000);
  const [doraRank, setDoraRank] = useState(16);
  const [doraTraining, setDoraTraining] = useState(false);
  const [doraTrainingId, setDoraTrainingId] = useState<string | null>(null);
  const [doraLoraUrl, setDoraLoraUrl] = useState("");
  const [doraProgress, setDoraProgress] = useState(0);
  const [doraProgressLabel, setDoraProgressLabel] = useState("En attente");
  const [doraBadge, setDoraBadge] = useState<TrainingBadge>("training");
  const [doraTrainingStatus, setDoraTrainingStatus] = useState("Initialisation");
  const [doraLogs, setDoraLogs] = useState<Array<{ text: string; tone?: string }>>([{ text: "Pret a demarrer" }]);
  const [doraSaveModalOpen, setDoraSaveModalOpen] = useState(false);
  const [doraSaveDraft, setDoraSaveDraft] = useState<LoraDraft>({ name: "", school: "", triggerWord: "", url: "" });

  useEffect(() => {
    const stored = readSessionValue(REPLICATE_TRAINING_ID_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setDoraTrainingId(stored);
  }, []);

  function handleDoraFiles(fileList: FileList | null) {
    if (!fileList) return;
    const next = Array.from(fileList)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({ id: `${f.name}-${f.lastModified}-${crypto.randomUUID()}`, file: f, url: URL.createObjectURL(f) }));
    setDoraFiles((c) => [...c, ...next].slice(0, 25));
  }

  function removeDoraFile(id: string) {
    setDoraFiles((c) => {
      const removed = c.find((p) => p.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return c.filter((p) => p.id !== id);
    });
  }

  function saveDoraLora(draft: LoraDraft) {
    const cleanUrl = draft.url.trim();
    const cleanTrigger = draft.triggerWord.trim().toUpperCase();
    if (!cleanUrl || !cleanTrigger) return;
    persistLoras([
      {
        id: createId(),
        name: draft.name.trim() || cleanTrigger,
        school: draft.school.trim(),
        triggerWord: cleanTrigger,
        url: cleanUrl,
        createdAt: new Date().toISOString(),
      },
      ...savedLoras,
    ]);
  }

  async function startDoraTraining() {
    setDoraTraining(true);
    setDoraBadge("training");
    setDoraTrainingStatus("Initialisation");
    setDoraProgress(5);
    setDoraProgressLabel("Compression des images");
    setDoraLogs([{ text: `[${timeStamp()}] Creation du ZIP`, tone: "info" }]);

    try {
      const zip = new JSZip();
      doraFiles.forEach(({ file }) => zip.file(file.name, file));
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipFile = new File([zipBlob], "styleforge-dora-images.zip", { type: "application/zip" });

      setDoraProgress(20);
      setDoraProgressLabel("Upload des images");
      const imageUrl = await fal.storage.upload(zipFile);
      setDoraLogs((c) => [...c, { text: `[${timeStamp()}] Upload OK`, tone: "ok" }]);

      setDoraProgress(30);
      setDoraProgressLabel("Soumission du job Replicate");

      const response = await fetch("/api/replicate/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          triggerWord: doraTriggerWord.trim() || "STYLE",
          steps: doraSteps,
        }),
      });

      const payload = (await response.json()) as { id?: string; message?: string };
      if (!response.ok || !payload.id) throw new Error(payload.message ?? "Replicate n'a pas retourne d'ID");

      setDoraTrainingId(payload.id);
      sessionStorage.setItem(REPLICATE_TRAINING_ID_KEY, payload.id);
      setDoraLogs((c) => [...c, { text: `[${timeStamp()}] Job soumis: ${payload.id}`, tone: "ok" }]);

      await pollDoraTraining(payload.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      setDoraLogs((c) => [...c, { text: `[${timeStamp()}] Erreur: ${message}`, tone: "err" }]);
      setDoraBadge("error");
      setDoraTrainingStatus("Erreur");
      setDoraProgressLabel("Erreur");
    } finally {
      setDoraTraining(false);
    }
  }

  async function pollDoraTraining(id: string) {
    let percent = 35;
    setDoraTrainingStatus("Entrainement");

    while (true) {
      await sleep(10000);

      const response = await fetch(`/api/replicate/train?id=${id}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        status: string;
        loraUrl?: string;
        error?: string;
        log?: string;
      };

      if (payload.log) setDoraLogs((c) => [...c.slice(-40), { text: `[${timeStamp()}] ${payload.log}` }]);

      if (payload.status === "succeeded") {
        const trainedUrl = payload.loraUrl;
        if (!trainedUrl) throw new Error("DoRA URL introuvable dans la reponse Replicate");

        setDoraLoraUrl(trainedUrl);
        sessionStorage.removeItem(REPLICATE_TRAINING_ID_KEY);
        setDoraProgress(100);
        setDoraProgressLabel("Entrainement termine");
        setDoraBadge("done");
        setDoraTrainingStatus("Termine");
        setDoraLogs((c) => [...c, { text: `[${timeStamp()}] DoRA disponible: ${trainedUrl}`, tone: "ok" }]);
        setDoraSaveDraft({
          name: doraStyleName,
          school: doraSchoolName,
          triggerWord: doraTriggerWord.trim().toUpperCase() || "STYLE",
          url: trainedUrl,
        });
        setDoraSaveModalOpen(true);
        onRefreshFalCredits();
        return;
      }

      if (payload.status === "failed" || payload.status === "canceled") {
        throw new Error(payload.error ?? `Replicate: ${payload.status}`);
      }

      percent = Math.min(percent + 2, 88);
      setDoraProgress(percent);
      setDoraProgressLabel("Entrainement DoRA en cours");
    }
  }

  useEffect(() => {
    if (!doraTrainingId || doraLoraUrl || doraTraining) return;
    const timer = window.setTimeout(() => {
      setDoraTraining(true);
      setDoraBadge("training");
      setDoraTrainingStatus("Reprise");
      setDoraProgress(35);
      setDoraProgressLabel("Reprise du job");
      setDoraLogs([{ text: `[${timeStamp()}] Reprise: ${doraTrainingId}`, tone: "info" }]);
      void pollDoraTraining(doraTrainingId).finally(() => setDoraTraining(false));
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doraTrainingId, doraLoraUrl, doraTraining]);

  return {
    doraFiles,
    doraStyleName, setDoraStyleName,
    doraSchoolName, setDoraSchoolName,
    doraTriggerWord, setDoraTriggerWord,
    doraSteps, setDoraSteps,
    doraRank, setDoraRank,
    doraTraining,
    doraLoraUrl,
    doraProgress, doraProgressLabel, doraBadge, doraTrainingStatus,
    doraLogs,
    doraSaveModalOpen, setDoraSaveModalOpen, doraSaveDraft, setDoraSaveDraft,
    handleDoraFiles, removeDoraFile, startDoraTraining, saveDoraLora,
  };
}
