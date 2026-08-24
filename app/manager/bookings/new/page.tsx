import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card } from "@/components/ui";
import BookingForm from "@/components/BookingForm";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getTherapistsForOutlet } from "@/lib/data/employees";
import { getPackagesForOutlet } from "@/lib/data/catalog";
import { getEffectiveToday } from "@/lib/data/bookings";
import { getScheduleExceptions } from "@/lib/data/scheduleExceptions";

export default async function NewBookingPage() {
  const outlet = await getCurrentOutlet();
  const [therapists, packages, today] = await Promise.all([
    getTherapistsForOutlet(outlet.id),
    getPackagesForOutlet(outlet.id),
    getEffectiveToday(),
  ]);
  const exceptions = await getScheduleExceptions(outlet.id, today);
  const unavailableTherapistIds = exceptions.map((e) => e.employeeId);

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
          unavailableTherapistIds={unavailableTherapistIds}
          source="Kasir"
          backHref="/manager/bookings"
          successHref="/manager/bookings?date={date}"
        />
      </Card>
    </>
  );
}
