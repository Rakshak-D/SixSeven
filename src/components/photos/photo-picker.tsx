"use client";

import { Camera, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MaxPhotoBytes, PhotoMime } from "@/shared/schemas/progress";
import { CameraView } from "./camera-view";

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

/** A small preview of a captured photo, so a blurred one can be removed and retaken. */
function Thumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);
  return url ? (
    // biome-ignore lint/performance/noImgElement: a local blob, sized by the box
    <img src={url} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
  ) : null;
}

/** Take photos with the live camera, see them, remove one. Parent owns the list. */
export function PhotoPicker({
  files,
  onChange,
  max = MAX_PHOTOS,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const full = files.length >= max;
  return (
    <div>
      {open ? (
        <CameraView
          full={full}
          onCapture={(photo) => onChange([...files, photo])}
          onClose={() => setOpen(false)}
        />
      ) : (
        <Button type="button" variant="outline" disabled={full} onClick={() => setOpen(true)}>
          <Camera aria-hidden="true" />
          {files.length ? "Take another photo" : "Take photo"}
        </Button>
      )}
      <p className="mt-2 text-[14px] text-muted-foreground">
        Photos are taken now, with the camera. The gallery cannot be used.
      </p>
      {files.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${file.size}-${i}`}
              className="flex min-h-14 items-center gap-3 rounded-xl bg-secondary px-3"
            >
              <Thumbnail file={file} />
              <span className="min-w-0 flex-1 truncate text-[15px]">
                Photo {i + 1} · {(file.size / 1_000_000).toFixed(1)} MB
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove photo ${i + 1}`}
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
