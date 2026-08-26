import Shell from "@/components/Shell";
import { ACTIVE_TENANT } from "@/lib/mock";
import { getTenantTheme, getCurrentTenant } from "@/lib/data/tenant";
import { getOutlets } from "@/lib/data/outlets";
import { getSignedInName } from "@/lib/data/currentUser";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const [theme, tenant, outlets, signedInName] = await Promise.all([
    getTenantTheme(),
    getCurrentTenant(),
    getOutlets(),
    getSignedInName(),
  ]);
  // "3 outlet" dulu ditulis tetap di sini padahal Amethyst punya dua —
  // angka yang salah di kalimat yang terlihat resmi. Sekarang dihitung.
  return (
    <Shell role="owner" scopeLabel={tenant?.brandName || ACTIVE_TENANT.name} scopeSub={`${outlets.length} outlet · konsolidasi`} brandKey={theme.brandKey} bgKey={theme.bgKey} signedInName={signedInName}>
      {children}
    </Shell>
  );
}
