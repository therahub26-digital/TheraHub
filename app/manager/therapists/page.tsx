import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, PersonCell } from "@/components/ui";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getEmployees, getTherapistsForOutlet } from "@/lib/data/employees";
import { getCommissionsForOutlet, getEffectivePeriod } from "@/lib/data/commissions";
import { EmployeeReferralEditor } from "@/components/EmployeeReferralEditor";
import EmployeePhotoGallery from "@/components/EmployeePhotoGallery";
import { rp, monthLabel } from "@/lib/format";

// ---------------------------------------------------------------------
// Therapists & Staff — was still reading lib/mock, the one page in the
// manager nav nobody migrated during Fase 5. It slipped through because
// every OTHER module's migration was driven by a workflow that touches
// this data (booking a session, paying it, computing commission), while
// this page is a pure roster VIEW that nothing else depends on — easy
// to forget precisely because nothing breaks when it's wrong.
//
// It stayed wrong in a way that mattered: a manager opening this page
// saw invented names (Ningsih Rahayu, Joko Purnomo…) instead of the real
// roster, AND saw "Melati Puspita — TRP-005" as an active, biddable
// therapist — the exact stray demo record this project spent a whole
// round retiring from the booking calendar. The retirement fixed
// getTherapistsForOutlet(); this page just never called it.
//
// SCOPE OF THIS MIGRATION: identity, skills, and employment status are
// real, because they come straight off the employees table. Revenue and
// commission-this-period are real, computed from commission_entries —
// the same source of truth /manager/payroll and /manager/commissions
// already use, so this page can't disagree with those. Utilization and
// star rating are DROPPED rather than faked: there is no shift/capacity
// model and no guest review system in this app yet, so there is no real
// number to show. A made-up 84% utilization or a 4.7-star rating would
// look exactly as authoritative as the real figures next to it, which
// is worse than an honest gap.
//
// UPDATE 2026-08-22: added a "Referral" column, reusing the same
// EmployeeReferralEditor component already wired into /admin/users.
// User feedback: referral relationships should be editable by the
// outlet's own manager too, not just Admin. `employees_write` (RLS,
// 0002) already lets a manager write employees at their own outlet
// (`_is_manager_here(outlet_id)`) — updateEmployeeReferral() was always
// callable from here, this page just never rendered the editor. Same
// component, same action, second location.
// ---------------------------------------------------------------------

