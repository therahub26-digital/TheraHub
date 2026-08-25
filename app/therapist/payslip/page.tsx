import { Badge, KV } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { ME_THERAPIST } from "@/lib/mock";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getPayrollForEmployee, getPayrollSettings, getAdjustmentsForEmployee } from "@/lib/data/payroll";
import { getSignedInTherapist } from "@/lib/data/commissions";
import { getSavingsForEmployee, balanceOf } from "@/lib/data/savings";
import { activeComponents, splitComponents } from "@/lib/payroll";
import { rp, monthLabel } from "@/lib/format";

// ---------------------------------------------------------------------
// The therapist's own payslip.
//
// Renders ONLY the components their outlet actually pays. The previous
// version hardcoded eight rows — Gaji Pokok, Tunjangan, Bonus,
// Keterlambatan, Tabungan, Pinjaman... — which for an Amethyst therapist
// would every one of them read "Rp0". A payslip listing seven zeroes
// under someone's name does not read as "not applicable"; it reads as a
// list of things they were denied. The component list comes from
// payroll_settings so the slip says exactly what the business pays and
// nothing more.
//
// Deductions are itemised from the manager's own labels (migration
// 0006) rather than rolled into category totals — a real Amethyst slip
// carries lines like "rok navy" and "latihan" that no fixed column
// could have named, and the employee needs to see which is which.
// ---------------------------------------------------------------------

export default async function PayslipPage() {
  const signedIn = await getSignedInTherapist();
  const me = signedIn ?? ME_THERAPIST;
  // A therapist's payslip must read their OWN outlet's payroll_settings —
  // Mekarwangi and Cikawao can pay different components. getCurrentOutlet()
  // reads it off the signed-in session's own app_users.outlet_id, so this
  // is naturally correct per-therapist without needing to thread outletId
  // through getSignedInTherapist()'s return type (id/name/photoUrl only, no outletId).
  const outlet = await getCurrentOutlet();

  const [payslips, settings] = await Promise.all([
    getPayrollForEmployee(me.id),
    getPayrollSettings(outlet.id),
  ]);
  const latest = payslips[0];
  // The itemised lines for the payslip being shown. Fetched by that
  // slip's period rather than "this month", so an old payslip keeps the
  // lines it was actually built from.
  const lines = latest ? await getAdjustmentsForEmployee(me.id, latest.period) : [];
  const lineEarnings = lines.filter((l) => l.kind === "EARNING");
  const lineDeductions = lines.filter((l) => l.kind === "DEDUCTION");
  const components = activeComponents(settings?.components ?? []);
  const { earnings } = splitComponents(components);

  // Real entries now, not lib/mock. A savings balance is money the
  // company is holding on this person's behalf; a decorative figure here
  // would be a false statement about what they are owed.
  const showSavings = components.some((c) => c.key === "SAVINGS");
  const savings = showSavings ? await getSavingsForEmployee(me.id) : [];
  const balance = balanceOf(savings);
  const avatarTone = signedIn ? "teal" : ME_THERAPIST.avatarTone;

  return (
    <MobileShell
      role="therapist"
      title="Payslip"
      subtitle={latest ? monthLabel(latest.period) : ""}
      avatarName={me.name} avatarUrl={me.photoUrl}
      avatarTone={avatarTone}
    >
      <div className="stack g4">
        {!latest && (
          <div className="m-card" style={{ textAlign: "center" }}>
            <div className="small dim">Belum ada slip gaji yang diterbitkan.</div>
            <div className="tiny dim" style={{ marginTop: 6 }}>
              Slip muncul setelah manager menghitung payroll periode ini.
            </div>
          </div>
        )}

        {latest && (
          <>
            <div className="m-card" style={{ textAlign: "center", background: "var(--accent-soft)", border: "1px solid var(--accent)" }}>
              <div className="tiny dim uppercase" style={{ marginBottom: 4 }}>Take Home Pay — {monthLabel(latest.period)}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: "var(--text-1)" }}>{rp(latest.netPay)}</div>
              <Badge tone={latest.status === "PAID" ? "success" : "info"} dot>{latest.status}</Badge>
            </div>

            {(earnings.some((c) => c.source !== "MANUAL") || lineEarnings.length > 0) && (
              <div className="m-card m-card-tight">
                <div className="m-section">Rincian Pendapatan</div>
                <KV
                  items={[
                    // Auto-derived components keep their standard label.
                    ...earnings
                      .filter((c) => c.source !== "MANUAL")
                      .map((c) => [c.label, rp(Number(latest[c.field] ?? 0))] as [string, string]),
                    // Manager-entered lines keep THEIR label — "Bonus
                    // Lebaran" says more than "Bonus".
                    ...lineEarnings.map((l) => [l.label, rp(l.amount)] as [string, string]),
                  ]}
                />
              </div>
            )}

            {/* Itemised by the label the manager typed, not rolled into
                a category total. "Potongan Lain Rp430.000" tells someone
                nothing about their own money; "Rok navy / Seragam navy /
                Latihan" tells them exactly what they paid for.
                Rendered only when there ARE deductions — an empty card
                would suggest something was withheld and the detail
                merely missing. */}
            {lineDeductions.length > 0 && (
              <div className="m-card m-card-tight">
                <div className="m-section">Potongan</div>
                <KV items={lineDeductions.map((l) => [l.label, rp(l.amount)] as [string, string])} />
              </div>
            )}

            {settings?.note && <div className="tiny dim" style={{ padding: "0 4px" }}>{settings.note}</div>}
          </>
        )}

        {showSavings && (
          <div className="m-card" style={{ background: "rgba(240,180,41,0.09)", border: "1px solid rgba(240,180,41,0.3)" }}>
            <div className="tiny dim uppercase" style={{ marginBottom: 4 }}>Saldo Tabungan</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--text-1)" }}>{rp(balance)}</div>
            {savings.length === 0 ? (
              <div className="tiny dim" style={{ marginTop: 6 }}>
                Belum ada setoran. Saldo bertambah setiap payroll dihitung dengan potongan tabungan.
              </div>
            ) : (
              /* The movements, not just the total — someone checking
                 their savings is usually checking whether a particular
                 month went in, and a lone number cannot answer that. */
              <div className="stack g1" style={{ marginTop: 10 }}>
                {savings.slice(0, 6).map((s) => (
                  <div key={s.id} className="row tiny" style={{ gap: 6 }}>
                    <span className="dim" style={{ flex: 1, minWidth: 0 }}>
                      {s.period ? monthLabel(s.period) : s.date}
                      {s.type === "WITHDRAWAL" && " · pencairan"}
                    </span>
                    <span className="bold" style={{ color: s.type === "WITHDRAWAL" ? "var(--warning)" : "var(--text-1)" }}>
                      {s.type === "WITHDRAWAL" ? "−" : "+"}{rp(s.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {payslips.length > 1 && (
          <div>
            <div className="m-section">Riwayat Slip</div>
            <div className="stack g2">
              {payslips.slice(1, 13).map((p) => (
                <div key={p.id} className="m-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{monthLabel(p.period)}</div>
                    <div className="tiny dim">{p.status}</div>
                  </div>
                  <span className="tiny bold" style={{ color: "var(--text-1)" }}>{rp(p.netPay)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
