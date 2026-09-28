"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BarChart3, FileDown, Images, LayoutDashboard, MapPin } from "lucide-react";

const ITEMS = [
  { href: "/trafego", label: "Visão geral", icon: LayoutDashboard },
  { href: "/trafego/campanhas", label: "Campanhas", icon: BarChart3 },
  { href: "/trafego/criativos", label: "Criativos", icon: Images },
  { href: "/trafego/unidades", label: "Unidades", icon: MapPin },
  { href: "/trafego/relatorios", label: "Relatórios", icon: FileDown },
];

// Navegação inferior fixa, estilo app — existe só dentro de /trafego.
// Mantém cliente (?c) e período (?p/de/ate) ao trocar de aba.
export function BottomNav() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of ["c", "p", "de", "ate"]) {
    const v = sp.get(k);
    if (v) keep.set(k, v);
  }
  const qs = keep.toString() ? `?${keep}` : "";

  return (
    <nav
      aria-label="Navegação do painel de tráfego"
      className="t-noprint fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      style={{ borderColor: "var(--t-border)", background: "rgba(7,7,10,0.88)" }}
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/trafego" ? pathname === "/trafego" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={`${href}${qs}`}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center gap-1 px-1 py-2.5 text-[10.5px] font-semibold tracking-wide transition-colors sm:text-xs"
                style={{ color: active ? "var(--t-gold-light)" : "var(--t-muted)" }}
              >
                <span
                  className="grid h-8 w-8 place-items-center rounded-xl transition-all"
                  style={active ? { background: "rgba(212,175,55,0.14)", boxShadow: "var(--t-glow)" } : undefined}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
