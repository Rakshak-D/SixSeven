import { describe, expect, it } from "vitest";
import type { PaymentsOverview } from "@/lib/supplier-payments";
import { supplierRoutes } from "./supplier-routes";

function call(method: string, pattern: string, id: string, body?: unknown) {
  const route = supplierRoutes.find((r) => r.method === method && r.path === pattern);
  if (!route) throw new Error(`no mock for ${method} ${pattern}`);
  return route.respond({ params: { id }, query: new URLSearchParams(), body });
}
const overview = () =>
  call("GET", "/projects/:id/supplier-payments", "demo-greenfield") as PaymentsOverview;

describe("a waiting bill", () => {
  it("becomes payable once its supplier and an order are approved, and still waits", () => {
    const bill = overview().payments.find((p) => p.status === "pending" && p.amountPaise === 0);
    const supplier = overview().suppliers.find((s) => s.name === bill?.supplierName);
    expect(supplier?.approved).toBe(false);
    call("POST", "/suppliers/:id/approve", supplier?.id ?? "", { note: "Checked GSTIN" });
    call("POST", "/projects/:id/orders", "demo-greenfield", {
      supplierId: supplier?.id,
      materialId: bill?.materialId,
      qty: 1000,
      maxUnitPricePaise: 10_000_000,
      note: "Standing order",
    });
    const now = overview().payments.find((p) => p.id === bill?.id);
    expect(now?.status).toBe("pending");
    expect(now?.amountPaise).toBeGreaterThan(0);
  });
});
