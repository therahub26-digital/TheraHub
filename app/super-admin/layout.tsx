import Shell from "@/components/Shell";
import { getSignedInName } from "@/lib/data/currentUser";

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const signedInName = await getSignedInName();
  return (
    <Shell
      role="super-admin"
      scopeLabel="TheraHub Cloud"
      scopeSub="Seluruh tenant & outlet"
      brandKey="violet"
      bgKey="midnight"
      signedInName={signedInName}
    >
      {children}
    </Shell>
  );
}
