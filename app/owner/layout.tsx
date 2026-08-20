import Shell from "@/components/Shell";
import { ACTIVE_TENANT } from "@/lib/mock";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell role="owner" scopeLabel={ACTIVE_TENANT.name} scopeSub="3 outlet · konsolidasi" brandKey={ACTIVE_TENANT.logoTone}>
      {children}
    </Shell>
  );
}
