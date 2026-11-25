// Client-only: imported by the app shell.
import Link from "next/link";
import { type NavTab, type RoleNav, tabHref } from "./nav";

function DockTab({ tab, href, active }: { tab: NavTab; href: string; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="group flex h-14 w-16 flex-col items-center justify-center gap-0.5 rounded-2xl font-semibold text-muted-foreground text-xs transition-colors duration-(--duration-mid) ease-slate aria-[current=page]:text-foreground"
    >
      <Icon aria-hidden="true" className="size-[22px]" />
      {tab.label}
      <span
        aria-hidden="true"
        className="size-1 scale-0 rounded-full bg-primary transition-transform duration-(--duration-mid) ease-slate group-aria-[current=page]:scale-100"
      />
    </Link>
  );
}

/** Phone and tablet navigation: a floating dock above the bottom edge, with the role's action in the centre. */
export function Dock({
  projectId,
  nav,
  activeIndex,
  onAction,
}: {
  projectId: string;
  nav: RoleNav;
  activeIndex: number;
  onAction: () => void;
}) {
  const ActionIcon = nav.action.icon;
  const [a, b, c, d] = nav.tabs;
  const tab = (t: NavTab, i: number) => (
    <DockTab key={t.label} tab={t} href={tabHref(projectId, t)} active={i === activeIndex} />
  );
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 mx-auto flex h-18 max-w-md animate-dock items-center justify-between rounded-full border border-line-strong bg-card px-2.5 shadow-float lg:hidden"
    >
      {tab(a, 0)}
      {tab(b, 1)}
      <button
        type="button"
        onClick={onAction}
        aria-haspopup="dialog"
        aria-label={nav.action.label}
        className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-(--duration-fast) ease-slate active:scale-90"
      >
        <ActionIcon aria-hidden="true" className="size-6.5" />
      </button>
      {tab(c, 2)}
      {tab(d, 3)}
    </nav>
  );
}
