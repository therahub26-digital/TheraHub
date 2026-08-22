"use client";

import { useState } from "react";
import { Badge, Avatar } from "@/components/ui";
import TherapistProfileModal, { type ProfileTherapist } from "@/components/TherapistProfileModal";

// ---------------------------------------------------------------------
// Client wrapper for the therapist cards on the outlet gallery page
// (app/customer/outlets/[id]/therapists/page.tsx, live branch) — added
// 2026-08-22 alongside TherapistProfileModal. Unlike CustomerBookingForm,
// this page has no "select a therapist" action for the card click to
// conflict with, so here the whole card opens the profile — no separate
// info-icon needed.
// ---------------------------------------------------------------------

export default function TherapistGalleryGrid({ therapists }: { therapists: ProfileTherapist[] }) {
  const [open, setOpen] = useState<ProfileTherapist | null>(null);

  return (
    <>
      <div className="grid grid-2" style={{ gap: 8 }}>
        {therapists.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setOpen(t)}
            className="stack g2"
            style={{
              padding: 12, borderRadius: "var(--r-md)", background: "var(--bg-surface-2)",
              border: "1px solid var(--border)", textAlign: "left", cursor: "pointer",
            }}
          >
            {t.featured && (
              <div style={{ alignSelf: "flex-start" }}>
                <Badge tone="gold" icon="star">{t.featuredBadge ?? "Unggulan"}</Badge>
              </div>
            )}
            <div className="row g2">
              <Avatar name={t.name} photoUrl={t.photoUrl} size={44} rect />
              <div style={{ minWidth: 0 }}>
                <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{t.name}</div>
                {t.grade && <div className="tiny dim">{t.grade}</div>}
              </div>
            </div>
            <div className="row g1 wrap">
              {t.skills.slice(0, 2).map((s) => (
                <span key={s} className="chip" style={{ height: 20, padding: "0 8px", fontSize: 10 }}>{s}</span>
              ))}
            </div>
            {t.featured && t.bio && <div className="tiny muted" style={{ lineHeight: 1.55 }}>{t.bio}</div>}
          </button>
        ))}
      </div>

      {open && <TherapistProfileModal therapist={open} onClose={() => setOpen(null)} />}
    </>
  );
}
