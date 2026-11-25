import { describe, expect, it } from "vitest";
import type { DeliveryToVerify, PaymentsOverview } from "@/lib/supplier-payments";
import { supplierRoutes } from "./supplier-routes";
import { MockError, type MockRoute } from "./types";

function call(method: MockRoute["method"], path: string, body?: unknown) {
  const parts = path.split("/");
  for (const route of supplierRoutes) {
    const pattern = route.path.split("/");
    if (route.method !== method || pattern.length !== parts.length) continue;
    if (!pattern.every((seg, i) => seg.startsWith(":") || seg === parts[i])) continue;
    const params = Object.fromEntries(
      pattern.flatMap((seg, i) => (seg.startsWith(":") ? [[seg.slice(1), parts[i]]] : [])),
    );
    return route.respond({ params, query: new URLSearchParams(), body });
  }
  throw new Error(`no mock for ${method} ${path}`);
}
const status = (fn: () => unknown) => {
  try {
    fn();
    return 200;
  } catch (e) {
    if (e instanceof MockError) return e.status;
    throw e;
  }
};
const overview = () =>
  call("GET", "/projects/demo-greenfield/supplier-payments") as PaymentsOverview;

describe("supplier payments", () => {
  it("shows nothing to the contractor or the engineer", () => {
    for (const project of ["demo-lakeview", "demo-hillside"]) {
      expect(status(() => call("GET", `/projects/${project}/supplier-payments`))).toBe(403);
    }
    expect(status(() => call("GET", "/projects/demo-lakeview/deliveries-to-verify"))).toBe(403);
  });

  it("lets the engineer verify a delivery once, with a note, learning nothing about money", () => {
    const list = call("GET", "/projects/demo-hillside/deliveries-to-verify") as DeliveryToVerify[];
    expect(list.length).toBeGreaterThan(0);
    expect(JSON.stringify(list)).not.toMatch(/paise/i);
    const path = `/projects/demo-hillside/deliveries/${list[0].deliveryId}/verify`;
    expect(status(() => call("POST", path, { note: " " }))).toBe(400);
    expect(call("POST", path, { note: "All bags counted" })).toEqual({ ok: true });
    expect(status(() => call("POST", path, { note: "Again" }))).toBe(409);
  });

  it("pays a held bill only when allowed, once, and takes it off the order", () => {
    const held = overview().payments.find((p) => p.status === "pending" && p.amountPaise === 0);
    expect(held).toBeDefined();
    const decide = (approve: boolean) =>
      call("POST", `/supplier-payments/${held?.id}/decision`, { approve, note: "Checked" });
    // The seeded blocked bill is from the supplier the owner has not approved.
    expect(status(() => decide(true))).toBe(409);
    expect(status(() => decide(false))).toBe(200);
    expect(status(() => decide(false))).toBe(409);
  });

  it("holds payments for a changed bank account, even after approval, for the cooldown", () => {
    const s = overview().suppliers[0];
    expect(
      status(() => call("POST", `/suppliers/${s.id}/bank-change/approve`, { note: "x" })),
    ).toBe(409);
    call("POST", `/suppliers/${s.id}/bank-change`, { account: "123456789012", note: "New bank" });
    call("POST", `/suppliers/${s.id}/bank-change/approve`, { note: "Called them to confirm" });
    const after = overview().suppliers[0];
    expect(after.accountLast4).toBe(s.accountLast4);
    expect(Date.parse(after.bankChange?.effectiveAt ?? "")).toBeGreaterThan(Date.now());
  });
});
