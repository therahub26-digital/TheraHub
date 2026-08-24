"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";

// ---------------------------------------------------------------------
// User (2026-08-25): "user & assignment: cari ... belum fungsi" — the
// search box on /admin/users was `disabled` with a "belum menyaring
// tabel" tooltip. This wraps the search input + the already-rendered
// table rows (passed as children, keyed by data-search on each <tr>)
// so typing here actually filters which rows show, entirely
// client-side — no new query/action needed, EMPLOYEES is already
// fully loaded server-side.
// ---------------------------------------------------------------------

export function UsersSearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="search-box">
      <Icon name="search" size={15} />
      <input
        className="input"
        placeholder="Cari nama atau email…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 220 }}
      />
    </div>
  );
}

export function useUserSearch<T extends { name: string; email?: string | null; code?: string }>(items: T[]) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((e) => {
      const name = e.name?.toLowerCase() ?? "";
      const email = e.email?.toLowerCase() ?? "";
      const code = e.code?.toLowerCase() ?? "";
      return name.includes(q) || email.includes(q) || code.includes(q);
    });
  }, [items, query]);
  return { query, setQuery, filtered };
}
