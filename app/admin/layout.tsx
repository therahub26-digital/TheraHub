import Shell from "@/components/Shell";
import { ACTIVE_TENANT } from "@/lib/mock";
import { getTenantTheme, getCurrentTenant } from "@/lib/data/tenant";
import { getSignedInName } from "@/lib/data/currentUser";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [theme, tenant, signedInName] = await Promise.all([getTenantTheme(), getCurrentTenant(), getSignedInName()]);
  // Nama tenant sungguhan kalau ada sesi; ACTIVE_TENANT hanya untuk mode
  // "Ganti Role" yang memang tidak punya tenant untuk dibaca.
  return (
    <Shell role="admin" scopeLabel={tenant?.brandName || ACTIVE_TENANT.name} scopeSub="Semua outlet" brandKey={theme.brandKey} bgKey={theme.bgKey} signedInName={signedInName}>
      {children}
    </Shell>
  );
}
