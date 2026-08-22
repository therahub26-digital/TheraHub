import Shell from "@/components/Shell";
import RoomAlertBanner from "@/components/RoomAlertBanner";
import { ACTIVE_TENANT, PRIMARY_OUTLET } from "@/lib/mock";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getOpenRoomAlerts } from "@/lib/data/alerts";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const outlet = await getCurrentOutlet();
  const alerts = await getOpenRoomAlerts(outlet.id);

  return (
    <Shell role="manager" scopeLabel={PRIMARY_OUTLET.name} scopeSub={PRIMARY_OUTLET.city} brandKey={ACTIVE_TENANT.logoTone}>
      <RoomAlertBanner outletId={outlet.id} alerts={alerts} />
      {children}
    </Shell>
  );
}