export default async function TherapistsPage() {
  const outlet = await getCurrentOutlet();
  const period = await getEffectivePeriod();

  const [therapists, employees, commissions] = await Promise.all([
    getTherapistsForOutlet(outlet.id),
    getEmployees(),
    getCommissionsForOutlet(outlet.id, period),
  ]);

  const staff = employees.filter((e) => !e.isTherapist && e.outletId === outlet.id);

  const commByTherapist = new Map<string, { count: number; revenue: number; commission: number }>();
  for (const c of commissions) {
    const row = commByTherapist.get(c.therapistId) ?? { count: 0, revenue: 0, commission: 0 };
    row.count += 1;
    row.revenue += c.basisAmount;
    row.commission += c.amount;
    commByTherapist.set(c.therapistId, row);
  }

  const rankedTherapists = [...therapists].sort(
    (a, b) => (commByTherapist.get(b.id)?.commission ?? 0) - (commByTherapist.get(a.id)?.commission ?? 0)
  );

  const activeCount = therapists.filter((t) => t.status === "ACTIVE").length;
  const totalCommissionThisPeriod = commissions.reduce((s, c) => s + c.amount, 0);

  return (
    <>
      <PageHead
        title="Therapists & Staff"
        desc={`${outlet.name} · Skill matrix, komisi periode berjalan, dan status kepegawaian.`}
        actions={<button className="btn btn-primary btn-sm"><Icon name="plus" size={14} /> Tambah Staff</button>}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Terapis" value={therapists.length} icon="hand-heart" toneKey="teal" deltaLabel={`${staff.length} staff pendukung`} />
        <StatCard label="Terapis Aktif" value={activeCount} icon="user-check" toneKey="sky" deltaLabel={`${therapists.length - activeCount} nonaktif/cuti`} />
        <StatCard label={`Komisi ${monthLabel(period)}`} value={rp(totalCommissionThisPeriod, { short: true })} icon="percent" toneKey="gold" deltaLabel="Seluruh terapis" />
        <StatCard label="Treatment Tercatat" value={commissions.length} icon="sparkles" toneKey="violet" deltaLabel="Periode berjalan" />
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Daftar Terapis" sub={`${rankedTherapists.length} terapis · diurutkan berdasarkan komisi ${monthLabel(period)}`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Terapis</th><th>Grade</th><th>Skills</th><th>Treatment</th><th>Revenue</th>
                <th>Komisi</th><th>Referral</th><th>Foto</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rankedTherapists.map((t) => {
                const stats = commByTherapist.get(t.id);
                return (
                  <tr key={t.id}>
                    <td><PersonCell name={t.name} sub={t.code} toneKey={t.avatarTone} photoUrl={t.photoUrl} /></td>
                    <td><Badge tone="neutral">{t.therapistGrade ?? "—"}</Badge></td>
                    <td style={{ maxWidth: 220 }}>
                      <div className="row g1 wrap">
                        {t.skills.slice(0, 3).map((s) => (
                          <span key={s} className="tiny dim" style={{ padding: "2px 7px", borderRadius: "var(--r-full)", background: "var(--bg-deep)", border: "1px solid var(--border)" }}>{s}</span>
                        ))}
                        {t.skills.length > 3 && <span className="tiny dim">+{t.skills.length - 3}</span>}
                        {t.skills.length === 0 && <span className="tiny dim">—</span>}
                      </div>
                    </td>
                    <td className="num small">{stats?.count ?? 0}</td>
                    <td className="num small">{rp(stats?.revenue ?? 0, { short: true })}</td>
                    <td className="num small muted">{rp(stats?.commission ?? 0, { short: true })}</td>
                    <td>
                      <EmployeeReferralEditor
                        employeeId={t.id}
                        candidates={therapists
                          .filter((c) => c.id !== t.id)
                          .map((c) => ({ id: c.id, name: c.name }))}
                        referredByEmployeeId={t.referredByEmployeeId}
                        referralFeeType={t.referralFeeType}
                        referralFeeValue={t.referralFeeValue}
                      />
                    </td>
                    <td><EmployeePhotoGallery employeeId={t.id} initialUrls={t.galleryUrls} /></td>
                    <td><Badge tone={t.status === "ACTIVE" ? "success" : "danger"} dot>{t.status}</Badge></td>
                  </tr>
                );
              })}
              {rankedTherapists.length === 0 && (
                <tr>
                  <td colSpan={9} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>
                    Tidak ada terapis aktif di outlet ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/*
          Said plainly instead of a half-empty column: utilization and
          guest rating both need data this app doesn't collect yet (a
          shift/capacity model, a review system). Dropping the columns
          quietly would just move the question to "why isn't it here" —
          this answers it.
        */}
        <div className="tiny dim" style={{ padding: "10px 16px 4px" }}>
          Utilization dan rating tamu belum ditampilkan — butuh modul absensi/shift dan review tamu yang belum live.
        </div>
      </Card>

      <Card>
        <CardHead title="Staff Pendukung" sub={`${staff.length} staff — admin, manager, kasir`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Nama</th><th>Role</th><th>Bergabung</th><th>Status</th></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td><PersonCell name={s.name} sub={s.code} toneKey={s.avatarTone} photoUrl={s.photoUrl} /></td>
                  <td className="muted small">{s.jobRole}</td>
                  <td className="muted small">{s.joinDate}</td>
                  <td><Badge tone={s.status === "ACTIVE" ? "success" : "danger"} dot>{s.status}</Badge></td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={4} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>
                    Tidak ada staff pendukung tercatat di outlet ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
