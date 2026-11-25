"use client";

import { Camera, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { MaxPhotoBytes, PhotoMime } from "@/shared/schemas/progress";

const MAX_PHOTOS = 10;

/** The first reason these files can't be sent, in plain words, or undefined when they are fine. */
export function photoProblem(files: File[]): string | undefined {
  if (files.length === 0) return "Add at least one photo.";
  if (files.length > MAX_PHOTOS) return `Add at most ${MAX_PHOTOS} photos.`;
  const wrongType = files.find((f) => !(PhotoMime.options as readonly string[]).includes(f.type));
  if (wrongType) return `${wrongType.name} isn't a JPEG, PNG or WebP photo.`;
  const tooBig = files.find((f) => f.size > MaxPhotoBytes);
  if (tooBig) return `${tooBig.name} is over 5 MB. Take it again at a lower quality.`;
  return undefined;
}

/** Choose photos from the camera or gallery, see what is chosen, remove one. Parent owns the list. */
export function PhotoPicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        aria-label="Choose photos"
        onChange={(event) => {
          onChange([...files, ...Array.from(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <Button type="button" variant="outline" onClick={() => input.current?.click()}>
        <Camera aria-hidden="true" />
        {files.length ? "Add more photos" : "Take or choose photos"}
      </Button>
      {files.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}-${i}`}
              className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-secondary px-3"
            >
              <span className="min-w-0 truncate text-[15px]">
                {file.name} · {(file.size / 1_000_000).toFixed(1)} MB
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${file.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
