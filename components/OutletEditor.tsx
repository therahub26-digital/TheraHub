"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { setOutletIdentity } from "@/lib/actions/outlets";
import type { Outlet } from "@/lib/types";

// ---------------------------------------------------------------------
// Edit an outlet's own details — new 2026-08-24 (backlog 15 / 5.3).
//
// This closes a loop that was previously broken at both ends:
// /manager/settings shows outlet name/address/phone read-only and tells
// the manager that "perubahan alamat ... dilakukan oleh Admin Tenant di
// menu Outlets" — but /admin/outlets had no edit control at all, so that
// instruction pointed nowhere. Now it points here.
//
// Two fields are deliberately absent from this form:
//
//   - `code` and `receipt_prefix`, because both are embedded in receipt
//     numbers already issued (CKW-20260821-7K2Q). Editing either would
//     leave historical receipts attributable to an outlet code that no
//     longer exists.
//   - lat/lng/radius, which live on /admin/geofence where the map
//     preview gives them the context they need.
// ---------------------------------------------------------------------

export default function OutletEditor({ outlet }: { outlet: Outlet }) {
  const initial = {
    name: outlet.name,
    address: outlet.address,
    city: outlet.city,
    phone: outlet.phone,
    openHours: outlet.openHours,
    managerName: outlet.managerName,
  };
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        className="btn btn-quiet btn-icon btn-sm"
        title={`Edit data ${outlet.name}`}
        aria-label={`Edit data ${outlet.name}`}
        onClick={() => { setV(initial); setError(null); setOpen(true); }}
      >
        <Icon name="edit" size={15} />
      </button>
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div
        className="stack g2"
        style={{
          position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30,
          padding: "14px 16px", borderRadius: "var(--r-md)",
          background: "var(--bg-panel, var(--bg-deep))", border: "1px solid var(--border)",
          minWidth: 320, maxWidth: 320, maxHeight: "70vh", overflowY: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)", textAlign: "left",
        }}
      >
        <div className="small strong" style={{ color: "var(--text-1)" }}>Edit outlet — {outlet.code}</div>

        <label className="stack g1">
          <span className="tiny dim">Nama outlet</span>
          <input className="input" value={v.name} disabled={isPending} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </label>
        <label className="stack g1">
          <span className="tiny dim">Alamat</span>
          <input className="input" value={v.address} disabled={isPending} onChange={(e) => setV({ ...v, address: e.target.value })} />
        </label>
        <div className="row g2">
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Kota</span>
            <input className="input" value={v.city} disabled={isPending} onChange={(e) => setV({ ...v, city: e.target.value })} />
          </label>
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Telepon</span>
            <input className="input" value={v.phone} disabled={isPending} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          </label>
        </div>
        <label className="stack g1">
          <span className="tiny dim">Jam operasional</span>
          <input
            className="input"
            placeholder="mis. Senin–Minggu · 09:00–21:00"
            value={v.openHours}
            disabled={isPending}
            onChange={(e) => setV({ ...v, openHours: e.target.value })}
          />
        </label>
        <label className="stack g1">
          <span className="tiny dim">Nama manager</span>
          <input className="input" value={v.managerName} disabled={isPending} onChange={(e) => setV({ ...v, managerName: e.target.value })} />
        </label>

        <div className="tiny dim">
          Kode outlet &amp; prefix struk tidak bisa diubah — keduanya sudah tercetak di nomor struk
          yang terbit. Koordinat &amp; radius diatur di menu Geofence.
        </div>

        {error && (
          <div className="tiny" style={{ color: "var(--danger)" }}>
            <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
            {error}
          </div>
        )}

        <div className="row g2">
          <button
            className="btn btn-primary btn-sm"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const r = await setOutletIdentity(outlet.id, v);
                if (!r.ok) { setError(r.error); return; }
                setOpen(false);
              });
            }}
          >
            <Icon name="save" size={13} /> {isPending ? "Menyimpan…" : "Simpan"}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
