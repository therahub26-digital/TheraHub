"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { Card, PersonCell, Badge, StatusBadge } from "@/components/ui";
import { useUserSearch, UsersSearchBox } from "@/components/UsersSearch";
import type { Employee } from "@/lib/types";

// ---------------------------------------------------------------------
// Client half of /admin/users (Users & Assignment). User (2026-08-25):
// "user & assignment: cari ... belum fungsi" — the search box used to
// be `disabled`. This owns the search state and filters `rows` by
// name/email/code client-side; salary/referral cells arrive pre-built
// from the server component (see app/admin/users/page.tsx) since a
// client component can't accept a render function from a server
// component, only already-rendered JSX.
// ---------------------------------------------------------------------

type Row = {
  employee: Employee;
  outletName: string;
  salary: ReactNode;
  referral: ReactNode;
};

export default function UsersTable({
  rows,
  roleTone,
}: {
  rows: Row[];
  roleTone: Record<string, "purple" | "gold" | "info" | "accent" | "neutral">;
}) {
  const { query, setQuery, filtered } = useUserSearch(rows.map((r) => r.employee));
  const filteredRows = rows.filter((r) => filtered.includes(r.employee));

  return (
    <>
      <div className="row g2 wrap" style={{ marginBottom: 16, justifyContent: "flex-end" }}>
        <UsersSearchBox value={query} onChange={setQuery} />
      </div>

      <Card>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>User</th><th>Role</th><th>Outlet Scope</th><th>Gaji Tetap</th><th>Referral</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted small" style={{ textAlign: "center", padding: "24px 0" }}>
                    Tidak ada user yang cocok dengan &quot;{query}&quot;.
                  </td>
                </tr>
              )}
              {filteredRows.map(({ employee: e, outletName, salary, referral }) => (
                <tr key={e.id}>
                  <td><PersonCell name={e.name} sub={e.code} toneKey={e.avatarTone} photoUrl={e.photoUrl} /></td>
                  <td><Badge tone={roleTone[e.jobRole] ?? "neutral"}>{e.jobRole}</Badge></td>
                  <td className="muted">{outletName}</td>
                  <td>{salary}</td>
                  <td>{referral}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td>
                    <div className="row g1">
                      {/* Profil Terapis (2026-08-25) — data pribadi, lihat-saja untuk Admin/Owner. Lihat migrasi 0026. */}
                      {e.jobRole === "Terapis" && (
                        <Link href={`/admin/users/${e.id}/profile`} className="btn btn-ghost btn-icon btn-sm" title="Lihat Profil Terapis">
                          <Icon name="user-round" size={14} />
                        </Link>
                      )}
                      <button className="btn btn-quiet btn-icon btn-sm" disabled title="Belum tersedia — fiturnya belum dibangun."><Icon name="more" size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
