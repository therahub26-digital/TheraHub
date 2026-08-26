import Shell from "@/components/Shell";
import RoomAlertBanner from "@/components/RoomAlertBanner";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getOpenRoomAlerts } from "@/lib/data/alerts";
import { getExtensionRequestsForOutlet } from "@/lib/data/sessions";
import { getTenantTheme } from "@/lib/data/tenant";
import { getSignedInName } from "@/lib/data/currentUser";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const outlet = await getCurrentOutlet();
  const [alerts, extensionRequests, theme, signedInName] = await Promise.all([
    getOpenRoomAlerts(outlet.id),
    getExtensionRequestsForOutlet(outlet.id),
    getTenantTheme(),
    getSignedInName(),
  ]);
  // Same fix as app/kasir/layout.tsx — see that file's comment.
  const pendingExtensions = extensionRequests.filter((r) => r.status === "PENDING").length;

  return (
    <Shell role="manager" scopeLabel={outlet.name} scopeSub={outlet.city} brandKey={theme.brandKey} bgKey={theme.bgKey} notificationCount={pendingExtensions} notificationHref="/manager/sessions" signedInName={signedInName}>
      <RoomAlertBanner outletId={outlet.id} alerts={alerts} />
      {children}
    </Shell>
  );
}
