/**
 * Indonesian mobile numbers are stored in this app in whatever shape the
 * kasir typed them ("+62 812-0000-0001", "0812 0000 0001", …), but
 * wa.me only accepts bare international digits. Local "0…" numbers are
 * rewritten to "62…"; anything already starting with 62 is left alone.
 * Returns null when there is nothing dialable, so the caller can render
 * plain text instead of a dead link.
 *
 * Lived in components/BookingFollowUp.tsx until 2026-08-24. Moved here so
 * Server Components can use it too without importing from a "use client"
 * module — /manager/customers needed exactly this to turn its dead "WA"
 * button into a real chat link.
 */
export function waLink(phone: string): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("62")) return `https://wa.me/${digits}`;
  if (digits.startsWith("0")) return `https://wa.me/62${digits.slice(1)}`;
  return `https://wa.me/${digits}`;
}
