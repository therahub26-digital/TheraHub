import { PageHead, Card, CardHead, InfoNote, Badge, StatCard, EmptyState } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { getPlatformDiagnostics, getPlatformOverview } from "@/lib/data/platform";
import type { DiagnosticSeverity } from "@/lib/data/platform";

// ---------------------------------------------------------------------
// UPDATE 2026-08-26 — halaman ini dulu menampilkan tiket support fiktif,
// "API Success Rate", "Avg Latency", dan tombol "Buka Akses" yang tidak
// membuka apa pun sambil menjanjikan sesi tercatat di Audit Log. Itu
// halaman paling menyesatkan di portal ini: menjanjikan jejak audit yang
// tidak pernah ditulis.
//
// Semuanya dibuang dan diganti dengan sesuatu yang benar-benar bisa
// dijawab dari database: PEMERIKSAAN KESEHATAN SETUP lintas-tenant.
// Metrik infrastruktur (latency, uptime, success rate) tidak dibuat-buat
// lagi — TheraHub tidak punya sumbernya, dan angka semacam itu hanya benar
// kalau datang dari lapisan pemantauan sungguhan.
//
// Tiap temuan menjawab tiga hal: apa yang salah, apa AKIBATNYA kalau
// dibiarkan, dan langkah apa yang menutupnya. Logikanya ada di
// lib/data/platform.ts supaya bisa dipakai ulang.
// ---------------------------------------------------------------------

const TONE: Record<DiagnosticSeverity, "danger" | "warning" | "success"> = {
  critical: "danger",
  warning: "warning",
  info: "success",
};
const LABEL: Record<DiagnosticSeverity, string> = {
  critical: "Kritis",
  warning: "Perlu perhatian",
  info: "Aman",
};

export default async function DiagnosticsPage() {
  const [findings, overview] = await Promise.all([getPlatformDiagnostics(), getPlatformOverview()]);

  if (!findings || !overview) {
    return (
      <>
        <PageHead title="Diagnostik Platform" desc="Pemeriksaan kesehatan setup seluruh tenant." />
        <MockDataNotice title="Perlu akun super-admin sungguhan">
          Pemeriksaan ini membaca data seluruh tenant, jadi hanya berjalan untuk akun{" "}
          <strong>super-admin</strong> yang benar-benar login. Di mode demo &quot;Ganti Role&quot;
          tidak ada yang bisa diperiksa.
        </MockDataNotice>
      </>
    );
  }

  const critical = findings.filter((f) => f.severity === "critical").length;
  const warning = findings.filter((f) => f.severity === "warning").length;
  const clean = findings.length === 1 && findings[0].id === "bersih";

  return (
    <>
      <PageHead
        title="Diagnostik Platform"
        desc={`Pemeriksaan kesehatan setup untuk ${overview.tenants} tenant · ${overview.outlets} outlet.`}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard
          label="Temuan Kritis"
          value={critical}
          icon="alert-triangle"
          toneKey={critical ? "danger" : "teal"}
          deltaLabel={critical ? "Menghalangi operasional" : "Tidak ada"}
        />
        <StatCard
          label="Perlu Perhatian"
          value={warning}
          icon="circle-alert"
          toneKey={warning ? "gold" : "teal"}
          deltaLabel={warning ? "Ada jalan memutar" : "Tidak ada"}
        />
        <StatCard label="Tenant Diperiksa" value={overview.tenants} icon="building-2" toneKey="violet" />
        <StatCard label="Outlet Diperiksa" value={overview.outlets} icon="map-pin" toneKey="sky" />
      </div>

      <InfoNote tone="info" title="Apa yang diperiksa — dan apa yang tidak">
        Pemeriksaan di bawah menjawab pertanyaan <strong>&quot;apakah setup tenant ini sudah cukup
        untuk dipakai?&quot;</strong> — outlet, ruangan, struktur payroll, tarif komisi, publikasi
        profil, dan kelengkapan kontak terapis. Semuanya dihitung langsung dari database saat halaman
        dibuka.{" "}
        <strong>Kesehatan infrastruktur tidak diperiksa di sini</strong> — uptime, latency, dan
        tingkat keberhasilan API butuh lapisan pemantauan yang belum ada, dan angka semacam itu lebih
        berbahaya kalau dikarang daripada kalau tidak ditampilkan sama sekali.
      </InfoNote>

      <Card style={{ marginTop: 20 }}>
        <CardHead
          title="Temuan"
          sub={clean ? "Semua pemeriksaan lolos" : `${findings.length} temuan, diurutkan dari yang paling mendesak`}
        />
        {clean ? (
          <EmptyState
            icon="check"
            title="Tidak ada temuan"
            desc="Seluruh tenant lolos semua pemeriksaan setup. Ini tidak menjamin tidak ada masalah operasional — hanya berarti fondasi setiap tenant sudah lengkap."
          />
        ) : (
          <div className="stack g3" style={{ padding: "4px 0" }}>
            {findings.map((f) => (
              <div
                key={f.id}
                style={{
                  padding: "14px 16px",
                  borderRadius: "var(--r-md)",
                  background: "var(--bg-deep)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="between" style={{ alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                  <div className="strong" style={{ color: "var(--text-1)" }}>{f.title}</div>
                  <Badge tone={TONE[f.severity]}>{LABEL[f.severity]}</Badge>
                </div>
                <div className="small" style={{ marginBottom: 8, color: "var(--text-2)" }}>{f.impact}</div>
                <div className="small" style={{ marginBottom: f.subjects.length ? 10 : 0 }}>
                  <span className="tiny dim uppercase" style={{ letterSpacing: ".06em", marginRight: 8 }}>
                    Cara menutup
                  </span>
                  {f.fix}
                </div>
                {f.subjects.length > 0 && (
                  <div className="row g2 wrap">
                    {f.subjects.map((s) => (
                      <Badge key={s} tone="neutral">{s}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
