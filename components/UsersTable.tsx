"use client";

import { useState } from "react";
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
//
// UPDATE 2026-08-25 — user feedback: "filter user (manager, kasir,
// terapis) belum berfungsi". The role chips used to live in the server
// component (app/admin/users/page.tsx) as plain counters with a tooltip
// admitting they didn't filter anything. Moved here so one piece of
// client state drives both the chip highlighting and the actual row
// filter, combined with the existing search box (both narrow the same
// `rows` — a row must pass BOTH to show).
// ---------------------------------------------------------------------

type RoleFilter = "Semua" | "Manager" | "Kasir" | "Terapis" | "Lainnya";

function matchesRoleFilter(jobRole: string, filter: RoleFilter): boolean {
  if (filter === "Semua") return true;
  if (filter === "Lainnya") return jobRole !== "Manager" && jobRole !== "Kasir" && jobRole !== "Terapis";
  return jobRole === filter;
}

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
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("Semua");
  const roleFiltered = rows.filter((r) => matchesRoleFilter(r.employee.jobRole, roleFilter));

  const { query, setQuery, filtered } = useUserSearch(roleFiltered.map((r) => r.employee));
  const filteredRows = roleFiltered.filter((r) => filtered.includes(r.employee));

  const counts: Record<RoleFilter, number> = {
    Semua: rows.length,
    Manager: rows.filter((r) => r.employee.jobRole === "Manager").length,
    Kasir: rows.filter((r) => r.employee.jobRole === "Kasir").length,
    Terapis: rows.filter((r) => r.employee.jobRole === "Terapis").length,
    Lainnya: rows.filter((r) => matchesRoleFilter(r.employee.jobRole, "Lainnya")).length,
  };

  return (
    <>
      <div className="row g2 wrap" style={{ marginBottom: 16, justifyContent: "space-between" }}>
        <div className="row g2 wrap">
          {(["Semua", "Manager", "Kasir", "Terapis", "Lainnya"] as RoleFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`chip${roleFilter === f ? " on" : ""}`}
              style={{ cursor: "pointer", border: "none" }}
              onClick={() => setRoleFilter(f)}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>
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
                    {query
                      ? <>Tidak ada user yang cocok dengan &quot;{query}&quot;.</>
                      : <>Tidak ada user dengan peran &quot;{roleFilter}&quot;.</>}
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
