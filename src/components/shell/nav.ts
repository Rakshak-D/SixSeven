import {
  Banknote,
  CalendarCheck,
  CircleCheck,
  ClipboardCheck,
  HardHat,
  House,
  type LucideIcon,
  Package,
  Plus,
  ScrollText,
  Wallet,
} from "lucide-react";
import type { Role } from "@/shared/schemas/common";

export type NavTab = {
  label: string;
  /** Path segment under /projects/[id]; "" is the project's home. */
  segment: "" | "logs" | "site" | "money" | "stock" | "wages";
  icon: LucideIcon;
};

export type NavActionKind = "approvals" | "log" | "review";
export type NavAction = { kind: NavActionKind; label: string; icon: LucideIcon };

export type RoleNav = { tabs: readonly [NavTab, NavTab, NavTab, NavTab]; action: NavAction };

const home: NavTab = { label: "Home", segment: "", icon: House };
const today: NavTab = { label: "Today", segment: "", icon: CalendarCheck };
const logs: NavTab = { label: "Logs", segment: "logs", icon: ScrollText };
const site: NavTab = { label: "Site", segment: "site", icon: HardHat };
const money: NavTab = { label: "Money", segment: "money", icon: Wallet };
const stock: NavTab = { label: "Stock", segment: "stock", icon: Package };
const wages: NavTab = { label: "Wages", segment: "wages", icon: Banknote };

/** Settled with the frontend developer on 2026-11-25. The action is the role's centre button. */
export const roleNav: Record<Role, RoleNav> = {
  owner: {
    tabs: [home, logs, site, money],
    action: { kind: "approvals", label: "Approvals", icon: CircleCheck },
  },
  contractor: {
    tabs: [today, stock, site, wages],
    action: { kind: "log", label: "Log", icon: Plus },
  },
  engineer: {
    tabs: [home, logs, site, stock],
    action: { kind: "review", label: "Review", icon: ClipboardCheck },
  },
};

export function tabHref(projectId: string, tab: NavTab): string {
  const base = `/projects/${encodeURIComponent(projectId)}`;
  return tab.segment ? `${base}/${tab.segment}` : base;
}

/** Index of the tab the pathname belongs to, or -1 when it is none of them. */
export function activeTabIndex(pathname: string, projectId: string, tabs: readonly NavTab[]) {
  const base = `/projects/${encodeURIComponent(projectId)}`;
  const path = pathname.replace(/\/+$/, "");
  if (path !== base && !path.startsWith(`${base}/`)) return -1;
  const segment = path.slice(base.length).split("/")[1] ?? "";
  return tabs.findIndex((tab) => tab.segment === segment);
}
