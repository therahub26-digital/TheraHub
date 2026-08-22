"use client";

import Icon from "@/components/Icon";
import { Badge, Avatar } from "@/components/ui";

// ---------------------------------------------------------------------
// Therapist profile + photo album popup — added 2026-08-22 per user
// request: "kalau di klik di kotak therapis maka akan muncul profil dan
// album foto therapis, isi maksimal 3 foto". Shared between
// CustomerBookingForm.tsx (an info-icon button on each therapist card —
// clicking the card itself still selects that therapist for booking) and
// the outlet's therapist gallery page (where there's no "select" action
// to conflict with, so the whole card opens this). No shared <Modal>
// component exists yet in this codebase (checked components/ui.tsx), so
// this is a small self-contained overlay rather than a new generic
// primitive — reasonable for one use, would be worth extracting if a
// third modal shows up.
// ---------------------------------------------------------------------

export type ProfileTherapist = {
  id: string;
  name: string;
  grade?: string;
  skills: string[];
  photoUrl?: string;
  galleryUrls?: string[];
  bio?: string;
  featured?: boolean;
  featuredBadge?: string;
};

export default function TherapistProfileModal({ therapist, onClose }: { therapist: ProfileTherapist; onClose: () => void }) {
  const gallery = (therapist.galleryUrls ?? []).slice(0, 3);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "rgba(3,7,12,0.6)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="stack g4"
        style={{
          width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto",
          background: "var(--bg-surface-1)", borderRadius: "var(--r-lg) var(--r-lg) 0 0",
          border: "1px solid var(--border)", borderBottom: "none", padding: 20,
        }}
      >
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <div className="row g3">
            <Avatar name={therapist.name} photoUrl={therapist.photoUrl} size={56} rect />
            <div>
              <div className="row g2 wrap" style={{ marginBottom: 2 }}>
                <span className="m-title">{therapist.name}</span>
                {therapist.featured && <Badge tone="gold" icon="star">{therapist.featuredBadge ?? "Unggulan"}</Badge>}
              </div>
              {therapist.grade && <div className="tiny dim">{therapist.grade}</div>}
            </div>
          </div>
          <button type="button" className="btn btn-quiet btn-icon btn-sm" onClick={onClose} aria-label="Tutup">
            <Icon name="x" size={16} />
          </button>
        </div>

        {therapist.bio && <div className="small muted" style={{ lineHeight: 1.65 }}>{therapist.bio}</div>}

        {therapist.skills.length > 0 && (
          <div className="row g1 wrap">
            {therapist.skills.map((s) => (
              <span key={s} className="chip">{s}</span>
            ))}
          </div>
        )}

        <div>
          <div className="m-section">Album Foto</div>
          {gallery.length > 0 ? (
            <div className="grid grid-3" style={{ gap: 8 }}>
              {gallery.map((src, i) => (
                <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg-surface-2)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Foto ${therapist.name} ${i + 1}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="small dim">Belum ada foto tambahan untuk terapis ini.</div>
          )}
        </div>

        <button type="button" className="m-btn m-btn-ghost" onClick={onClose}>Tutup</button>
      </div>
    </div>
  );
}
