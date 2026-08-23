import { redirect } from "next/navigation";

// UPDATE 2026-08-23 — /therapist/jobs merged into /therapist/shift (now
// titled "Jadwal & Job") per user request, so this route just redirects
// there instead of disappearing outright (in case anything still links
// or was bookmarked to /therapist/jobs). See app/therapist/shift/page.tsx
// for the merged page and lib/nav.ts for the updated single nav entry.
export default function JobsPageRedirect() {
  redirect("/therapist/shift");
}
