import type { ReactNode } from "react";

export type IconName =
  | "calendar" | "resources" | "admin" | "logout" | "plus" | "chevronL" | "chevronR"
  | "check" | "clock" | "mapPin" | "userLine";

const PATHS: Record<IconName, ReactNode> = {
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="3.5" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </>
  ),
  resources: (
    <>
      <path d="M12 2.8l8.2 4.6v9.2L12 21.2 3.8 16.6V7.4L12 2.8z" />
      <path d="M3.8 7.4 12 12l8.2-4.6M12 12v9.2" />
    </>
  ),
  admin: (
    <>
      <path d="M5 7h8M19 7h0M5 12h0M11 12h8M5 17h8M19 17h0" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="8" cy="12" r="2.2" />
      <circle cx="16" cy="17" r="2.2" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H6a2.5 2.5 0 0 1-2.5-2.5v-13A2.5 2.5 0 0 1 6 3h3" />
      <path d="M16 16.5 20.5 12 16 7.5M20.5 12H9.5" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  chevronL: <path d="M15 5l-7 7 7 7" />,
  chevronR: <path d="M9 5l7 7-7 7" />,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.4 2" />
    </>
  ),
  mapPin: (
    <>
      <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  userLine: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
};

export function Icon({ name, size = 22, strokeWidth = 1.8 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flex: "none" }}
    >
      {PATHS[name]}
    </svg>
  );
}
