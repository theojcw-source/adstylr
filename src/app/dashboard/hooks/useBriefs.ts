"use client";

import { useCallback, useEffect, useState } from "react";
import type { BriefStatus, CreativeBrief } from "../../types";

type RawBrief = {
  id: string;
  title: string;
  description?: string;
  clientName?: string;
  brandId?: string;
  assets?: unknown;
  metadata?: unknown;
  status: BriefStatus;
  createdAt: string;
  updatedAt: string;
};

export function useBriefs(brandId?: string) {
  const [briefs, setBriefs] = useState<CreativeBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchBriefs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (brandId) params.set("brand_id", brandId);
      const res = await fetch(`/api/briefs?${params}`);
      if (!res.ok) throw new Error("Impossible de charger les briefs.");
      const data = (await res.json()) as RawBrief[];
      setBriefs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchBriefs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchBriefs]);

  async function updateStatus(id: string, status: BriefStatus) {
    setBriefs((prev) => prev.map((b) => b.id === id ? { ...b, status } : b));
    try {
      const res = await fetch(`/api/briefs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Mise à jour impossible.");
    } catch {
      void fetchBriefs();
    }
  }

  async function deleteBrief(id: string) {
    setBriefs((prev) => prev.filter((b) => b.id !== id));
    try {
      const res = await fetch(`/api/briefs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Suppression impossible.");
    } catch {
      void fetchBriefs();
    }
  }

  return { briefs, loading, error, refresh: fetchBriefs, updateStatus, deleteBrief };
}
