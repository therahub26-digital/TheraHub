import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { ROLE_HOME, roleForPath } from "@/lib/route-guard";

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user, supabase, authUnreachable } = await updateSession(request);

  const { pathname } = request.nextUrl;
  const requiredRole = roleForPath(pathname);

  // Not one of the seven role-portal sections (landing page, /login,
  // /api/*, etc.) — nothing to guard here, just the refreshed session.
  if (!requiredRole) return supabaseResponse;

  // Server auth tidak terjangkau (timeout/jaringan putus) — kita TIDAK TAHU
  // apakah orang ini login atau tidak, jadi jangan berpura-pura tahu.
  // Melemparnya ke /login adalah tebakan, dan tebakan yang salah persis
  // yang membuat terapis di sinyal jelek tidak pernah bisa masuk.
  //
  // Membiarkan permintaan lewat BUKAN lubang keamanan: penjaga rute ini
  // lapisan pengalaman-pakai, bukan batas keamanan. Batas yang sungguhan
  // adalah RLS di database — halaman yang dirender tanpa sesi sah tidak
  // akan mendapat satu baris pun. Yang terburuk terjadi adalah halaman
  // kosong; itu jauh lebih baik daripada mengusir orang yang sudah login.
  if (!user && authUnreachable) return supabaseResponse;

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Resolve which portal this signed-in identity actually belongs to.
  // Mirrors the lookup already done client-side in app/login/page.tsx
  // right after sign-in — RLS lets each user read only their own
  // app_users/customers row, so this is safe under the request's own
  // auth context (never the service-role key).
  let actualRole: string | null = null;

  const { data: staffRow } = await supabase
    .from("app_users")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (staffRow?.role) {
    actualRole = staffRow.role as string;
  } else {
    const { data: customerRow } = await supabase
      .from("customers")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (customerRow) actualRole = "customer";
  }

  if (actualRole === requiredRole) return supabaseResponse;

  // Signed in, but wrong portal (or an identity with no role/customer
  // link at all) — send them to their own home instead of letting the
  // page render under a role it doesn't belong to.
  const url = request.nextUrl.clone();
  url.pathname = actualRole ? ROLE_HOME[actualRole] : "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt
     * - image files (svg, png, jpg, jpeg, gif, webp)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
