"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { Switch } from "@/components/ui";
import { setMarketingConsent } from "@/lib/actions/customers";

// ---------------------------------------------------------------------
// The one genuinely operable toggle on the customer Profile screen.
//
// Optimistic on purpose: a consent switch that visibly lags a beat
// behind the finger feels broken. On failure it snaps back to the value
// that is actually stored and says why, rather than leaving the guest
// believing they opted out when the write never landed.
// ---------------------------------------------------------------------

export default function MarketingConsentToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="stack g1" style={{ alignItems: "flex-end" }}>
      <Switch
        on={on}
        pending={isPending}
        label="Promo via WhatsApp"
        onChange={(next) => {
          const previous = on;
          setOn(next);
          setError(null);
          startTransition(async () => {
            const r = await setMarketingConsent(next);
            if (!r.ok) {
              setOn(previous);
              setError(r.error);
            }
          });
        }}
      />
      {error && (
        <span className="tiny" style={{ color: "var(--danger)" }}>
          <Icon name="alert-triangle" size={10} style={{ verticalAlign: "-1px", marginRight: 2 }} />
          {error}
        </span>
      )}
    </div>
  );
}
