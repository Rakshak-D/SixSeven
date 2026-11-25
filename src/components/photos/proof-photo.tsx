"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";
import { mocksEnabled } from "@/mocks";

/** A stored photo. If it cannot load (demo data has no image files), say so instead of a broken icon. */
export function ProofPhoto({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-secondary">
      {failed ? (
        <ImageOff
          role="img"
          aria-label={mocksEnabled ? "Demo photo, no image file" : "Photo not available"}
          className="size-6 text-muted-foreground"
        />
      ) : (
        // biome-ignore lint/performance/noImgElement: protected same-origin photo, sized by the box
        <img
          src={url}
          alt={alt}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
