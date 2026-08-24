"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { createRoom, updateRoom, setRoomRetired, type RoomInput } from "@/lib/actions/rooms";
import type { Room } from "@/lib/types";

// ---------------------------------------------------------------------
// Write-side UI for rooms — new 2026-08-24 (backlog 15).
//
// Until now there was no way to add or edit a room anywhere in the app:
// /manager/rooms had "Room Baru" and "Edit" as disabled buttons, and
// /admin/rooms had a disabled "Tambah Room" whose tooltip told the user
// to go change the database by hand. This is the form that makes both
// real.
//
// Same inline dropdown-panel pattern as StaffEditor/InventoryEditor
// (this codebase still has no modal component, and adding one just for
// this would be a bigger change than the feature).
//
// Note on delete: there deliberately isn't one. See lib/actions/rooms.ts
// for why retiring (INACTIVE) is offered instead.
// ---------------------------------------------------------------------

const ROOM_TYPES: Room["type"][] = ["Massage", "Couple", "Reflexology Chair", "VIP", "Wet Room"];

/** Blank draft for "Room Baru". Buffer 10m matches the existing seeded rooms. */
const EMPTY = { code: "", name: "", type: ROOM_TYPES[0], capacity: "1", cleanupBuffer: "10", services: "" };

type Draft = typeof EMPTY;

function toDraft(room: Room): Draft {
  return {
    code: room.code,
    name: room.name,
    type: room.type,
    capacity: String(room.capacity),
    cleanupBuffer: String(room.cleanupBuffer),
    services: room.supportedServices.join(", "),
  };
}

function toInput(d: Draft, outletId: string): RoomInput {
  return {
    outletId,
    code: d.code,
    name: d.name,
    type: d.type,
    capacity: Number.parseInt(d.capacity, 10),
    cleanupBuffer: Number.parseInt(d.cleanupBuffer, 10),
    // Comma-separated is the honest match for how this is stored (a
    // text[]) without building a tag-input widget for a field most
    // outlets set once and never touch again.
    supportedServices: d.services.split(",").map((s) => s.trim()).filter(Boolean),
  };
}

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="tiny" style={{ color: "var(--danger)", marginTop: 2 }}>
      <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
      {error}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="stack g2"
      style={{
        position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30,
        padding: "14px 16px", borderRadius: "var(--r-md)",
        background: "var(--bg-panel, var(--bg-deep))", border: "1px solid var(--border)",
        minWidth: 320, maxWidth: 320, maxHeight: "70vh", overflowY: "auto",
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      }}
    >
      {children}
    </div>
  );
}

/** The shared field set, identical whether creating or editing. */
function Fields({ v, setV, disabled }: { v: Draft; setV: (d: Draft) => void; disabled: boolean }) {
  return (
    <>
      <div className="row g2">
        <label className="stack g1" style={{ flex: 1 }}>
          <span className="tiny dim">Kode</span>
          <input
            className="input mono"
            placeholder="mis. VIP-1"
            value={v.code}
            disabled={disabled}
            onChange={(e) => setV({ ...v, code: e.target.value })}
          />
        </label>
        <label className="stack g1" style={{ flex: 2 }}>
          <span className="tiny dim">Nama room</span>
          <input
            className="input"
            placeholder="mis. VIP Melati"
            value={v.name}
            disabled={disabled}
            onChange={(e) => setV({ ...v, name: e.target.value })}
          />
        </label>
      </div>

      <label className="stack g1">
        <span className="tiny dim">Tipe</span>
        <select
          className="select"
          value={v.type}
          disabled={disabled}
          onChange={(e) => setV({ ...v, type: e.target.value as Room["type"] })}
        >
          {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>

      <div className="row g2">
        <label className="stack g1" style={{ flex: 1 }}>
          <span className="tiny dim">Kapasitas (orang)</span>
          <input
            className="input"
            type="number"
            min={1}
            value={v.capacity}
            disabled={disabled}
            onChange={(e) => setV({ ...v, capacity: e.target.value })}
          />
        </label>
        <label className="stack g1" style={{ flex: 1 }}>
          <span className="tiny dim">Buffer bersih-bersih (menit)</span>
          <input
            className="input"
            type="number"
            min={0}
            value={v.cleanupBuffer}
            disabled={disabled}
            onChange={(e) => setV({ ...v, cleanupBuffer: e.target.value })}
          />
        </label>
      </div>

      <label className="stack g1">
        <span className="tiny dim">Layanan yang didukung — pisahkan dengan koma</span>
        <input
          className="input"
          placeholder="mis. Massage, Aromatherapy"
          value={v.services}
          disabled={disabled}
          onChange={(e) => setV({ ...v, services: e.target.value })}
        />
      </label>
    </>
  );
}

// ================================================================ CREATE

export function NewRoomButton({ outletId, outletName }: { outletId: string; outletName?: string }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        className="btn btn-primary btn-sm"
        onClick={() => { setV(EMPTY); setError(null); setOpen(true); }}
      >
        <Icon name="plus" size={14} /> Room Baru
      </button>
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <Panel>
        <div className="small strong" style={{ color: "var(--text-1)" }}>
          Room baru{outletName ? ` — ${outletName}` : ""}
        </div>
        <Fields v={v} setV={setV} disabled={isPending} />
        <ErrorNote error={error} />
        <div className="row g2">
          <button
            className="btn btn-primary btn-sm"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const r = await createRoom(toInput(v, outletId));
                if (!r.ok) { setError(r.error); return; }
                setOpen(false);
              });
            }}
          >
            <Icon name="save" size={13} /> {isPending ? "Menyimpan…" : "Simpan Room"}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>
            Batal
          </button>
        </div>
      </Panel>
    </div>
  );
}

// ================================================================ EDIT

export function EditRoomButton({ room, compact = false }: { room: Room; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Draft>(() => toDraft(room));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const retired = room.status === "INACTIVE";

  if (!open) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        style={compact ? { flex: 1 } : undefined}
        onClick={() => { setV(toDraft(room)); setError(null); setOpen(true); }}
      >
        <Icon name="edit" size={12} /> Edit
      </button>
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block", ...(compact ? { flex: 1 } : {}) }}>
      <Panel>
        <div className="small strong" style={{ color: "var(--text-1)" }}>Edit room — {room.name}</div>
        <Fields v={v} setV={setV} disabled={isPending} />
        <ErrorNote error={error} />
        <div className="row g2">
          <button
            className="btn btn-primary btn-sm"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const r = await updateRoom(room.id, toInput(v, room.outletId));
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

        {/* Retire / un-retire lives inside the edit panel rather than on
            the card: it is a rarer, more consequential action than
            "Maintenance", and putting it behind one more click keeps it
            from being hit by accident. */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 2 }}>
          <div className="tiny dim" style={{ marginBottom: 6 }}>
            {retired
              ? "Room ini sudah dipensiunkan — tidak muncul saat kasir memilih room."
              : "Memensiunkan room menyembunyikannya dari pilihan check-in. Riwayat booking & sesi lamanya tetap utuh."}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const r = await setRoomRetired(room.id, !retired);
                if (!r.ok) { setError(r.error); return; }
                setOpen(false);
              });
            }}
          >
            <Icon name={retired ? "rotate-ccw" : "archive"} size={12} />
            {retired ? " Aktifkan kembali" : " Pensiunkan room"}
          </button>
        </div>
      </Panel>
    </div>
  );
}
