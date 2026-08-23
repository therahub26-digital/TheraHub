import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, PersonCell } from "@/components/ui";
import {
  AddAdjustmentForm,
  EditAdjustmentButton,
  DeleteAdjustmentButton,
  RunPayrollButton,
  BulkAdjustmentForm,
  DeleteBatchButton,
  WithdrawSavingsButton,
} from "@/components/PayrollControls";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getEmployees } from "@/lib/data/employees";
import { getPayrollForOutlet, getPayrollSettings, getAdjustmentsForOutlet } from "@/lib/data/payroll";
import { getCommissionsForOutlet, getEffectivePeriod } from "@/lib/data/commissions";
import { getSavingsBalancesForOutlet } from "@/lib/data/savings";
import { activeComponents, computeNetPay, splitComponents, type ComponentSpec, type PayrollAdjustment } from "@/lib/payroll";
import { rp, monthLabel } from "@/lib/format";
import type { Employee } from "@/lib/types";

// ---------------------------------------------------------------------
// The manager's payroll review sheet.
//
// Built as ONE table with a column per active component, because that is
// how payroll is actually checked: you scan down a column to spot the
// person whose savings deduction is missing, or across a row to see why
// someone's take-home looks wrong. A stack of per-person cards hides
// exactly those comparisons — you cannot see that ten people have a
// Tabungan line and one does not when each is in its own box.
//
// A totals row closes the sheet, so the figure the manager signs off is
// visible next to the parts that produced it.
//
// The take-home shown is recomputed live from the current lines, so
// adding a deduction updates it immediately. The STORED payslip only
// changes when Hitung Payroll runs — and where the two disagree the row
// says so, rather than quietly showing one of them.
// ---------------------------------------------------------------------

type Row = {
  employee: Employee;
  lines: PayrollAdjustment[];
  commissionCount: number;
  values: Record<string, number>;
  live: number;
  storedNet: number | null;
};

/** Amount for one component for one employee, from whichever source it has. */
function componentValue(
  spec: ComponentSpec,
  employee: Employee,
  commissionTotal: number,
  lines: PayrollAdjustment[]
): number {
  if (spec.source === "EMPLOYEE") {
    return spec.key === "FIXED" ? employee.baseSalary : employee.fixedAllowance;
  }
  if (spec.source === "COMMISSION_ENTRIES") return commissionTotal;
  // MANUAL: sum the lines the manager tagged with this component.
  return lines.filter((l) => l.component === spec.key).reduce((s, l) => s + l.amount, 0);
}

