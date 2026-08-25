import Shell from "@/components/Shell";
import { ACTIVE_TENANT } from "@/lib/mock";
import { getTenantTheme } from "@/lib/data/tenant";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const theme = await getTenantTheme();
  return (
    <Shell role="admin" scopeLabel={ACTIVE_TENANT.name} scopeSub="Semua outlet" brandKey={theme.brandKey} bgKey={theme.bgKey}>
      {children}
    </Shell>
  );
}
