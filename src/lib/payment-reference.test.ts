import { describe, expect, it } from "vitest";
import { referenceProblem } from "./payment-reference";

describe("referenceProblem", () => {
  it("needs a note for cash and ignores any reference", () => {
    expect(referenceProblem("cash", "123456789012", " ")).toBeDefined();
    expect(referenceProblem("cash", "", "Given to Ravi at the gate")).toBeUndefined();
  });
  it("needs exactly 12 digits for UPI", () => {
    expect(referenceProblem("upi", "", "a note is not a reference")).toBeDefined();
    expect(referenceProblem("upi", "12345678901", "")).toBeDefined();
    expect(referenceProblem("upi", " 123456789012 ", "")).toBeUndefined();
  });
  it("needs 6 to 22 letters or digits for bank", () => {
    expect(referenceProblem("bank", "AB12", "")).toBeDefined();
    expect(referenceProblem("bank", "HDFC-0001234", "")).toBeDefined();
    expect(referenceProblem("bank", "HDFCN52026112600", "")).toBeUndefined();
  });
});
