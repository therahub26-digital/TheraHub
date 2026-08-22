import MobileShell from "@/components/MobileShell";
import CustomerBookingForm, { type OutletOption, type PackageOption, type TherapistOption } from "@/components/CustomerBookingForm";
import { getCurrentCustomer } from "@/lib/data/customers";
import { getOutlets } from "@/lib/data/outlets";
import { getPackagesForOutlet } from "@/lib/data/catalog";
import { getTherapistsForOutlet } from "@/lib/data/employees";
import { getEffectiveToday } from "@/lib/data/bookings";
import { ME_CUSTOMER, OUTLETS as MOCK_OUTLETS, packagesOf, therapistsOf, TODAY as MOCK_TODAY } from "@/lib/mock";

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
      <CustomerBookingForm outlets={outlets} packages={packages} therapists={therapists} isMember={me.membership !== "None"} today={today} initialOutletId={sp.outlet} />
      {!live && (
        <div className="tiny dim" style={{ textAlign: "center", marginTop: 16 }}>
          Pratinjau mode demo — masuk dengan akun customer untuk booking sungguhan.
        </div>
      )}
    </MobileShell>
  );
}
