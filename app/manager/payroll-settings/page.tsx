import { PageHead, Card, CardHead } from "@/components/ui";
import { PayrollSettingsForm } from "@/components/PayrollControls";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getPayrollSettings } from "@/lib/data/payroll";

// ---------------------------------------------------------------------
// Where an outlet declares what its payslips are made of.
//
// This screen exists because payroll structure is a business decision,
// not a product constant. Amethyst pays commission only; the next spa on
// TheraHub may pay a base wage, allowances, and hold savings. Encoding
// either one in the application would make the other a rewrite.
// ---------------------------------------------------------------------

export default async function PayrollSettingsPage() {
  const outlet = await getCurrentOutlet();
  const settings = await getPayrollSettings(outlet.id);

  return (
    <>
      <PageHead
        title="Pengaturan Payroll"
        desc={`${outlet.name} · Tentukan komponen apa saja yang membentuk slip gaji di outlet ini.`}
      />

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card>
          <CardHead
            title="Komponen Payroll"
            sub={settings ? "Sudah diatur" : "Belum diatur — payroll tidak bisa dihitung sebelum ini diisi"}
          />
          <div className="card-body">
            <PayrollSettingsForm
              outletId={outlet.id}
              initial={settings?.components ?? []}
              initialNote={settings?.note ?? ""}
            />
          </div>
        </Card>

        <Card>
          <CardHead title="Kenapa ini diatur per outlet?" />
          <div className="card-body stack g3 small muted">
            <p>
              Tabel payroll punya sepuluh komponen, tapi tidak ada bisnis yang memakai
              semuanya. Yang dipakai berbeda-beda per spa — jadi ini disimpan sebagai{" "}
              <span className="strong" style={{ color: "var(--text-1)" }}>data</span>, bukan
              ditulis di dalam kode.
            </p>
            <p>
              Amethyst membayar terapis <span className="strong" style={{ color: "var(--text-1)" }}>murni dari komisi</span>{" "}
              per treatment — statusnya lepas, jadi gaji pokok dan tunjangan memang nol,
              bukan kosong karena belum diisi. Spa lain belum tentu begitu, dan mereka
              tinggal mencentang komponen yang mereka pakai di layar ini.
            </p>
            <p>
              Komponen yang tampil redup belum punya sumber data — mencentangnya cuma akan
              menghasilkan baris bernilai Rp0 di slip gaji orang, yang terbaca seolah-olah
              itu haknya. Alasannya ditulis di masing-masing.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
