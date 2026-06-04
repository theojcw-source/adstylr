"use client";

import { RefreshCw, Trash2 } from "lucide-react";
import type { BriefStatus, CreativeBrief } from "../../types";
import { useBriefs } from "../hooks/useBriefs";

const STATUS_LABELS: Record<BriefStatus, string> = {
  new: "Nouveau",
  in_progress: "En cours",
  done: "Terminé",
  archived: "Archivé",
};

const STATUS_BADGE_CLASS: Record<BriefStatus, string> = {
  new: "badge training",
  in_progress: "badge",
  done: "badge done",
  archived: "badge",
};

const NEXT_STATUS: Record<BriefStatus, BriefStatus | null> = {
  new: "in_progress",
  in_progress: "done",
  done: "archived",
  archived: null,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function BriefCard({ brief, onStatusChange, onDelete }: {
  brief: CreativeBrief;
  onStatusChange: (id: string, status: BriefStatus) => void;
  onDelete: (id: string) => void;
}) {
  const next = NEXT_STATUS[brief.status];
  const assets = Array.isArray(brief.assets) ? (brief.assets as string[]) : [];

  return (
    <article className="brief-card">
      <header className="brief-card-header">
        <div className="brief-card-meta">
          <span className={STATUS_BADGE_CLASS[brief.status]}>{STATUS_LABELS[brief.status]}</span>
          {brief.clientName && <span className="brief-client">{brief.clientName}</span>}
        </div>
        <time className="brief-date" dateTime={brief.createdAt}>{formatDate(brief.createdAt)}</time>
      </header>

      <h3 className="brief-title">{brief.title}</h3>

      {brief.description && <p className="brief-description">{brief.description}</p>}

      {assets.length > 0 && (
        <div className="brief-assets">
          {assets.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="brief-asset-link">
              Fichier {i + 1}
            </a>
          ))}
        </div>
      )}

      <footer className="brief-card-footer">
        {next && (
          <button
            className="button small"
            onClick={() => onStatusChange(brief.id, next)}
            type="button"
          >
            → {STATUS_LABELS[next]}
          </button>
        )}
        <button
          className="button ghost small danger"
          onClick={() => onDelete(brief.id)}
          type="button"
          aria-label="Supprimer ce brief"
        >
          <Trash2 size={14} />
        </button>
      </footer>
    </article>
  );
}

export function BriefInbox({ brandId }: { brandId?: string }) {
  const { briefs, loading, error, refresh, updateStatus, deleteBrief } = useBriefs(brandId);

  const active = briefs.filter((b) => b.status !== "archived");
  const archived = briefs.filter((b) => b.status === "archived");

  return (
    <div className="brief-inbox">
      <div className="brief-inbox-header">
        <div>
          <h2 className="brief-inbox-title">Boîte de réception</h2>
          <p className="brief-inbox-subtitle">
            Briefs reçus via l&apos;API externe
            {active.length > 0 && <span className="brief-count">{active.length}</span>}
          </p>
        </div>
        <button className="button ghost small" onClick={() => void refresh()} type="button" title="Actualiser">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="brief-inbox-endpoint">
        <code>POST /api/briefs</code>
        <span className="brief-inbox-endpoint-hint">— Authorization: Bearer BRIEFS_API_KEY</span>
      </div>

      {loading && <p className="empty-state">Chargement…</p>}
      {!loading && error && <p className="empty-state" style={{ color: "var(--danger)" }}>{error}</p>}

      {!loading && !error && active.length === 0 && (
        <p className="empty-state">Aucun brief reçu pour le moment.</p>
      )}

      {active.length > 0 && (
        <div className="brief-list">
          {active.map((brief) => (
            <BriefCard key={brief.id} brief={brief} onStatusChange={updateStatus} onDelete={deleteBrief} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <details className="brief-archived-section">
          <summary className="brief-archived-summary">Archivés ({archived.length})</summary>
          <div className="brief-list">
            {archived.map((brief) => (
              <BriefCard key={brief.id} brief={brief} onStatusChange={updateStatus} onDelete={deleteBrief} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
