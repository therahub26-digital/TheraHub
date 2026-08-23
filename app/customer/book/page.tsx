import MobileShell from "@/components/MobileShell";
import CustomerBookingForm, { type OutletOption, type PackageOption, type TherapistOption } from "@/components/CustomerBookingForm";
import Icon from "@/components/Icon";
import { Badge } from "@/components/ui";
import { getCurrentCustomer } from "@/lib/data/customers";
import { getOutlets } from "@/lib/data/outlets";
import { getPackagesForOutlet } from "@/lib/data/catalog";
import { getTherapistsForOutlet } from "@/lib/data/employees";
import { getBookingsForCustomer, getEffectiveToday } from "@/lib/data/bookings";
import { getUnavailableTherapistIdsForCustomer } from "@/lib/data/scheduleExceptions";
import { ME_CUSTOMER, OUTLETS as MOCK_OUTLETS, packagesOf, therapistsOf, TODAY as MOCK_TODAY } from "@/lib/mock";
import { fmtDateShort, fmtTime } from "@/lib/format";

// ---------------------------------------------------------------------
// UPDATE 2026-08-22 — the old version of this page was a fully static
// mock display (hard-coded PRIMARY_OUTLET, first package auto-"selected",
// no actual submit). Replaced with a real multi-outlet booking flow: this
// Server Component gathers every published-tenant outlet's real
// packages/therapists up front (small real dataset, see lib/data/
// catalog.ts's header — Amethyst has ~1 real package today, so
// prefetching all outlets at once is cheap and avoids extra round trips
// when the customer switches outlet client-side), and hands them to
// CustomerBookingForm (Client Component) which owns the actual
// selection/submit interaction. See that file and lib/actions/
// customerBookings.ts for the live-write half.
//
// Falls back to a read-only preview built from mock data (via
// buildMockOptions below) for a demo/"Ganti Role" viewer with no real
// customer session — CustomerBookingForm's submit would fail against a
// nonexistent auth session there anyway, but browsing the picker still
// shows the demo catalog for showcase purposes, same convention as
// every other portal page.
// ---------------------------------------------------------------------