export default async function ManagerPayrollPage() {
  const outlet = await getCurrentOutlet();
  const period = await getEffectivePeriod();

  const [settings, employees, items, adjustments, commissions, savingsBalances] = await Promise.all([
    getPayrollSettings(outlet.id),
    getEmployees(),
    getPayrollForOutlet(outlet.id, period),
    getAdjustmentsForOutlet(outlet.id, period),
    getCommissionsForOutlet(outlet.id, period),
    getSavingsBalancesForOutlet(outlet.id),
  ]);

  if (!settings) {
    return (
      <>
        <PageHead title="Payroll" desc={`${outlet.name} · ${monthLabel(period)}`} />
        <Card>
          <CardHead title="Struktur payroll belum diatur" />
          <div className="card-body stack g3">
            <p className="small muted" style={{ maxWidth: 560 }}>
              Tentukan dulu komponen apa saja yang membentuk slip gaji di outlet ini. Ini sengaja
              tidak ditebak — menebaknya berarti menetapkan kebijakan gaji atas nama bisnis Anda.
            </p>
            <div>
              <Link className="btn btn-primary btn-sm" href="/manager/payroll-settings">
                <Icon name="sliders-horizontal" size={13} /> Atur Struktur Payroll
              </Link>
            </div>
          </div>
        </Card>
      </>
    );
  }

  const components = activeComponents(settings.components);
  const { earnings, deductions } = splitComponents(components);

  // Payroll covers everyone at the outlet, not only therapists — a kasir
  // or manager on a salary needs a payslip too.
  const active = employees
    .filter((e) => e.outletId === outlet.id && e.status === "ACTIVE")
    .sort((a, b) => a.name.localeCompare(b.name));

  const storedByEmployee = new Map(items.map((i) => [i.employeeId, i]));
  const commissionByEmployee = new Map<string, { total: number; count: number }>();
  for (const c of commissions) {
    const row = commissionByEmployee.get(c.therapistId) ?? { total: 0, count: 0 };
    row.total += c.amount;
    row.count += 1;
    commissionByEmployee.set(c.therapistId, row);
  }

  const rows: Row[] = active.map((e) => {
    const lines = adjustments.filter((a) => a.employeeId === e.id);
    const comm = commissionByEmployee.get(e.id) ?? { total: 0, count: 0 };

    const values: Record<string, number> = {};
    for (const spec of components) {
      values[spec.key] = componentValue(spec, e, comm.total, lines);
    }

    // computeNetPay reads the PayrollItem-shaped draft for auto sources
    // and the raw lines for manual ones, so the figure here is derived
    // the same way the stored payslip will be.
    const draft = {
      fixed: components.some((c) => c.key === "FIXED") ? e.baseSalary : 0,
      allowance: components.some((c) => c.key === "ALLOWANCE") ? e.fixedAllowance : 0,
      variable: components.some((c) => c.key === "COMMISSION") ? comm.total : 0,
    };
    const stored = storedByEmployee.get(e.id);

    return {
      employee: e,
      lines,
      commissionCount: comm.count,
      values,
      live: computeNetPay(draft, components, lines),
      storedNet: stored ? stored.netPay : null,
    };
  });

  const totals: Record<string, number> = {};
  for (const spec of components) {
    totals[spec.key] = rows.reduce((s, r) => s + (r.values[spec.key] ?? 0), 0);
  }
  const totalLive = rows.reduce((s, r) => s + r.live, 0);
  const stale = rows.some((r) => r.storedNet !== null && r.storedNet !== r.live);
  const withActivity = rows.filter((r) => r.live !== 0 || r.lines.length > 0).length;

  // Two employee records sharing a name is worth surfacing here rather
  // than letting payroll quietly cut two payslips for one person.
  const nameCounts = new Map<string, number>();
  for (const r of rows) nameCounts.set(r.employee.name, (nameCounts.get(r.employee.name) ?? 0) + 1);
  const duplicates = [...nameCounts.entries()].filter(([, n]) => n > 1).map(([name]) => name);

  // Rows created by one bulk action, grouped so the whole thing can be
  // called off in one click. Showing them as a batch (rather than only as
  // N identical lines scattered down the table) is what makes an
  // across-the-board deduction reviewable as the single decision it was.
  const batches = new Map<string, { label: string; amount: number; kind: string; count: number }>();
  for (const a of adjustments) {
    if (!a.batchId) continue;
    const b = batches.get(a.batchId) ?? { label: a.label, amount: a.amount, kind: a.kind, count: 0 };
    b.count += 1;
    batches.set(a.batchId, b);
  }

  const usesSavings = components.some((c) => c.key === "SAVINGS");
  const therapistCount = active.filter((e) => e.isTherapist).length;

  // UPDATE 2026-08-23 — user feedback: "belum dipisahkan therapis dan
  // karyawan". A single flat table made it easy to lose a staff member
  // (kasir/admin) inside a long list dominated by therapists, and vice
  // versa — the two groups are paid on different logic (commission vs.
  // pure fixed pay) so reviewing them separately matches how a manager
  // actually checks the sheet. Same columns, same live/stored figures,
  // just split into two Cards with their own subtotal row.
  const therapistRows = rows.filter((r) => r.employee.isTherapist);
  const staffRows = rows.filter((r) => !r.employee.isTherapist);

  function subtotal(group: Row[]): Record<string, number> {
    const t: Record<string, number> = {};
    for (const spec of components) {
      t[spec.key] = group.reduce((s, r) => s + (r.values[spec.key] ?? 0), 0);
    }
    return t;
  }

  return (
    <>
      <PageHead
        title="Payroll"
        desc={`${outlet.name} · ${monthLabel(period)} · Review estimasi sebelum dihitung final.`}
        actions={<RunPayrollButton outletId={outlet.id} period={period} />}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Estimasi Total" value={rp(totalLive, { short: true })} icon="wallet" toneKey="gold" deltaLabel={`${rows.length} karyawan aktif`} />
        <StatCard label="Ada Penghasilan" value={withActivity} icon="user-check" toneKey="teal" deltaLabel={`${rows.length - withActivity} belum ada`} />
        <StatCard label="Baris Manual" value={adjustments.length} icon="clipboard-list" toneKey="sky" deltaLabel="Potongan & tambahan" />
        <StatCard label="Slip Tersimpan" value={items.length} icon="file-text" toneKey="violet" deltaLabel={items.length ? "Sudah dihitung" : "Belum dihitung"} />
      </div>

      {duplicates.length > 0 && (
        <Card style={{ marginBottom: 16, borderColor: "var(--danger)" }}>
          <div className="card-body small" style={{ color: "var(--danger)" }}>
            <Icon name="alert-triangle" size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Ada nama karyawan yang muncul lebih dari sekali: <strong>{duplicates.join(", ")}</strong>. Kalau ini
            memang satu orang yang terdata dua kali, payroll akan menerbitkan dua slip untuknya — periksa di
            Therapists &amp; Staff sebelum menghitung.
          </div>
        </Card>
      )}

      {stale && (
        <Card style={{ marginBottom: 16, borderColor: "var(--warning)" }}>
          <div className="card-body small" style={{ color: "var(--warning)" }}>
            <Icon name="alert-triangle" size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Ada baris yang berubah setelah payroll terakhir dihitung. Tekan <strong>Hitung Payroll</strong> supaya
            slip yang tersimpan ikut diperbarui.
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <CardHead
          title="Potongan / Tambahan Massal"
          sub="Sekali input untuk semua orang — mis. seragam baru, iuran, atau bonus bersama."
        />
        <div className="card-body stack g3">
          <BulkAdjustmentForm
            outletId={outlet.id}
            period={period}
            therapistCount={therapistCount}
            staffCount={active.length}
          />

          {/* Batches already applied to THIS period. Listed as one line
              each rather than as N rows, because that is how the decision
              was made and how it should be undone. */}
          {batches.size > 0 && (
            <div className="stack g2">
              <div className="tiny dim uppercase">Batch aktif periode ini</div>
              {[...batches.entries()].map(([id, b]) => (
                <div key={id} className="row g3 wrap" style={{ alignItems: "center" }}>
                  <span className="small" style={{ color: "var(--text-1)", flex: 1, minWidth: 160 }}>
                    <strong>{b.label}</strong>{" "}
                    <span className="dim">
                      {b.kind === "EARNING" ? "+" : "−"}{rp(b.amount)} × {b.count} orang
                    </span>
                  </span>
                  <DeleteBatchButton batchId={id} label={b.label} rowCount={b.count} />
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {([
        { key: "therapist", title: "Estimasi Terapis", group: therapistRows, emptyLabel: "Tidak ada terapis aktif di outlet ini." },
        { key: "staff", title: "Estimasi Karyawan (Non-Terapis)", group: staffRows, emptyLabel: "Tidak ada staff pendukung aktif di outlet ini." },
      ] as const).map(({ key, title, group, emptyLabel }) => {
        const groupTotals = subtotal(group);
        const groupTotalLive = group.reduce((s, r) => s + r.live, 0);
        return (
          <Card key={key} style={{ marginBottom: 16 }}>
            <CardHead
              title={title}
              sub={`${group.length} orang · ${components.length} komponen aktif: ${components.map((c) => c.label).join(" · ")}`}
            />
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ minWidth: 180 }}>Karyawan</th>
                    {earnings.map((c) => <th key={c.key}>{c.label}</th>)}
                    {deductions.map((c) => <th key={c.key}>{c.label}</th>)}
                    {usesSavings && <th>Saldo Tabungan</th>}
                    <th>Take-Home</th>
                    <th style={{ minWidth: 120 }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {group.map((r) => (
                    <tr key={r.employee.id}>
                      <td>
                        <PersonCell name={r.employee.name} sub={r.employee.jobRole} toneKey="teal" size={28} />
                        {/* Manual lines listed under the name so the label the
                            manager typed stays visible — a column total alone
                            would not say WHICH deduction it was. */}
                        {r.lines.length > 0 && (
                          <div className="stack g1" style={{ marginTop: 6 }}>
                            {r.lines.map((l) => (
                              <div key={l.id} className="stack g1" style={{ marginBottom: 2 }}>
                                <div className="row tiny" style={{ gap: 6, alignItems: "center" }}>
                                  <span className="dim" style={{ flex: 1, minWidth: 0 }}>
                                    {l.kind === "EARNING" ? "+" : "−"}{rp(l.amount)} · {l.label}
                                  </span>
                                  <EditAdjustmentButton
                                    id={l.id}
                                    initialLabel={l.label}
                                    initialAmount={l.amount}
                                    initialComponent={l.component}
                                  />
                                  <DeleteAdjustmentButton id={l.id} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {earnings.map((c) => {
                        const v = r.values[c.key] ?? 0;
                        return (
                          <td key={c.key} className={`num small${v === 0 ? " dim" : ""}`}>
                            {rp(v)}
                            {c.key === "COMMISSION" && r.commissionCount > 0 && (
                              <div className="tiny dim">{r.commissionCount} treatment</div>
                            )}
                          </td>
                        );
                      })}

                      {deductions.map((c) => {
                        const v = r.values[c.key] ?? 0;
                        return (
                          <td key={c.key} className={`num small${v === 0 ? " dim" : ""}`}>
                            {v === 0 ? rp(0) : `−${rp(v)}`}
                          </td>
                        );
                      })}

                      {/* The running balance, not this month's deduction —
                          the deduction column already says what was taken.
                          This is the total the company is holding for them,
                          which is the number that matters when deciding
                          whether to pay it out. */}
                      {usesSavings && (
                        <td className="num small">
                          <span className={savingsBalances.get(r.employee.id) ? "strong" : "dim"}
                            style={savingsBalances.get(r.employee.id) ? { color: "var(--text-1)" } : undefined}>
                            {rp(savingsBalances.get(r.employee.id) ?? 0)}
                          </span>
                          <div style={{ marginTop: 4 }}>
                            <WithdrawSavingsButton
                              employeeId={r.employee.id}
                              outletId={outlet.id}
                              period={period}
                              balance={savingsBalances.get(r.employee.id) ?? 0}
                            />
                          </div>
                        </td>
                      )}

                      <td className="num small strong" style={{ color: "var(--text-1)" }}>
                        {rp(r.live)}
                        {r.storedNet !== null && r.storedNet !== r.live && (
                          <div className="tiny" style={{ color: "var(--warning)" }}>
                            tersimpan {rp(r.storedNet)}
                          </div>
                        )}
                      </td>

                      <td>
                        <AddAdjustmentForm employeeId={r.employee.id} outletId={outlet.id} period={period} />
                      </td>
                    </tr>
                  ))}

                  {group.length === 0 && (
                    <tr>
                      <td colSpan={3 + components.length + (usesSavings ? 1 : 0)} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>
                        {emptyLabel}
                      </td>
                    </tr>
                  )}
                </tbody>

                {group.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border)" }}>
                      <td className="strong" style={{ color: "var(--text-1)" }}>Total {group.length} orang</td>
                      {earnings.map((c) => (
                        <td key={c.key} className="num small strong" style={{ color: "var(--text-1)" }}>{rp(groupTotals[c.key] ?? 0)}</td>
                      ))}
                      {deductions.map((c) => (
                        <td key={c.key} className="num small strong" style={{ color: "var(--text-1)" }}>
                          {(groupTotals[c.key] ?? 0) === 0 ? rp(0) : `−${rp(groupTotals[c.key])}`}
                        </td>
                      ))}
                      {usesSavings && (
                        <td className="num small strong" style={{ color: "var(--text-1)" }}>
                          {rp(group.reduce((s2, r) => s2 + (savingsBalances.get(r.employee.id) ?? 0), 0))}
                        </td>
                      )}
                      <td className="num strong" style={{ color: "var(--accent)", fontSize: 15 }}>{rp(groupTotalLive)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        );
      })}

      {settings.note && (
        <Card style={{ marginTop: 16 }}>
          <div className="card-body small muted">
            <Icon name="info" size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            {settings.note}
          </div>
        </Card>
      )}
    </>
  );
}
