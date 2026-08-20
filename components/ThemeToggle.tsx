"use client";

import Icon from "./Icon";
import { useTheme } from "@/lib/theme";

/** Global light/dark appearance toggle — dropped into Shell, MobileShell, and the landing page. */
export default function ThemeToggle({
  className = "",
  size = 17,
  style,
}: {
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className={`btn btn-quiet btn-icon ${className}`}
      style={style}
      onClick={toggleTheme}
      aria-label={isDark ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
      title={isDark ? "Mode Terang" : "Mode Gelap"}
    >
      <Icon name={isDark ? "sun" : "moon"} size={size} />
    </button>
  );
}
