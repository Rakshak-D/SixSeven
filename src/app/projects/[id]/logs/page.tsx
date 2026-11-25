import { Suspense } from "react";
import { LogsPage } from "@/components/logs/logs-page";

export default function ProjectLogsPage() {
  // Logs reads the ?tab= from the URL.
  return (
    <Suspense fallback={null}>
      <LogsPage />
    </Suspense>
  );
}
