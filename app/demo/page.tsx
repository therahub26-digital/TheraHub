import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { isDemoMode, DEMO_GATE_COOKIE, DEMO_ROLES } from "@/lib/demo/config";
import { verifyGate } from "@/lib/demo/gate";
import DemoGateForm from "@/components/demo/DemoGateForm";
import DemoRolePicker from "@/components/demo/DemoRolePicker";
import DemoResetButton from "@/components/demo/DemoResetButton";
import "@/components/demo/demo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Demo TheraHub · Royal Spa",
  robots: { index: false, follow: false },
};

export default async function DemoPage() {
  if (!isDemoMode()) notFound();
  const unlocked = await verifyGate((await cookies()).get(DEMO_GATE_COOKIE)?.value);

  return (
    <div className="demo-page">
      <div className="demo-box">
        <div className="demo-mark">ROYAL SPA</div>
        <span className="demo-tag">Tenant demo TheraHub</span>
        {unlocked ? (
          <>
            <div>
              <h1 className="demo-h1">Masuk sebagai</h1>
              <p className="muted small">
                Satu akun demo, enam peran. Semua data Royal Spa fiktif. Gunakan Reset data di bawah sebelum presentasi.
              </p>
            </div>
            <DemoRolePicker roles={DEMO_ROLES.map(({ role, label, person, desc }) => ({ role, label, person, desc }))} />
            <Link className="demo-link" href="/">Lihat website Royal Spa →</Link>
            <DemoResetButton />
          </>
        ) : (
          <>
            <div>
              <h1 className="demo-h1">Akses demo untuk marketing</h1>
              <p className="muted small">Masuk dengan akun marketing yang diberikan tim TheraHub.</p>
            </div>
            <DemoGateForm />
            <p className="muted small">
              Belum punya akses?{" "}
              <a className="demo-link" href="https://wa.me/6285862388938?text=Halo%20TheraHub%2C%20saya%20mau%20mencoba%20simulasi%20demo%20Royal%20Spa." target="_blank" rel="noopener noreferrer">
                Minta sesi demo via WhatsApp
              </a>
            </p>
            <Link className="demo-link" href="/">← Lihat website Royal Spa</Link>
            <a className="demo-link" href="https://www.therahub.biz.id/">Kembali ke therahub.biz.id</a>
          </>
        )}
      </div>
    </div>
  );
}
