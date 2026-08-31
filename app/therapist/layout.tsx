import type { Metadata } from "next";
import PwaRegister from "@/components/PwaRegister";
import InstallAppPrompt from "@/components/InstallAppPrompt";

// ---------------------------------------------------------------------
// Layout portal terapis — dibuat 2026-08-31, dan alasannya bukan teknis.
//
// Adjie: "aplikasi ini adalah aplikasi harian terapis yang digunakan
// sehari-hari, dan kalau web seringkali tidak praktis karena seringkali
// bertumpuk banyak jendela."
//
// Itu keluhan ergonomi, bukan keluhan performa — dan jawabannya ternyata
// sudah ada di repo ini sejak 2026-08-22, cuma tidak pernah disambungkan
// ke portal yang paling membutuhkannya. `manifest.json`, service worker,
// dan ikon 192/512/maskable semuanya dibuat untuk portal CUSTOMER;
// portal terapis bahkan tidak punya layout.tsx sama sekali, jadi terapis
// memang tidak punya cara memasang aplikasinya ke layar utama.
//
// Dipasang sebagai PWA, portal ini mendapat: ikon sendiri di layar utama,
// JENDELA SENDIRI tanpa address bar dan tanpa tab (`display: standalone`),
// dan entri sendiri di app switcher. Bagi terapis yang memakainya setiap
// hari, itu persis perbedaan antara "salah satu tab yang tenggelam" dan
// "aplikasi yang dibuka".
//
// `scope` sengaja "/" bukan "/therapist": kalau sesi habis, aplikasi
// mengalihkan ke /login — dan URL di luar scope akan dibuka Chrome di tab
// browser biasa, yang justru mematahkan seluruh gunanya.
//
// Manifest terpisah dari milik customer karena `start_url` harus berbeda:
// satu file manifest hanya bisa punya satu titik masuk.
// ---------------------------------------------------------------------

export const metadata: Metadata = {
  manifest: "/manifest-therapist.json",
  title: "TheraHub Terapis",
  appleWebApp: { capable: true, title: "Terapis", statusBarStyle: "black-translucent" },
};

export default function TherapistLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PwaRegister />
      <InstallAppPrompt />
      {children}
    </>
  );
}
