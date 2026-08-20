import Shell from "@/components/Shell";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell
      role="super-admin"
      scopeLabel="TheraHub Cloud"
      scopeSub="Seluruh tenant & outlet"
      brandKey="violet"
      bgKey="midnight"
    >
      {children}
    </Shell>
  );
}
