/**
 * Proof a wage payment must carry. UPI and bank need the transaction reference (the formats of
 * backend request 9). Cash has no reference, so it needs a note saying who got it and where.
 */
export const referenceRules = {
  upi: {
    label: "UPI transaction ID",
    hint: "12 digits, from the UPI app.",
    pattern: /^[0-9]{12}$/,
    problem: "Enter the 12-digit UPI transaction ID.",
  },
  bank: {
    label: "Bank reference (UTR)",
    hint: "6 to 22 letters or digits.",
    pattern: /^[A-Za-z0-9]{6,22}$/,
    problem: "Enter the bank reference: 6 to 22 letters or digits.",
  },
} as const;

export function referenceProblem(
  mode: "cash" | keyof typeof referenceRules,
  reference: string,
  cashNote: string,
): string | undefined {
  if (mode === "cash")
    return cashNote.trim() ? undefined : "Add a note: who got the cash, and where.";
  const rule = referenceRules[mode];
  return rule.pattern.test(reference.trim()) ? undefined : rule.problem;
}
