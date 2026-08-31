import { redirect } from "next/navigation";

// ---------------------------------------------------------------------
// 2026-08-31 — halaman ini DIHAPUS, backlog 5.1 ("pertimbangkan hapus,
// sudah ada jalur asli di /kasir/pos").
//
// Dulunya layar contoh 100% mock: nominal tidak mengikuti transaksi mana
// pun dan kode QR di layar bukan QR pembayaran asli. Bahaya nyatanya
// bukan sekadar "halaman mati" — ini layar PEMBAYARAN di portal kasir.
// Kasir baru yang belum hafal aplikasi bisa menyuruh tamu memindai QR
// palsu itu, dan bannernya baru terbaca setelah kejadian. Pembayaran
// sungguhan sejak awal diproses di /kasir/pos (POS Cart) atau lewat
// tombol Bayar di Session Monitor.
//
// Dibuat redirect, bukan dihapus filenya, supaya bookmark lama dan
// ingatan jari kasir yang terlanjur mengetik /kasir/payment mendarat di
// jalur yang benar — bukan di halaman 404.
// ---------------------------------------------------------------------

export default function PaymentPage() {
  redirect("/kasir/pos");
}
