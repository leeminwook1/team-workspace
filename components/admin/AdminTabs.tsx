"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <div
      style={{
        display: "flex", gap: 6, borderBottom: "1px solid var(--line)",
        marginBottom: 4, overflowX: "auto",
      }}
    >
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              padding: "10px 14px", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap",
              color: active ? "var(--primary)" : "var(--ink-soft)",
              borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
