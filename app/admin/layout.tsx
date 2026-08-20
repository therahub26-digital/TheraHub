import Shell from "@/components/Shell";
import { ACTIVE_TENANT } from "@/lib/mock";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell role="admin" scopeLabel={ACTIVE_TENANT.name} scopeSub="Semua outlet" brandKey={ACTIVE_TENANT.logoTone}>
      {children}
    </Shell>
  );
}
