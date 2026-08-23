import Shell from "@/components/Shell";
import RoomAlertBanner from "@/components/RoomAlertBanner";
import { ACTIVE_TENANT, PRIMARY_OUTLET } from "@/lib/mock";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getOpenRoomAlerts } from "@/lib/data/alerts";
import { getExtensionRequestsForOutlet } from "@/lib/data/sessions";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const outlet = await getCurrentOutlet();
  const [alerts, extensionRequests] = await Promise.all([
    getOpenRoomAlerts(outlet.id),
    getExtensionRequestsForOutlet(outlet.id),
  ]);
  // Same fix as app/kasir/layout.tsx — see that file's comment.
  const pendingExtensions = extensionRequests.filter((r) => r.status === "PENDING").length;

  return (
    <Shell role="manager" scopeLabel={PRIMARY_OUTLET.name} scopeSub={PRIMARY_OUTLET.city} brandKey={ACTIVE_TENANT.logoTone} notificationCount={pendingExtensions}>
      <RoomAlertBanner outletId={outlet.id} alerts={alerts} />
      {children}
    </Shell>
  );
}
