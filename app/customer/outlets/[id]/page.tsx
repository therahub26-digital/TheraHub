import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { Badge, Avatar } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { getOutletById, getOutlets } from "@/lib/data/outlets";
import { getTherapistsForOutlet } from "@/lib/data/employees";
import { getCurrentCustomer } from "@/lib/data/customers";
import { OUTLETS as MOCK_OUTLETS, outletOf, featuredTherapistsOf } from "@/lib/mock";

// ---------------------------------------------------------------------
// UPDATE 2026-08-22 — migrated off the OUTLETS/outletOf/featuredTherapistsOf
// mock fixtures to real Supabase data (same dual-mode convention as the
// rest of /customer/*). getOutletById()/getTherapistsForOutlet() were
// already dual-mode (lib/data/outlets.ts, lib/data/employees.ts, built in
// earlier phases for the staff portals) — this page is simply the first
// customer-facing page to actually call them with a real session.
// ---------------------------------------------------------------------

export default async function OutletPublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCurrentCustomer();
  const live = customer !== null;

  const outlets = live ? await getOutlets() : MOCK_OUTLETS;
  if (!outlets.some((o) => o.id === id)) notFound();
  const outlet = live ? await getOutletById(id) : outletOf(id);
  if (!outlet) notFound();
  const p = outlet.profile;
  const featured = live ? (await getTherapistsForOutlet(outlet.id)).filter((t) => t.featured) : featuredTherapistsOf(outlet.id);

  return (
    <MobileShell
      role="customer"
      title={outlet.name.replace("Amethyst — ", "")}
      subtitle="Profil Outlet"
      showBack
    >
      <div className="stack g5">
        {!p.published && (
          <div
            className="row g2"
            style={{
              alignItems: "flex-start", padding: "10px 12px", borderRadius: "var(--r-md)",
              background: "var(--warning-soft)", border: "1px solid rgba(245,158,11,0.28)",
            }}
          >
            <Icon name="alert-triangle" size={14} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
            <span className="tiny muted" style={{ lineHeight: 1.6 }}>
              Halaman ini belum dipublikasikan — hanya terlihat sebagai pratinjau Admin.
            </span>
          </div>
        )}

        {/*
          Hero. When a cover photo exists the text sits on a dark scrim over the
          photo, so it stays legible in BOTH themes without any theme-conditional
          colours; without a photo we fall back to the tenant accent gradient
          (which needs dark ink instead).
        */}
        <div
          style={{
            position: "relative",
            borderRadius: "var(--r-lg)",
            overflow: "hidden",
            minHeight: p.cover ? 188 : undefined,
            display: "flex",
            alignItems: "flex-end",
            background: p.cover ? "var(--bg-surface-2)" : "var(--accent-gradient)",
          }}
        >
          {p.cover && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.cover}
                alt={`Suasana ${outlet.name}`}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              />
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(180deg, rgba(3,7,12,0.10) 0%, rgba(3,7,12,0.45) 48%, rgba(3,7,12,0.86) 100%)",
                }}
              />
            </>
          )}

          <div style={{ position: "relative", padding: 16, width: "100%" }}>
            <span
              className="tiny bold"
              style={{
                display: "inline-block", padding: "3px 9px", borderRadius: "var(--r-full)", marginBottom: 10,
                background: p.cover ? "rgba(255,255,255,0.18)" : "rgba(4,20,15,0.16)",
                color: p.cover ? "#fff" : "#04140f",
                backdropFilter: p.cover ? "blur(6px)" : undefined,
              }}
            >
              {outlet.city}
            </span>
            <div
              style={{
                fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, lineHeight: 1.3, marginBottom: 6,
                color: p.cover ? "#fff" : "#04140f",
                textShadow: p.cover ? "0 1px 12px rgba(0,0,0,0.5)" : undefined,
              }}
            >
              {p.tagline}
            </div>
            <div className="row g2" style={{ color: p.cover ? "rgba(255,255,255,0.86)" : "rgba(4,20,15,0.72)" }}>
              <Icon name="map-pin" size={13} />
              <span className="tiny">{outlet.address}</span>
            </div>
          </div>
        </div>

        <div className="small" style={{ color: "var(--text-2)", lineHeight: 1.75 }}>{p.description}</div>

        <div className="row g2 wrap">
          {p.highlights.map((h) => (
            <span key={h} className="chip on">
              <Icon name="check" size={11} /> {h}
            </span>
          ))}
        </div>

        <div className="row g2">
          <div className="m-stat">
            <Icon name="clock" size={15} style={{ color: "var(--accent)", marginBottom: 6 }} />
            <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{outlet.openHours.split("· ")[1] ?? outlet.openHours}</div>
            <div className="tiny dim">Jam Operasional</div>
          </div>
          <div className="m-stat">
            <Icon name="door-open" size={15} style={{ color: "var(--accent)", marginBottom: 6 }} />
            <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{outlet.roomCount} Room</div>
            <div className="tiny dim">Ruang Treatment</div>
          </div>
          <Link href={`/customer/outlets/${outlet.id}/therapists`} className="m-stat">
            <Icon name="sparkles" size={15} style={{ color: "var(--accent)", marginBottom: 6 }} />
            <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{outlet.therapistCount} Terapis</div>
            <div className="tiny dim" style={{ color: "var(--accent)" }}>Lihat Galeri →</div>
          </Link>
        </div>

        {p.facilities.length > 0 && (
          <div>
            <div className="m-section">Fasilitas</div>
            <div className="stack g2">
              {p.facilities.map((f) => (
                <div key={f.name} className="m-list-link">
                  <span className="stat-icon" style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0 }}>
                    <Icon name={f.icon} size={15} />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{f.name}</div>
                    <div className="tiny dim">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {p.gallery.length > 0 && (
          <div>
            <div className="m-section">Galeri</div>
            <div className="grid grid-2" style={{ gap: 8 }}>
              {p.gallery.map((g, i) => (
                <div
                  key={i}
                  style={{
                    position: "relative", height: 96, borderRadius: "var(--r-md)", overflow: "hidden",
                    border: "1px solid var(--border)", background: "var(--bg-surface-2)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.src}
                    alt={g.label}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <div
                    aria-hidden
                    style={{
                      position: "absolute", inset: 0,
                      background: "linear-gradient(180deg, transparent 40%, rgba(3,7,12,0.82) 100%)",
                    }}
                  />
                  <span
                    className="tiny bold truncate"
                    style={{ position: "absolute", left: 8, right: 8, bottom: 7, color: "#fff" }}
                  >
                    {g.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {featured.length > 0 && (
          <div>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div className="m-section" style={{ marginBottom: 0 }}>Terapis Unggulan</div>
              <Link href={`/customer/outlets/${outlet.id}/therapists`} className="tiny bold row g1" style={{ color: "var(--accent)" }}>
                <Icon name="images" size={12} /> Lihat Semua Terapis
              </Link>
            </div>
            <div className="stack g3">
              {featured.map((t) => (
                <div key={t.id} className="m-card m-card-tight">
                  <div className="row g3">
                    <Avatar name={t.name} toneKey={t.avatarTone} photoUrl={t.photoUrl} size={42} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="row g2 wrap" style={{ marginBottom: 2 }}>
                        <span className="small bold truncate" style={{ color: "var(--text-1)" }}>{t.name}</span>
                        {t.featuredBadge && <Badge tone="gold" icon="star">{t.featuredBadge}</Badge>}
                      </div>
                      {t.therapistGrade && <div className="tiny dim">{t.therapistGrade}</div>}
                    </div>
                  </div>
                  {t.bio && <div className="tiny muted" style={{ marginTop: 8, lineHeight: 1.65 }}>{t.bio}</div>}
                  <div className="row g2 wrap" style={{ marginTop: 8 }}>
                    {t.skills.slice(0, 3).map((s) => (
                      <span key={s} className="chip">{s}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Link href={`/customer/book?outlet=${outlet.id}`} className="m-btn m-btn-primary">
          <Icon name="calendar-plus" size={15} /> Booking di Outlet Ini
        </Link>
      </div>
    </MobileShell>
  );
}
