import Icon from "@/components/Icon";
import { Badge, KV } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { ME_THERAPIST, payrollOfEmployee, savingsOf } from "@/lib/mock";
import { rp, monthLabel, fmtDateShort } from "@/lib/format";

export default function PayslipPage() {
  const me = ME_THERAPIST;
  const payslips = payrollOfEmployee(me.id);
  const latest = payslips[0];
  const savings = savingsOf(me.id);
  const balance = savings[0]?.balanceAfter ?? 0;

  return (
    <MobileShell role="therapist" title="Payslip & Tabungan" subtitle={latest ? monthLabel(latest.period) : ""} avatarName={me.name} avatarTone={me.avatarTone}>
      <div className="stack g4">
        {latest && (
          <>
            <div className="m-card" style={{ textAlign: "center", background: "var(--accent-soft)", border: "1px solid var(--accent)" }}>
              <div className="tiny dim uppercase" style={{ marginBottom: 4 }}>Take Home Pay — {monthLabel(latest.period)}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: "var(--text-1)" }}>{rp(latest.netPay)}</div>
              <Badge tone={latest.status === "PAID" ? "success" : "info"} dot>{latest.status}</Badge>
            </div>

            <div className="m-card m-card-tight">
              <div className="m-section">Rincian Pendapatan</div>
              <KV
                items={[
                  ["Gaji Pokok", rp(latest.fixed)],
                  ["Tunjangan", rp(latest.allowance)],
                  ["Komisi", rp(latest.variable)],
                  ["Bonus", rp(latest.bonus)],
                  ...(latest.thr > 0 ? [["THR", rp(latest.thr)] as [string, string]] : []),
                ]}
              />
            </div>

            <div className="m-card m-card-tight">
              <div className="m-section">Potongan</div>
              <KV
                items={[
                  ["Keterlambatan", rp(latest.latePenalty)],
                  ["Absensi", rp(latest.absencePenalty)],
                  ["Tabungan", rp(latest.savings)],
                  ["Pinjaman", rp(latest.loan)],
                  ["Lainnya", rp(latest.otherDeductions)],
                ]}
              />
            </div>

            <button className="m-btn m-btn-ghost"><Icon name="download" size={14} /> Unduh Slip Gaji PDF</button>
          </>
        )}

        <div className="m-card" style={{ background: "rgba(240,180,41,0.09)", border: "1px solid rgba(240,180,41,0.3)" }}>
          <div className="row between" style={{ marginBottom: 4 }}>
            <span className="tiny dim uppercase">Saldo Tabungan</span>
            <Icon name="piggy-bank" size={16} style={{ color: "var(--gold)" }} />
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--text-1)" }}>{rp(balance)}</div>
        </div>

        <div>
          <div className="m-section">Riwayat Tabungan</div>
          <div className="stack g2">
            {savings.slice(0, 10).map((s) => (
              <div key={s.id} className="m-row">
                <span
                  className="stat-icon"
                  style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: s.type === "DEPOSIT" ? "var(--success-soft)" : "var(--danger-soft)" }}
                >
                  <Icon name={s.type === "DEPOSIT" ? "arrow-down-right" : "arrow-up-right"} size={13} style={{ color: s.type === "DEPOSIT" ? "var(--success)" : "var(--danger)" }} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{s.type === "DEPOSIT" ? "Setoran" : "Penarikan"}</div>
                  <div className="tiny dim truncate">{s.ref} · {fmtDateShort(s.date)}</div>
                </div>
                <span className="tiny bold" style={{ color: s.amount > 0 ? "var(--success)" : "var(--danger)" }}>
                  {s.amount > 0 ? "+" : ""}{rp(s.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