export default async function BookPage({ searchParams }: { searchParams: Promise<{ outlet?: string }> }) {
  const sp = await searchParams;
  const customer = await getCurrentCustomer();
  const live = customer !== null;
  const me = customer ?? ME_CUSTOMER;

  let outlets: OutletOption[];
  let packages: PackageOption[];
  let therapists: TherapistOption[];
  let today: string;
  let unavailableTherapistIds: string[] = [];
  // "Daftar booking Budi tidak muncul" (user, 2026-08-23): the Booking
  // tab jumped straight into the new-booking wizard with zero mention of
  // bookings the customer already has — the only places that ever showed
  // them were the Beranda card (just the single soonest one) and Profil
  // -> Riwayat Booking. Fetched here alongside everything else so the
  // page can show them above the form.
  let upcomingBookings: Awaited<ReturnType<typeof getBookingsForCustomer>> = [];

  if (live) {
    const liveOutlets = (await getOutlets()).filter((o) => o.profile.published);
    outlets = liveOutlets.map((o) => ({
      id: o.id,
      name: o.name,
      city: o.city,
      openHours: o.openHours.split("· ")[1] ?? o.openHours,
      deposit: o.deposit,
      bookingWindowDays: o.bookingWindowDays ?? 0,
    }));
    const perOutletPackages = await Promise.all(liveOutlets.map((o) => getPackagesForOutlet(o.id)));
    packages = perOutletPackages.flat().filter((p) => p.status === "ACTIVE").map((p) => ({
      id: p.id,
      outletId: p.outletId,
      name: p.name,
      durationMin: p.durationMin,
      listPrice: p.listPrice,
      memberPrice: p.memberPrice,
      requiredSkill: p.requiredSkill,
    }));
    const perOutletTherapists = await Promise.all(liveOutlets.map((o) => getTherapistsForOutlet(o.id)));
    therapists = perOutletTherapists.flat().map((t) => ({
      id: t.id,
      outletId: t.outletId,
      name: t.name,
      grade: t.therapistGrade,
      skills: t.skills,
      photoUrl: t.photoUrl,
      featured: t.featured,
      featuredBadge: t.featuredBadge,
      bio: t.bio,
      galleryUrls: t.galleryUrls,
    }));
    today = await getEffectiveToday();

    // Rule (2026-08-23, user report "ayu masih bisa dibooking padahal
    // libur"): employee_schedule_exceptions was only ever read by the
    // manager/kasir "Cek Jadwal Terapis" page — nothing in the booking
    // flow itself checked it. A customer session can't read that table
    // via ordinary RLS at all (schedule_exceptions_read resolves the
    // tenant through app_users, which a customer session has no row in —
    // see lib/data/scheduleExceptions.ts's header), so this goes through
    // the admin-backed read there, same boundary-crossing reason as the
    // same-day conflict check below. Only fetched for TODAY: the visual
    // filter here is a convenience for the by-far-most-common case
    // (managers mark today's roster each morning per
    // components/ScheduleCheckBoard.tsx's "Rutinitas harian" note); a
    // therapist pre-marked off for a FUTURE date won't be visually
    // filtered out here, but createCustomerBooking() below still refuses
    // the booking authoritatively for any date, not just today.
    unavailableTherapistIds = [...(await getUnavailableTherapistIdsForCustomer(liveOutlets.map((o) => o.id), today))];

    upcomingBookings = (await getBookingsForCustomer(me.id))
      .filter((b) => b.date >= today && ["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN"].includes(b.status))
      .sort((a, b) => a.date.localeCompare(b.date) || a.scheduledStart.localeCompare(b.scheduledStart));
  } else {
    outlets = MOCK_OUTLETS.map((o) => ({
      id: o.id,
      name: o.name,
      city: o.city,
      openHours: o.openHours.split("· ")[1] ?? o.openHours,
      deposit: o.deposit,
      bookingWindowDays: o.bookingWindowDays ?? 0,
    }));
    packages = MOCK_OUTLETS.flatMap((o) =>
      packagesOf(o.id)
        .filter((p) => p.status === "ACTIVE")
        .map((p) => ({ id: p.id, outletId: p.outletId, name: p.name, durationMin: p.durationMin, listPrice: p.listPrice, memberPrice: p.memberPrice, requiredSkill: p.requiredSkill }))
    );
    therapists = MOCK_OUTLETS.flatMap((o) =>
      therapistsOf(o.id).map((t) => ({ id: t.id, outletId: t.outletId, name: t.name, grade: t.therapistGrade, skills: t.skills, photoUrl: t.photoUrl, featured: t.featured, featuredBadge: t.featuredBadge, bio: t.bio }))
    );
    today = MOCK_TODAY;
  }

  return (
    <MobileShell role="customer" title="Booking" subtitle="Lengkapi langkah untuk memesan layanan" avatarName={me.name} avatarTone={me.avatarTone}>
      {upcomingBookings.length > 0 && (
        <div className="stack g2" style={{ marginBottom: 16 }}>
          <div className="m-section">Booking Anda yang Akan Datang</div>
          {upcomingBookings.map((b) => (
            <div key={b.id} className="m-card m-card-tight">
              <div className="row between" style={{ marginBottom: 6 }}>
                <span className="small bold" style={{ color: "var(--text-1)" }}>{b.packageName}</span>
                <Badge tone="info">{b.status.replace(/_/g, " ")}</Badge>
              </div>
              <div className="tiny dim">
                <Icon name="calendar-days" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
                {fmtDateShort(b.date)} · {fmtTime(b.scheduledStart)} · {b.therapistName || "—"}
              </div>
            </div>
          ))}
          <div className="tiny dim">Mau ubah atau batalkan? Lihat di Profil → Riwayat Booking.</div>
        </div>
      )}
      <div className="m-section">Buat Booking Baru</div>
      <CustomerBookingForm
        outlets={outlets}
        packages={packages}
        therapists={therapists}
        isMember={me.membership !== "None"}
        today={today}
        initialOutletId={sp.outlet}
        unavailableTherapistIds={unavailableTherapistIds}
      />
      {!live && (
        <div className="tiny dim" style={{ textAlign: "center", marginTop: 16 }}>
          Pratinjau mode demo — masuk dengan akun customer untuk booking sungguhan.
        </div>
      )}
    </MobileShell>
  );
}
