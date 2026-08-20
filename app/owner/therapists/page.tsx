import { PageHead, Card, CardHead, StatCard, Badge, Avatar, Progress } from "@/components/ui";
import { BarsChart } from "@/components/Charts";
import { THERAPIST_RANKING, outletName, THERAPISTS } from "@/lib/mock";
import { rp, pct, num, minutesToHm } from "@/lib/format";

export default function TherapistPerformancePage() {
  const avgUtil = THERAPIST_RANKING.reduce((s, t) => s + t.utilization, 0) / THERAPIST_RANKING.length;
  const avgRating = THERAPIST_RANKING.reduce((s, t) => s + t.rating, 0) / THERAPIST_RANKING.length;
  const totalGuests = THERAPIST_RANKING.reduce((s, t) => s + t.guests, 0);
  const top10 = THERAPIST_RANKING.slice(0, 10).map((t) => ({ name: t.name.split(" ")[0], revenue: t.revenue }));

  return (
    <>
      <PageHead title="Therapist Performance" desc="Ranking, utilization, dan kontribusi revenue seluruh terapis." />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Terapis" value={THERAPISTS.length} icon="sparkles" toneKey="rose" foot="3 outlet" />
        <StatCard label="Total Tamu Dilayani" value={num(totalGuests)} icon="users" toneKey="teal" foot="Bulan berjalan" />
        <StatCard label="Rata-rata Utilization" value={pct(avgUtil)} icon="gauge" toneKey="sky" foot="Treatment / shift minutes" />
        <StatCard label="Rata-rata Rating" value={avgRating.toFixed(2)} icon="star" toneKey="gold" foot="Dari 5.0" />
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Top 10 Terapis — Revenue Generated" />
        <div className="card-body">
          <BarsChart data={top10} xKey="name" yKey="revenue" height={250} horizontal color="#fb7185" />
        </div>
      </Card>

      <Card>
        <CardHead title="Ranking Lengkap" sub={`${THERAPIST_RANKING.length} terapis`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th><th>Terapis</th><th>Outlet</th><th>Grade</th><th>Tamu</th>
                <th>Menit</th><th>Revenue</th><th>Komisi</th><th>Utilization</th><th>Diminta</th><th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {THERAPIST_RANKING.map((t, i) => (
                <tr key={t.id}>
                  <td className="num dim">{i + 1}</td>
                  <td>
                    <div className="row g2">
                      <Avatar name={t.name} toneKey={t.avatarTone} size={28} />
                      <span className="strong" style={{ color: "var(--text-1)" }}>{t.name}</span>
                    </div>
                  </td>
                  <td className="muted small">{outletName(t.outletId)}</td>
                  <td><Badge tone={t.grade === "Master" ? "gold" : t.grade === "Senior" ? "accent" : "neutral"}>{t.grade}</Badge></td>
                  <td className="num">{t.guests}</td>
                  <td className="num muted">{minutesToHm(t.minutes)}</td>
                  <td className="num strong">{rp(t.revenue, { short: true })}</td>
                  <td className="num muted">{rp(t.commission, { short: true })}</td>
                  <td style={{ width: 120 }}>
                    <div className="row g2">
                      <div style={{ flex: 1 }}><Progress value={t.utilization} /></div>
                      <span className="tiny mono">{Math.round(t.utilization)}%</span>
                    </div>
                  </td>
                  <td className="num muted">{t.requested}×</td>
                  <td className="num">★ {t.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
