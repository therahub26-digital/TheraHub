"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { setRoomMaintenance } from "@/lib/actions/rooms";

// Thin client wrapper around lib/actions/rooms.ts's setRoomMaintenance,
// same pending/error pattern as components/SessionActions.tsx. The rule
// (which statuses can flip, RLS scoping to this manager's own outlet)
// lives server-side in the action, not here.

export default function RoomMaintenanceButton({
  roomId,
  roomStatus,
  disabled,
}: {
  roomId: string;
  roomStatus: "ACTIVE" | "MAINTENANCE" | "INACTIVE";
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const underMaintenance = roomStatus === "MAINTENANCE";

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setRoomMaintenance(roomId, !underMaintenance);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div style={{ flex: 1 }}>
      <button
        className="btn btn-ghost btn-sm"
        style={{ width: "100%" }}
        onClick={toggle}
        disabled={disabled || isPending}
        title={disabled ? "Room nonaktif — tidak bisa diubah dari sini." : undefined}
      >
        <Icon name={isPending ? "refresh" : underMaintenance ? "check" : "wrench"} size={13} />
        {isPending ? "Menyimpan..." : underMaintenance ? "Aktifkan" : "Maintenance"}
      </button>
      {error && (
        <div className="tiny" style={{ color: "var(--danger)", marginTop: 4 }}>
          <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
          {error}
        </div>
      )}
    </div>
  );
}
