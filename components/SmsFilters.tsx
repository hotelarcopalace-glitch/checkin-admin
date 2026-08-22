"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { STATUSES } from "@/lib/sms-status";

export default function SmsFilters() {
  const router = useRouter();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");
  const status = params.get("status") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const size = params.get("size") ?? "25";

  useEffect(() => {
    setQ(params.get("q") ?? "");
  }, [params]);

  function apply(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    router.push(`/admin/sms?${next.toString()}`);
  }

  const field =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
  const hasFilters = Boolean(q || status || from || to);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q });
      }}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="min-w-52 flex-1">
        <label className="mb-1 block text-xs font-medium text-slate-500">Search</label>
        <input
          className={`${field} w-full`}
          placeholder="Phone, guest name or message…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
        <select className={field} value={status} onChange={(e) => apply({ status: e.target.value })}>
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
        <input
          type="date"
          className={field}
          value={from}
          onChange={(e) => apply({ from: e.target.value })}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
        <input
          type="date"
          className={field}
          value={to}
          onChange={(e) => apply({ to: e.target.value })}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Per page</label>
        <select className={field} value={size} onChange={(e) => apply({ size: e.target.value })}>
          {["10", "25", "50", "100"].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
      >
        Apply
      </button>

      {hasFilters && (
        <button
          type="button"
          onClick={() => router.push("/admin/sms")}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Reset
        </button>
      )}
    </form>
  );
}
