import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card } from "@/components/ui";
import BookingForm from "@/components/BookingForm";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getTherapistsForOutlet } from "@/lib/data/employees";
import { getPackagesForOutlet } from "@/lib/data/catalog";
import { getEffectiveToday } from "@/lib/data/bookings";

export default async function KasirNewBookingPage() {
  const outlet = await getCurrentOutlet();
  const [therapists, packages, today] = await Promise.all([
    getTherapistsForOutlet(outlet.id),
    getPackagesForOutlet(outlet.id),
    getEffectiveToday(),
  ]);

  return (
    <>
      <PageHead
        title="Booking Walk-in"
        desc={`${outlet.name} · Catat tamu walk-in langsung ke jadwal hari ini.`}
        actions={
          <Link href="/kasir" className="btn btn-ghost btn-sm">
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
          source="Walk-in"
          backHref="/kasir"
        />
      </Card>
    </>
  );
}
