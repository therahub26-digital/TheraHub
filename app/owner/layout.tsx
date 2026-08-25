import Shell from "@/components/Shell";
import { ACTIVE_TENANT } from "@/lib/mock";
import { getTenantTheme } from "@/lib/data/tenant";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const theme = await getTenantTheme();
  return (
    <Shell role="owner" scopeLabel={ACTIVE_TENANT.name} scopeSub="3 outlet · konsolidasi" brandKey={theme.brandKey} bgKey={theme.bgKey}>
      {children}
    </Shell>
  );
}
