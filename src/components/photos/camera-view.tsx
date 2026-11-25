"use client";

import { Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FormError } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { istDateOf } from "@/lib/dates";
import { formatIsoDate, formatTimeIst } from "@/lib/format";

/** Longest side of a saved photo. Keeps a JPEG well under the 5 MB limit. */
const MAX_SIDE = 1920;

function cameraProblem(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError")
    return "Camera access is blocked. Allow the camera for this site in your browser settings, then try again.";
  if (name === "NotFoundError") return "No camera found. Open Slate on a phone to add photos.";
  return "The camera could not start. Close other apps that use it and try again.";
}

/** The current frame as a JPEG, with the time it was taken printed on the picture. */
function snapshot(video: HTMLVideoElement): Promise<File | null> {
  const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx || !canvas.width) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const taken = new Date().toISOString();
  const stamp = `${formatIsoDate(istDateOf(taken))}, ${formatTimeIst(taken)} IST`;
  const size = Math.max(16, Math.round(canvas.width / 36));
  ctx.font = `600 ${size}px sans-serif`;
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, canvas.height - size * 2, ctx.measureText(stamp).width + size * 1.4, size * 2);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(stamp, size * 0.7, canvas.height - size);
  return new Promise((resolve) =>
    canvas.toBlob(
      (blob) =>
        resolve(
          blob
            ? new File([blob], `photo-${taken.replace(/[:.]/g, "-")}.jpg`, { type: "image/jpeg" })
            : null,
        ),
      "image/jpeg",
      0.85,
    ),
  );
}

/** A live viewfinder. There is deliberately no file input: photos can only be taken now. */
export function CameraView({
  onCapture,
  onClose,
  full,
}: {
  onCapture: (photo: File) => void;
  onClose: () => void;
  /** No more photos fit. */
  full: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let closed = false;
    const stop = () => {
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
    // Browsers only offer the camera on https or localhost.
    if (!navigator.mediaDevices?.getUserMedia) {
      setProblem("This page cannot open the camera. Open Slate over https.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((opened) => {
        stream = opened;
        if (closed) return stop();
        if (video.current) video.current.srcObject = opened;
      })
      .catch((error) => setProblem(cameraProblem(error)));
    return () => {
      closed = true;
      stop();
    };
  }, []);

  return (
    <div className="space-y-3">
      {problem ? (
        <FormError error={problem} />
      ) : (
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          aria-label="Camera preview"
          onLoadedMetadata={() => setReady(true)}
          className="max-h-[50dvh] w-full rounded-2xl bg-black object-contain"
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Close camera
        </Button>
        <Button
          type="button"
          disabled={!ready || busy || full || Boolean(problem)}
          onClick={async () => {
            if (!video.current) return;
            setBusy(true);
            const photo = await snapshot(video.current);
            setBusy(false);
            if (photo) onCapture(photo);
            else setProblem("That photo could not be saved. Try again.");
          }}
        >
          <Camera aria-hidden="true" />
          Capture
        </Button>
      </div>
    </div>
  );
}
