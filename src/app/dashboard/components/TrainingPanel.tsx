import { Copy } from "lucide-react";
import type { TrainingBadge } from "../../types";

type Props = {
  badge: TrainingBadge;
  copied: boolean;
  label: string;
  logs: Array<{ text: string; tone?: string }>;
  loraUrl: string;
  onCopy: () => void;
  progress: number;
  status: string;
};

export function TrainingPanel({ badge, copied, label, logs, loraUrl, onCopy, progress, status }: Props) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Entrainement</h2>
        <span className={`badge ${badge}`}>
          <span className="badge-dot" />
          {status}
        </span>
      </div>
      <div className="progress-wrap">
        <div className="progress-head">
          <span>{label}</span>
          <strong>{Math.round(progress)}%</strong>
        </div>
        <div className="progress-bar">
          <div className={`progress-fill ${badge === "training" ? "pulse" : ""}`} style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="log-box" aria-live="polite">
        {logs.map((log, index) => (
          <div className={log.tone ?? ""} key={`${log.text}-${index}`}>
            {log.text}
          </div>
        ))}
      </div>
      {loraUrl ? (
        <div className="lora-box">
          <span>LoRA entraine · URL des poids</span>
          <code>{loraUrl}</code>
          <div className="action-row">
            <button className="button ghost small" onClick={onCopy} type="button">
              <Copy size={14} />
              {copied ? "Copie" : "Copier"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
