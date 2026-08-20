import Link from "next/link";
import Icon from "@/components/Icon";
import { Badge, Avatar } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { ME_CUSTOMER, OUTLETS, PRIMARY_OUTLET, CATEGORIES, packagesOf, therapistsOf, DAY_RANGE, TODAY, depositFor, depositLabel } from "@/lib/mock";
import { rp, fmtDayShort, minutesToHm } from "@/lib/format";

export default function BookPage() {
  const me = ME_CUSTOMER;
  const outlet = PRIMARY_OUTLET;
  const packages = packagesOf(outlet.id)
    .filter((p) => p.status === "ACTIVE")
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 6);
  const selected = packages[0];
  const therapists = therapistsOf(outlet.id)
    .filter((t) => t.skills.includes(selected.requiredSkill))
    .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
    .slice(0, 6);
  const days = DAY_RANGE.slice(7, 13);
  const selectedDate = days[1];
  const slots = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00"];
  const price = me.membership !== "None" ? selected.memberPrice : selected.listPrice;
  const deposit = depositFor(outlet.id, price);

  return (
    <MobileShell role="customer" title="Booking" subtitle="Lengkapi langkah untuk memesan layanan" avatarName={me.name} avatarTone={me.avatarTone}>
      <div className="stack g5">
        <div>
          <div className="row g2" style={{ marginBottom: 8 }}>
            <span className="stat-icon" style={{ width: 22, height: 22, borderRadius: 6, fontSize: 10 }}>1</span>
            <span className="m-section" style={{ marginBottom: 0 }}>Pilih Outlet</span>
          </div>
          <div className="stack g2">
            {OUTLETS.map((o) => (
              <div key={o.id} className="m-list-link" style={o.id === outlet.id ? { border: "1.5px solid var(--accent)", background: "var(--accent-soft)" } : undefined}>
                <span className="stat-icon" style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0 }}>
                  <Icon name="map-pin" size={15} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{o.name.replace("Amethyst — ", "")}</div>
                  <div className="tiny dim truncate">{o.city} · {o.openHours.split("· ")[1]}</div>
                  <div className="tiny truncate" style={{ color: o.deposit.enabled ? "var(--warning)" : "var(--text-4)", marginTop: 2 }}>
                    {o.deposit.enabled ? `Deposit ${depositLabel(o.id)}` : "Tanpa deposit"}
                  </div>
                </div>
                {o.profile.published && (
                  <Link
                    href={`/customer/outlets/${o.id}`}
                    className="tiny bold row g1"
                    style={{ color: "var(--accent)", flexShrink: 0, padding: "4px 8px" }}
                  >
                    <Icon name="eye" size={12} /> Profil
                  </Link>
                )}
                {o.id === outlet.id && <Icon name="check-circle" size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="row g2" style={{ marginBottom: 8 }}>
            <span className="stat-icon" style={{ width: 22, height: 22, borderRadius: 6, fontSize: 10 }}>2</span>
            <span className="m-section" style={{ marginBottom: 0 }}>Pilih Layanan</span>
          </div>
          <div className="row g2 wrap" style={{ marginBottom: 10 }}>
            {CATEGORIES.map((c, i) => (
              <span key={c.id} className={`chip ${i === 0 ? "on" : ""}`}>{c.name}</span>
            ))}
          </div>
          <div className="stack g2">
            {packages.map((p) => (
              <div key={p.id} className="m-list-link" style={p.id === selected.id ? { border: "1.5px solid var(--accent)", background: "var(--accent-soft)" } : undefined}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{p.name}</div>
                  <div className="tiny dim truncate">{minutesToHm(p.durationMin)} · {rp(p.listPrice)}</div>
                </div>
                {p.id === selected.id && <Icon name="check-circle" size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="row between" style={{ marginBottom: 8 }}>
            <div className="row g2">
              <span className="stat-icon" style={{ width: 22, height: 22, borderRadius: 6, fontSize: 10 }}>3</span>
              <span className="m-section" style={{ marginBottom: 0 }}>Pilih Terapis</span>
            </div>
            <Link href={`/customer/outlets/${outlet.id}/therapists`} className="tiny bold row g1" style={{ color: "var(--accent)" }}>
              <Icon name="images" size={12} /> Galeri Lengkap
            </Link>
          </div>
          <div className="grid grid-2" style={{ gap: 8 }}>
            <div
              className="stack g2"
              style={{
                padding: 12, borderRadius: "var(--r-md)", alignItems: "center", textAlign: "center",
                background: "var(--accent-soft)", border: "1.5px solid var(--accent)", justifyContent: "center",
              }}
            >
              <span
                style={{
                  width: 48, height: 48, borderRadius: "var(--r-md)", background: "var(--accent-gradient)",
                  display: "grid", placeItems: "center",
                }}
              >
                <Icon name="sparkles" size={20} style={{ color: "#04140f" }} />
              </span>
              <div>
                <div className="tiny bold" style={{ color: "var(--accent)" }}>Tanpa Preferensi</div>
                <div className="tiny dim">Dipilihkan otomatis</div>
              </div>
            </div>
            {therapists.map((t) => (
              <div
                key={t.id}
                className="stack g2"
                style={{ padding: 12, borderRadius: "var(--r-md)", background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}
              >
                {t.featured && (
                  <div style={{ alignSelf: "flex-start" }}>
                    <Badge tone="gold" icon="star">{t.featuredBadge}</Badge>
                  </div>
                )}
                <div className="row g2">
                  <Avatar name={t.name} toneKey={t.avatarTone} size={44} rect />
                  <div style={{ minWidth: 0 }}>
                    <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{t.name}</div>
                    <div className="tiny dim">{t.therapistGrade} · ★ {t.rating}</div>
                  </div>
                </div>
                <div className="row g1 wrap">
                  {t.skills.slice(0, 2).map((s) => (
                    <span key={s} className="chip" style={{ height: 20, padding: "0 8px", fontSize: 10 }}>{s}</span>
                  ))}
                </div>
                {t.featured && t.bio && (
                  <div className="tiny muted" style={{ lineHeight: 1.55 }}>{t.bio}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="row g2" style={{ marginBottom: 8 }}>
            <span className="stat-icon" style={{ width: 22, height: 22, borderRadius: 6, fontSize: 10 }}>4</span>
            <span className="m-section" style={{ marginBottom: 0 }}>Tanggal &amp; Waktu</span>
          </div>
          <div className="row g2" style={{ overflowX: "auto", paddingBottom: 8 }}>
            {days.map((d, i) => (
              <div
                key={d}
                className="stack g1"
                style={{
                  minWidth: 50, textAlign: "center", padding: "8px 4px", borderRadius: "var(--r-md)", flexShrink: 0,
                  background: i === 1 ? "var(--accent-soft)" : "var(--bg-surface-2)",
                  border: `1px solid ${i === 1 ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                <span className="tiny dim">{fmtDayShort(d)}</span>
                <span className="small bold" style={{ color: i === 1 ? "var(--accent)" : "var(--text-1)" }}>{d.slice(8)}</span>
              </div>
            ))}
          </div>
          <div className="row g2 wrap">
            {slots.map((s, i) => (
              <span key={s} className={`chip ${i === 2 ? "on" : ""}`}>{s}</span>
            ))}
          </div>
        </div>

        <div className="m-card m-card-tight">
          <div className="m-section">Ringkasan Booking</div>
          <div className="stack g2" style={{ marginBottom: 12 }}>
            <div className="row between tiny"><span className="muted">Layanan</span><span style={{ color: "var(--text-1)" }}>{selected.name}</span></div>
            <div className="row between tiny"><span className="muted">Harga</span><span style={{ color: "var(--text-1)" }}>{rp(price)}</span></div>
            {me.membership !== "None" && <div className="row between tiny"><span className="muted">Diskon Member</span><Badge tone="gold">-{Math.round((1 - selected.memberPrice / selected.listPrice) * 100)}%</Badge></div>}
            <div className="row between tiny" style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <span className="muted">Deposit Dibayar Sekarang</span>
              {deposit > 0 ? (
                <span className="bold" style={{ color: "var(--warning)" }}>{rp(deposit)}</span>
              ) : (
                <span className="dim">Tidak diperlukan</span>
              )}
            </div>
            {deposit > 0 && (
              <div className="row between tiny">
                <span className="muted">Sisa Dibayar di Outlet</span>
                <span style={{ color: "var(--text-1)" }}>{rp(price - deposit)}</span>
              </div>
            )}
          </div>

          {outlet.deposit.enabled && (
            <div
              className="row g2"
              style={{
                alignItems: "flex-start", marginBottom: 12, padding: "10px 12px",
                borderRadius: "var(--r-md)", background: "var(--warning-soft)",
                border: "1px solid rgba(245,158,11,0.25)",
              }}
            >
              <Icon name="info" size={14} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
              <div className="tiny muted" style={{ lineHeight: 1.6 }}>
                {deposit > 0
                  ? `Bayar deposit maks. ${outlet.deposit.expiryMin} menit setelah booking dibuat. ${outlet.deposit.note}`
                  : `Outlet ini meminta deposit ${depositLabel(outlet.id)} untuk booking dengan total mulai ${rp(outlet.deposit.minTicket)}.`}
              </div>
            </div>
          )}

          {selectedDate !== TODAY && (
            <div
              className="row g2"
              style={{
                alignItems: "flex-start", marginBottom: 12, padding: "10px 12px",
                borderRadius: "var(--r-md)", background: "var(--info-soft)",
                border: "1px solid rgba(56,189,248,0.25)",
              }}
            >
              <Icon name="bell-ring" size={14} style={{ color: "var(--info)", flexShrink: 0, marginTop: 1 }} />
              <div className="tiny muted" style={{ lineHeight: 1.6 }}>
                Booking untuk tanggal ini bukan hari ini — wajib dikonfirmasi ulang pada hari-H, minimal 1 jam
                sebelum jadwal. Bila tidak dikonfirmasi, booking otomatis dianggap batal.
              </div>
            </div>
          )}

          <button className="m-btn m-btn-primary">
            <Icon name="check" size={15} /> {deposit > 0 ? `Booking & Bayar ${rp(deposit)}` : "Konfirmasi Booking"}
          </button>
        </div>
      </div>
    </MobileShell>
  );
}
