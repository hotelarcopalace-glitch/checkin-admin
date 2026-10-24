"use client";

import type { ReactNode } from "react";

// Types and small helpers shared by the BuildKhata screens (BuildApp and build-khata).

export type Project = { id: string; name: string; client: string; value: number | null };
export type Kind = "IN" | "MAT" | "LAB";
export type Entry = {
  id: string;
  projectId: string;
  kind: Kind;
  category: string;
  amount: number;
  date: string;
  party: string;
  partyId: string;
  note: string;
  user: string;
};
export type PartyKind = "SUP" | "LAB";
export type Party = { id: string; kind: PartyKind; name: string; phone: string; note: string; active: boolean };

export const money = (n: number) => "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
export const money0 = (n: number) => money(n).slice(1);

export function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function fmtDateYear(iso: string) {
  const d = new Date(iso + "T00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function csvCell(s: string | number) {
  const v = String(s ?? "");
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  try {
    const blob = new Blob(["﻿" + text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    /* ignore */
  }
}

export function Scrim({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">{children}</div>
    </div>
  );
}
