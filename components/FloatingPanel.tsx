"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

// ---------------------------------------------------------------------
// Shared floating edit panel — extracted 2026-08-24 out of
// components/RoomEditor.tsx while fixing a bug reported the same day:
// "Edit" on a room card appeared to do nothing.
//
// Root cause: every card these editors open from is a `.card`, and
// `.card` is `overflow: hidden` (app/ui.css, needed for its
// rounded-corner top highlight). The old pattern rendered the edit
// panel as a plain `position: absolute` sibling of the trigger button
// — an ancestor `.card` clips that immediately, so the panel WAS
// opening, just invisible, clipped to a sliver inside the card's own
// boundary.
//
// Fix: portal the panel to document.body with `position: fixed`,
// positioned from the trigger's own getBoundingClientRect(). That
// escapes clipping from any ancestor regardless of which grid
// column/row the trigger sits in. Any editor that opens a dropdown-style
// panel from inside a `.card` (RoomEditor, OutletEditor, and — if this
// pattern is reused later — StaffEditor/InventoryEditor/CommissionEditor)
// should use this instead of hand-rolling `position: absolute`.
// ---------------------------------------------------------------------

const PANEL_WIDTH = 320;
const PANEL_MARGIN = 8;

export function FloatingPanel({
  anchorRef,
  onClose,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const left = Math.min(
        Math.max(r.right - PANEL_WIDTH, PANEL_MARGIN),
        window.innerWidth - PANEL_WIDTH - PANEL_MARGIN
      );
      setPos({ top: r.bottom + 6, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flip above the trigger if the panel's actual measured height would
  // run past the bottom of the viewport (e.g. the last row of a long grid).
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel || !pos) return;
    const anchorRect = anchor.getBoundingClientRect();
    const panelHeight = panel.getBoundingClientRect().height;
    if (anchorRect.bottom + panelHeight + 6 > window.innerHeight) {
      const flipped = Math.max(PANEL_MARGIN, anchorRect.top - panelHeight - 6);
      if (Math.abs(flipped - pos.top) > 1) setPos((p) => (p ? { ...p, top: flipped } : p));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos?.left, pos?.top]);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [anchorRef, onClose]);

  if (!pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      className="stack g2"
      style={{
        position: "fixed", top: pos.top, left: pos.left, zIndex: 1000,
        padding: "14px 16px", borderRadius: "var(--r-md)",
        background: "var(--bg-panel, var(--bg-deep))", border: "1px solid var(--border)",
        minWidth: PANEL_WIDTH, maxWidth: PANEL_WIDTH, maxHeight: "70vh", overflowY: "auto",
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)", textAlign: "left",
      }}
    >
      {children}
    </div>,
    document.body
  );
}
