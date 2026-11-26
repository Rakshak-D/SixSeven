"use client";

import { useMutation } from "@tanstack/react-query";
import { Field, FormError } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import {
  MaterialCalculationInput,
  MaterialCalculationResponse,
} from "@/shared/schemas/material-calculation";

export function ConcreteEstimate({ projectId }: { projectId: string }) {
  const estimate = useMutation({
    mutationFn: (form: FormData) => {
      const value = (key: string) => Number(form.get(key));
      const unit = form.get("unit");
      const body = MaterialCalculationInput.parse({
        dimensions: ["length", "width", "depth"].map((key) => ({ value: value(key), unit })),
        mixRatio: ["cement", "sand", "aggregate"].map(value),
        wasteMarginPercent: value("waste"),
      });
      return api("POST", `/projects/${encodeURIComponent(projectId)}/ai/calculate-materials`, {
        body,
        schema: MaterialCalculationResponse,
      });
    },
  });

  return (
    <details className="mb-4 rounded-2xl border p-3">
      <summary className="cursor-pointer font-medium">Estimate concrete quantities</summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!estimate.isPending) estimate.mutate(new FormData(event.currentTarget));
        }}
      >
        <Field label="Dimension unit">
          {(id) => (
            <select
              id={id}
              name="unit"
              className="block w-full rounded-xl border bg-background p-2"
            >
              <option value="m">Metres</option>
              <option value="cm">Centimetres</option>
              <option value="mm">Millimetres</option>
              <option value="ft">Feet</option>
              <option value="in">Inches</option>
            </select>
          )}
        </Field>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["length", "Length"],
            ["width", "Width"],
            ["depth", "Depth"],
          ].map(([name, label]) => (
            <Field key={name} label={label}>
              {(id) => <Input id={id} name={name} type="number" min="0.001" step="any" required />}
            </Field>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["cement", "Cement", 1],
            ["sand", "Sand", 2],
            ["aggregate", "Aggregate", 4],
          ].map(([name, label, initial]) => (
            <Field key={name} label={String(label)}>
              {(id) => (
                <Input
                  id={id}
                  name={String(name)}
                  type="number"
                  min="0.001"
                  max="100"
                  step="any"
                  defaultValue={initial}
                  required
                />
              )}
            </Field>
          ))}
        </div>
        <Field label="Wastage (%)">
          {(id) => (
            <Input
              id={id}
              name="waste"
              type="number"
              min="0"
              max="50"
              step="any"
              required
              defaultValue={5}
            />
          )}
        </Field>
        <Button type="submit" disabled={estimate.isPending}>
          Calculate estimate
        </Button>
        <FormError error={estimate.error} />
      </form>
      {estimate.data ? (
        <div className="mt-3 space-y-2" aria-live="polite">
          <p>{estimate.data.wetVolumeM3.toLocaleString()} m³ concrete</p>
          <p>
            {estimate.data.cementBags50Kg} cement bags (50 kg),{" "}
            {estimate.data.sandM3.toLocaleString()} m³ sand,{" "}
            {estimate.data.aggregateM3.toLocaleString()} m³ aggregate
          </p>
          <ul className="list-disc pl-4 text-sm text-muted-foreground">
            {estimate.data.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
  );
}
