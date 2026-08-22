"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { STATUSES } from "@/lib/sms-status";

export default function SmsFilters() {
  const router = useRouter();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");

  useEffect(() => {
    setQ(params.get("q") ?? "");
    setStatus(params.get("status") ?? "");
    setFrom(params.get("from") ?? "");
    setTo(params.get("to") ?? "");
  }, [params]);

  function apply(e?: React.FormEvent) {
    e?.preventDefault();
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (status) next.set("status", status);
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    const size = params.get("size");
    if (size) next.set("size", size);
    router.push(`/admin/sms${next.toString() ? `?${next}` : ""}`);
  }

  return (
    <form className="filter-card" onSubmit={apply}>
      <div className="filter-row">
        <input
          type="text"
          placeholder="Search SMS text / mobile…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <input type="date" title="From date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" title="To date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="submit" className="btn btn-primary">
          Filter
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => router.push("/admin/sms")}>
          Clear
        </button>
      </div>
    </form>
  );
}
