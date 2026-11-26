"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Other people change the same project from their own screens, and two windows side by
          // side never fire a visibility change, so re-check every 10 s while the tab is visible.
          queries: { staleTime: 5_000, refetchInterval: 10_000, retry: 1 },
        },
      }),
  );
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      // The theme script only matters in the server HTML, before first paint. On the client React
      // warns about any executable script it renders, so mark it as data there.
      scriptProps={{ type: typeof window === "undefined" ? "text/javascript" : "application/json" }}
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster richColors position="top-center" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
