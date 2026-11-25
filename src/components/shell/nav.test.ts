import { describe, expect, it } from "vitest";
import { formatIsoDate, formatPaise, formatPaiseShort } from "@/lib/format";
import { demoProjects } from "@/mocks/projects";
import { Role } from "@/shared/schemas/common";
import { activeTabIndex, roleNav, tabHref } from "./nav";

describe("role navigation", () => {
  it("gives every role four tabs and a centre action", () => {
    for (const role of Role.options) {
      expect(roleNav[role].tabs).toHaveLength(4);
      expect(roleNav[role].action.label).toBeTruthy();
    }
  });

  it("matches the settled split", () => {
    const labels = (role: Role) => roleNav[role].tabs.map((t) => t.label);
    expect(labels("owner")).toEqual(["Home", "Logs", "Site", "Money"]);
    expect(labels("contractor")).toEqual(["Today", "Stock", "Site", "Wages"]);
    expect(labels("engineer")).toEqual(["Home", "Logs", "Site", "Stock"]);
    expect(roleNav.owner.action.kind).toBe("approvals");
    expect(roleNav.contractor.action.kind).toBe("log");
    expect(roleNav.engineer.action.kind).toBe("review");
  });

  it("builds hrefs and finds the active tab", () => {
    const tabs = roleNav.owner.tabs;
    expect(tabHref("p1", tabs[0])).toBe("/projects/p1");
    expect(tabHref("p1", tabs[1])).toBe("/projects/p1/logs");
    expect(activeTabIndex("/projects/p1", "p1", tabs)).toBe(0);
    expect(activeTabIndex("/projects/p1/", "p1", tabs)).toBe(0);
    expect(activeTabIndex("/projects/p1/logs", "p1", tabs)).toBe(1);
    expect(activeTabIndex("/projects/p1/money/week", "p1", tabs)).toBe(3);
    expect(activeTabIndex("/projects/p1/wages", "p1", tabs)).toBe(-1);
    expect(activeTabIndex("/projects/p10/logs", "p1", tabs)).toBe(-1);
    expect(activeTabIndex("/projects", "p1", tabs)).toBe(-1);
  });
});

describe("demo projects", () => {
  it("cover each role once", () => {
    expect(demoProjects.map((p) => p.role).sort()).toEqual(["contractor", "engineer", "owner"]);
  });
});

describe("formatting", () => {
  it("formats money in Indian units", () => {
    expect(formatPaise(223_145_000)).toBe("₹22,31,450");
    expect(formatPaise(-30_000)).toBe("−₹300");
    expect(formatPaiseShort(400_000_000)).toBe("₹40 L");
    expect(formatPaiseShort(223_145_000)).toBe("₹22.3 L");
    expect(formatPaiseShort(4_500_000_000)).toBe("₹4.5 Cr");
    expect(formatPaiseShort(1_840_000)).toBe("₹18,400");
  });

  it("formats API dates without time-zone drift", () => {
    expect(formatIsoDate("2026-08-18")).toBe("18 Aug 2026");
  });
});
