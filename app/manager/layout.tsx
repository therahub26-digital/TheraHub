import Shell from "@/components/Shell";
import { ACTIVE_TENANT, PRIMARY_OUTLET } from "@/lib/mock";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell role="manager" scopeLabel={PRIMARY_OUTLET.name} scopeSub={PRIMARY_OUTLET.city} brandKey={ACTIVE_TENANT.logoTone}>
      {children}
    </Shell>
  );
}
