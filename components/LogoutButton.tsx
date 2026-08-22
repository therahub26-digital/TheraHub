"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";

// Real sign-out for the customer portal — added 2026-08-22 alongside the
// rest of /customer/*'s migration to real data. The old mock version was
// a plain `<Link href="/">` (fine when there was no real session to end).
export default function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="m-btn m-btn-ghost"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const supabase = createClient();
          await supabase.auth.signOut();
          router.push("/");
          router.refresh();
        })
      }
    >
      <Icon name="log-out" size={15} /> {isPending ? "Keluar…" : "Keluar"}
    </button>
  );
}
