import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Called from middleware.ts on every request. Refreshes the Supabase auth
// session (rotates the access token via the refresh token in cookies)
// before the request reaches a Server Component — Server Components can't
// write cookies themselves, so without this, sessions would silently expire.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not run any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to
  // debug users being randomly logged out.
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;

  // ⚠️ 2026-08-31 — `error` DULU DIBUANG di sini, dan itu bug yang nyata.
  //
  // Pemanggil (middleware.ts) hanya melihat `user`. Jadi kalau panggilan
  // ini GAGAL KARENA JARINGAN, `user` kosong, dan middleware menyimpulkan
  // orangnya belum login lalu melemparnya ke /login — padahal dia baru
  // saja berhasil login dan cookie-nya ada.
  //
  // Adjie melaporkannya dari lapangan: terapis di outlet bersinyal jelek
  // login berhasil, lalu dilempar balik ke halaman login, berulang-ulang,
  // tidak pernah sampai ke beranda. Dulu tercatat sebagai item 7.12
  // "kedipan sesaat, tidak memblokir". Di sinyal jelek ia memblokir total.
  //
  // Akar masalahnya adalah menyamakan dua hal yang berbeda: "server auth
  // bilang sesi ini tidak sah" dan "kami tidak berhasil menghubungi server
  // auth". Yang pertama artinya usir; yang kedua artinya kita tidak tahu.
  //
  // Cara membedakannya: kegagalan auth sungguhan datang dengan status HTTP
  // (401/403). Kegagalan jaringan datang tanpa status, atau sebagai
  // AuthRetryableFetchError.
  const authUnreachable =
    !!error && (error.status === undefined || error.status === 0 || error.name === "AuthRetryableFetchError");

  return { supabaseResponse, user, supabase, authUnreachable };

}
