"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const NAV = [
  {
    id: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    svg: (
      <>
        <path d="M3 7l9-4 9 4-9 4-9-4z" fill="currentColor" />
        <path d="M3 12l9 4 9-4M3 17l9 4 9-4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none" />
      </>
    ),
  },
  {
    id: "assets",
    href: "/assets",
    label: "Assets",
    svg: (
      <>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M3.3 7L12 12l8.7-5M12 22V12" stroke="currentColor" strokeWidth="2" fill="none" />
      </>
    ),
  },
  {
    id: "assignments",
    href: "/assignments",
    label: "Assignments",
    svg: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>
    ),
  },
  {
    id: "reports",
    href: "/reports",
    label: "Reports",
    svg: (
      <>
        <path d="M3 3v18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        <rect x="7" y="12" width="3" height="6" rx="1" fill="currentColor" />
        <rect x="12" y="8" width="3" height="10" rx="1" fill="currentColor" />
        <rect x="17" y="5" width="3" height="13" rx="1" fill="currentColor" />
      </>
    ),
  },
  {
    id: "employees",
    href: "/employees",
    label: "Employees",
    svg: (
      <>
        <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M3 20a6 6 0 0 1 12 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="17" cy="10" r="2.5" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M16 20a4 4 0 0 1 5-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      </>
    ),
  },
  {
    id: "turnover",
    href: "/turnover",
    label: "Turnover",
    svg: (
      <>
        <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M2 20a6 6 0 0 1 10-4.47" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M16 11l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M20 15h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      </>
    ),
  },
  {
    id: "sites",
    href: "/sites",
    label: "Sites",
    svg: (
      <>
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" stroke="currentColor" strokeWidth="2" fill="none" />
        <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
      </>
    ),
  },
  {
    id: "settings",
    href: "/settings",
    label: "Settings",
    svg: (
      <>
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" stroke="currentColor" strokeWidth="2" fill="none" />
      </>
    ),
  },
];

function NavItem({ n, active }: { n: (typeof NAV)[0]; active: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Link href={n.href} aria-label={n.label} aria-current={active ? "page" : undefined} className={`sb-item ${active ? "active" : ""}`} />}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">{n.svg}</svg>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {n.label}
      </TooltipContent>
    </Tooltip>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const activeId = NAV.find((n) => pathname.startsWith(n.href))?.id ?? "dashboard";

  const topNav = NAV.slice(0, 4);
  const bottomNav = NAV.slice(4);

  return (
    <aside className="sb" aria-label="Primary navigation" style={{ margin: "12px 0 12px 12px" }}>
      {/* Logo */}
      <div className="sb-logo" style={{ background: "transparent", padding: 2 }}>
        <Image src="/oracle-logo.png" alt="Oracle" width={32} height={32} style={{ objectFit: "contain", display: "block" }} priority />
      </div>

      {topNav.map((n) => (
        <NavItem key={n.id} n={n} active={n.id === activeId} />
      ))}

      <div className="sb-sep" />

      {bottomNav.map((n) => (
        <NavItem key={n.id} n={n} active={n.id === activeId} />
      ))}

      {/* User avatar */}
      <Avatar className="mt-auto cursor-pointer" style={{ width: 32, height: 32 }}>
        <AvatarFallback style={{ background: "#252829", color: "#6B7280", fontSize: 11, fontWeight: 800 }}>
          SJ
        </AvatarFallback>
      </Avatar>
    </aside>
  );
}
