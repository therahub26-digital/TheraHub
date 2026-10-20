import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { isDemoMode, DEMO_GATE_COOKIE, DEMO_ROLES } from "@/lib/demo/config";
import { verifyGate } from "@/lib/demo/gate";
import DemoGateForm from "@/components/demo/DemoGateForm";
import DemoRolePicker from "@/components/demo/DemoRolePicker";
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
                Satu akun demo, enam peran. Semua data Royal Spa fiktif dan dikembalikan ke kondisi awal setiap malam pukul 03.00 WIB.
              </p>
            </div>
            <DemoRolePicker roles={DEMO_ROLES.map(({ role, label, person, desc }) => ({ role, label, person, desc }))} />
            <Link className="demo-link" href="/">Lihat website Royal Spa →</Link>
          </>
        ) : (
          <>
            <div>
              <h1 className="demo-h1">Akses demo untuk marketing</h1>
              <p className="muted small">Masuk dengan akun marketing yang diberikan tim TheraHub.</p>
            </div>
            <DemoGateForm />
          </>
        )}
      </div>
    </div>
  );
}
