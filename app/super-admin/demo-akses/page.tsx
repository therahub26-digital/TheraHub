import Link from "next/link";
import { PageHead, Card, CardHead, StatCard, Badge, InfoNote } from "@/components/ui";
import { NewDemoMarketerForm, DemoMarketerActions } from "@/components/DemoAccessAdmin";
import { getDemoAccessOverview } from "@/lib/data/demoAccess";
import { fmtDateTime, fmtDate } from "@/lib/format";

// ---------------------------------------------------------------------
// Super Admin → Akses Demo (2026-10-24). Satu akun per marketing untuk
// demo.therahub.biz.id, plus log siapa masuk kapan, dari mana, membuka
// peran apa, dan tanda bahaya bila akun tampak dibagikan.
// ---------------------------------------------------------------------

export const dynamic = "force-dynamic";

const EVENT: Record<string, { label: string; tone: "success" | "danger" | "warning" | "info" | "neutral" }> = {
  LOGIN_OK: { label: "Masuk", tone: "success" },
  LOGIN_FAIL: { label: "Gagal masuk", tone: "danger" },
  LOGIN_BLOCKED: { label: "Ditahan", tone: "danger" },
  DENIED: { label: "Ditolak (dicabut)", tone: "danger" },
  SWITCH: { label: "Buka peran", tone: "info" },
  RESET: { label: "Reset data", tone: "warning" },
  LOGOUT: { label: "Keluar", tone: "neutral" },
};

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner", admin: "Admin", manager: "Manager", kasir: "Kasir", therapist: "Terapis", customer: "Customer",
};

/** ISO → tampilan WIB (data log disimpan UTC asli). */
function wib(iso: string): string {
  return fmtDateTime(new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString());
}

export default async function DemoAccessPage({ searchParams }: { searchParams: Promise<{ akun?: string }> }) {
  const { akun } = await searchParams;
  const data = await getDemoAccessOverview(akun);
  if (!data) {
    return (
      <>
        <PageHead title="Akses Demo" desc="Akun marketing demo.therahub.biz.id dan log aktivitasnya." />
        <InfoNote icon="lock" tone="warning" title="Khusus Super Admin">Masuk dengan akun Super Admin untuk mengelola akses demo.</InfoNote>
      </>
    );
  }
  const filtered = akun ? data.marketers.find((m) => m.id === akun) : null;
  const flagged = data.marketers.filter((m) => m.warnings.length);

  return (
    <>
      <PageHead
        title="Akses Demo"
        desc="Satu akun per marketing untuk demo.therahub.biz.id. Setiap masuk, gagal masuk, buka peran, reset, dan keluar tercatat."
        actions={<NewDemoMarketerForm />}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Akun aktif" value={data.stats.activeAccounts} icon="users" toneKey="teal" />
        <StatCard label="Login 7 hari" value={data.stats.logins7d} icon="activity" toneKey="sky" />
        <StatCard label="IP berbeda 7 hari" value={data.stats.uniqueIps7d} icon="map-pin" toneKey="violet" />
        <StatCard label="Gagal masuk 7 hari" value={data.stats.fails7d} icon="alert-triangle" toneKey={data.stats.fails7d ? "danger" : "slate"} />
      </div>

      {flagged.length > 0 && (
        <InfoNote icon="alert-triangle" tone="warning" title={`${flagged.length} akun perlu dicek`}>
          {flagged.map((m) => (
            <div key={m.id}><strong>{m.name}</strong>: {m.warnings.join(" · ")}</div>
          ))}
        </InfoNote>
      )}

      <Card style={{ margin: "20px 0" }}>
        <CardHead title="Akun marketing" sub={`${data.marketers.length} akun · akun utama (${data.masterEmail || "env belum diatur"}) dikelola lewat env Vercel`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Nama</th><th>Email</th><th>Status</th><th>Berlaku sampai</th><th>Login terakhir</th>
                <th className="num">Login 30 hr</th><th className="num">IP 7 hr</th><th>Kota 7 hr</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.marketers.map((m) => {
                const expired = !!m.expiresAt && new Date(m.expiresAt).getTime() <= Date.now();
                return (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/super-admin/demo-akses?akun=${m.id}`} className="strong">{m.name}</Link>
                      {m.note && <div className="tiny dim">{m.note}</div>}
                      {m.warnings.length > 0 && <div className="tiny" style={{ color: "var(--warning)" }}>⚠ {m.warnings[0]}</div>}
                    </td>
                    <td className="small">{m.email}</td>
                    <td>{!m.active ? <Badge tone="danger">Nonaktif</Badge> : expired ? <Badge tone="warning">Kedaluwarsa</Badge> : <Badge tone="success">Aktif</Badge>}</td>
                    <td className="small">{m.expiresAt ? fmtDate(m.expiresAt.slice(0, 10)) : "Tanpa batas"}</td>
                    <td className="small muted">{m.lastLoginAt ? wib(m.lastLoginAt) : "Belum pernah"}</td>
                    <td className="num">{m.logins30d}</td>
                    <td className="num" style={{ color: m.ips7d >= 4 ? "var(--warning)" : undefined }}>{m.ips7d}</td>
                    <td className="small muted">{m.cities7d.join(", ") || "—"}</td>
                    <td><DemoMarketerActions id={m.id} name={m.name} email={m.email} active={m.active} expiresAt={m.expiresAt} /></td>
                  </tr>
                );
              })}
              {data.marketers.length === 0 && (
                <tr><td colSpan={9} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>Belum ada akun marketing. Klik &ldquo;Akun marketing baru&rdquo;.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHead
          title={filtered ? `Aktivitas ${filtered.name}` : "Aktivitas terbaru"}
          sub={`${data.logs.length} kejadian terakhir (maks. 300, 30 hari) · waktu WIB`}
          action={filtered ? <Link className="btn btn-ghost btn-sm" href="/super-admin/demo-akses">Tampilkan semua</Link> : undefined}
        />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Waktu</th><th>Siapa</th><th>Kejadian</th><th>Peran</th><th>Lokasi</th><th>IP</th><th>Perangkat</th><th>Keterangan</th></tr></thead>
            <tbody>
              {data.logs.map((l) => (
                <tr key={l.id}>
                  <td className="small muted">{wib(l.at)}</td>
                  <td className="small"><strong>{l.who}</strong>{l.who === "Tidak dikenal" && l.email ? <div className="tiny dim">{l.email}</div> : null}</td>
                  <td><Badge tone={EVENT[l.event]?.tone ?? "neutral"}>{EVENT[l.event]?.label ?? l.event}</Badge></td>
                  <td className="small">{l.role ? ROLE_LABEL[l.role] ?? l.role : "—"}</td>
                  <td className="small muted">{l.place}</td>
                  <td className="small muted">{l.ip ?? "—"}</td>
                  <td className="small muted">{l.device}</td>
                  <td className="small muted">{l.detail ?? ""}</td>
                </tr>
              ))}
              {data.logs.length === 0 && (
                <tr><td colSpan={8} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>Belum ada aktivitas tercatat.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
