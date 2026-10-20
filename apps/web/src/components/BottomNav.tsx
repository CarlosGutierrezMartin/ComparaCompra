"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/i18n/es";

const TABS = [
  { href: "/lista", label: t.nav.lista, icon: "M4 6h16M4 12h16M4 18h10" },
  {
    href: "/platos",
    label: t.nav.platos,
    icon: "M4 13a8 8 0 0 0 16 0H4zM12 5v3M8 6l1 2M16 6l-1 2",
  },
  { href: "/menu", label: t.nav.menu, icon: "M5 4h14v16H5zM5 9h14M9 4v16" },
  { href: "/tienda", label: t.nav.tienda, icon: "M5 8h14l-1.5 11h-11zM9 8a3 3 0 0 1 6 0" },
  {
    href: "/perfil",
    label: t.nav.perfil,
    icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0",
  },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`tap flex flex-col items-center justify-center gap-0.5 py-2 text-xs ${
                  active ? "font-semibold text-brand" : "text-muted"
                }`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.4 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={tab.icon} />
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
