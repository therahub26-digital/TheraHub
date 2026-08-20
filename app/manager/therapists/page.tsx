import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, PersonCell, Progress } from "@/components/ui";
import { PRIMARY_OUTLET, employeesOf, therapistsOf } from "@/lib/mock";
import { rp, pct } from "@/lib/format";

const PRESENCE_LABEL: Record<string, string> = {
  AVAILABLE: "Tersedia", IN_SESSION: "Sedang Melayani", BREAK: "Istirahat", OFF: "Libur", LATE: "Terlambat", ABSENT: "Tidak Hadir",
};
const PRESENCE_TONE: Record<string, "success" | "accent" | "warning" | "neutral" | "danger"> = {
  AVAILABLE: "success", IN_SESSION: "accent", BREAK: "warning", OFF: "neutral", LATE: "warning", ABSENT: "danger",
};

export default function TherapistsPage() {
  const outlet = PRIMARY_OUTLET;
  const therapists = therapistsOf(outlet.id).sort((a, b) => (b.revenueGenerated ?? 0) - (a.revenueGenerated ?? 0));
  const staff = employeesOf(outlet.id).filter((e) => !e.isTherapist);
  const avgUtil = therapists.length
    ? therapists.reduce((s, t) => s + (t.utilization ?? 0), 0) / therapists.length
    : 0;
  const avgRating = therapists.length
    ? therapists.reduce((s, t) => s + (t.rating ?? 0), 0) / therapists.length
    : 0;

  return (
    <>
      <PageHead
        title="Therapists & Staff"
        desc={`${outlet.name} · Skill matrix, utilization, rating, dan status kepegawaian.`}
        actions={<button className="btn btn-primary btn-sm"><Icon name="plus" size={14} /> Tambah Staff</button>}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Terapis" value={therapists.length} icon="hand-heart" toneKey="teal" deltaLabel={`${staff.length} staff pendukung`} />
        <StatCard label="Utilization Rata-rata" value={pct(avgUtil)} icon="gauge" toneKey="sky" deltaLabel="Kapasitas terpakai" />
        <StatCard label="Rating Rata-rata" value={avgRating.toFixed(1)} icon="star" toneKey="gold" deltaLabel="Dari review tamu" />
        <StatCard label="Sedang Bertugas" value={therapists.filter((t) => t.presence === "IN_SESSION").length} icon="timer" toneKey="violet" deltaLabel="Melayani saat ini" />
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Daftar Terapis" sub={`${therapists.length} terapis · diurutkan berdasarkan revenue`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Terapis</th><th>Grade</th><th>Skills</th><th>Tamu</th><th>Revenue</th>
                <th>Komisi MTD</th><th>Utilization</th><th>Rating</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {therapists.map((t) => (
                <tr key={t.id}>
                  <td><PersonCell name={t.name} sub={t.code} toneKey={t.avatarTone} /></td>
                  <td><Badge tone="neutral">{t.therapistGrade}</Badge></td>
                  <td style={{ maxWidth: 220 }}>
                    <div className="row g1 wrap">
                      {t.skills.slice(0, 3).map((s) => (
                        <span key={s} className="tiny dim" style={{ padding: "2px 7px", borderRadius: "var(--r-full)", background: "var(--bg-deep)", border: "1px solid var(--border)" }}>{s}</span>
                      ))}
                      {t.skills.length > 3 && <span className="tiny dim">+{t.skills.length - 3}</span>}
                    </div>
                  </td>
                  <td className="num small">{t.guestCount}</td>
                  <td className="num small">{rp(t.revenueGenerated ?? 0, { short: true })}</td>
                  <td className="num small muted">{rp(t.commissionMTD ?? 0, { short: true })}</td>
                  <td style={{ minWidth: 90 }}>
                    <div className="row g2">
                      <div style={{ flex: 1, minWidth: 46 }}><Progress value={t.utilization ?? 0} /></div>
                      <span className="tiny dim">{Math.round(t.utilization ?? 0)}%</span>
                    </div>
                  </td>
                  <td className="row g1 small">
                    <Icon name="star" size={12} style={{ color: "var(--gold)" }} />
                    {t.rating}
                  </td>
                  <td><Badge tone={PRESENCE_TONE[t.presence ?? "AVAILABLE"]} dot>{PRESENCE_LABEL[t.presence ?? "AVAILABLE"]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHead title="Staff Pendukung" sub={`${staff.length} staff — kasir, supervisor, office boy`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Nama</th><th>Role</th><th>Grade</th><th>Bergabung</th><th>Status</th></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td><PersonCell name={s.name} sub={s.code} toneKey={s.avatarTone} /></td>
                  <td className="muted small">{s.jobRole}</td>
                  <td><Badge tone="neutral">{s.grade}</Badge></td>
                  <td className="muted small">{s.joinDate}</td>
                  <td><Badge tone={s.status === "ACTIVE" ? "success" : "danger"} dot>{s.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
