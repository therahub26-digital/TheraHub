import type { ReactNode } from "react";
import { InfoNote } from "@/components/ui";

// ---------------------------------------------------------------------
// A visible marker for pages whose numbers are written in lib/mock, not
// read from the database.
//
// Why this exists: an audit of ~70 pages (2026-08-23) found that the mock
// pages are visually indistinguishable from the live ones — same cards,
// same typography, same rupiah formatting. /manager/reports invents a
// Revenue and an Operating Profit and does not even follow the outlet you
// are signed in as; /kasir/closing invents an expected cash figure that a
// kasir could reconcile a real drawer against. Nothing on screen said so.
//
// Migrating those pages to real data is the actual fix (backlog Bagian 5)
// and is a much larger job. Until then, the honest thing is to say it out
// loud in the one place the wrong conclusion gets drawn: on the page.
//
// Deliberately loud (warning tone, top of page, before any figure) rather
// than a footnote — a caveat under the fold is a caveat nobody reads.
// ---------------------------------------------------------------------

export default function MockDataNotice({
  title = "Data contoh — bukan data outlet Anda",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div style={{ marginBottom: "var(--s-4)" }}>
      <InfoNote tone="warning" icon="alert-triangle" title={title}>
        {children ?? (
          <>
            Angka di halaman ini ditulis tetap di kode sebagai contoh tampilan — bukan hasil
            perhitungan dari database, dan tidak mengikuti outlet yang sedang Anda gunakan.
            Jangan dipakai sebagai dasar keputusan.
          </>
        )}
      </InfoNote>
    </div>
  );
}
