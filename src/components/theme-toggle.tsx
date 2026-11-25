"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";

const noopSubscribe = () => () => {};

/** Light/dark switch. The choice is remembered by next-themes; until one is made, the system setting wins. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is only known in the browser, so the server render shows a neutral label.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const isDark = mounted && resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";

  function toggle() {
    const apply = () => flushSync(() => setTheme(next));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || typeof document.startViewTransition !== "function") {
      apply();
      return;
    }
    // A single crossfade of the whole page instead of every element animating its own colours.
    document.startViewTransition(apply);
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label={mounted ? `Switch to ${next} theme` : "Switch theme"}
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
