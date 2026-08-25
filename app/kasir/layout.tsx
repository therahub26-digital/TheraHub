import KasirShell from "@/components/KasirShell";
import RoomAlertBanner from "@/components/RoomAlertBanner";
import { PRIMARY_OUTLET } from "@/lib/mock";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getOpenRoomAlerts } from "@/lib/data/alerts";
import { getExtensionRequestsForOutlet } from "@/lib/data/sessions";
import { getTenantTheme } from "@/lib/data/tenant";

export default async function KasirLayout({ children }: { children: React.ReactNode }) {
  const outlet = await getCurrentOutlet();
  const [alerts, extensionRequests, theme] = await Promise.all([
    getOpenRoomAlerts(outlet.id),
    getExtensionRequestsForOutlet(outlet.id),
    getTenantTheme(),
  ]);
  // UPDATE 2026-08-23 — user caught the header bell showing a permanent
  // dot with nothing behind it (see Shell.tsx's header). This is what
  // makes it real for kasir: a pending extension request already shows
  // as a banner on /kasir/sessions, but the bell itself gave no signal
  // from anywhere else in the app — a kasir on Today/Booking or POS had
  // no way to know one was waiting without clicking into Session Monitor.
  const pendingExtensions = extensionRequests.filter((r) => r.status === "PENDING").length;

  return (
    <KasirShell scopeLabel={PRIMARY_OUTLET.name} scopeSub={PRIMARY_OUTLET.city} brandKey={theme.brandKey} bgKey={theme.bgKey} notificationCount={pendingExtensions}>
      <RoomAlertBanner outletId={outlet.id} alerts={alerts} />
      {children}
    </KasirShell>
  );
}
