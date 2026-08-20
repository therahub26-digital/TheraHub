import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card } from "@/components/ui";
import BookingForm from "@/components/BookingForm";
import { getOutlets } from "@/lib/data/outlets";
import { getTherapistsForOutlet } from "@/lib/data/employees";
import { getRoomsForOutlet } from "@/lib/data/rooms";
import { getPackagesForOutlet } from "@/lib/data/catalog";
import { getEffectiveToday } from "@/lib/data/bookings";

export default async function NewBookingPage() {
  // Same "no per-manager outlet-session scoping yet" convention as the
  // rest of the migrated manager pages — see Fase 9 in the roadmap.
  const OUTLETS = await getOutlets();
  const outlet = OUTLETS[0];
  const [therapists, rooms, packages, today] = await Promise.all([
    getTherapistsForOutlet(outlet.id),
    getRoomsForOutlet(outlet.id),
    getPackagesForOutlet(outlet.id),
    getEffectiveToday(),
  ]);

  return (
    <>
      <PageHead
        title="Booking Baru"
        desc={`${outlet.name} · Buat booking baru untuk tamu.`}
        actions={
          <Link href="/manager/bookings" className="btn btn-ghost btn-sm">
            <Icon name="arrow-left" size={14} /> Kembali
          </Link>
        }
      />
      <Card style={{ padding: 20 }}>
        <BookingForm
          outletId={outlet.id}
          today={today}
          packages={packages.map((p) => ({ id: p.id, name: p.name, durationMin: p.durationMin, listPrice: p.listPrice }))}
          therapists={therapists.map((t) => ({ id: t.id, name: t.name, grade: t.therapistGrade, skills: t.skills }))}
          rooms={rooms.map((r) => ({ id: r.id, name: r.name, type: r.type }))}
          source="Kasir"
          backHref="/manager/bookings"
        />
      </Card>
    </>
  );
}
