"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Detector = { detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type CameraDetector = new () => Detector;

export function BagScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [notice, setNotice] = useState("");
  const callback = useRef(onCode);
  useEffect(() => {
    callback.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!active) return;
    const Scanner = (globalThis as typeof globalThis & { BarcodeDetector?: CameraDetector })
      .BarcodeDetector;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const stop = () =>
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
    async function scan() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setNotice("Camera scanning is unavailable here. Enter the bag code by hand.");
        setActive(false);
        return;
      }
      try {
        const native = Scanner ? new Scanner() : null;
        const decoder = native ? null : await import("@/lib/bag-barcode");
        if (cancelled) return;
        const canvas = document.createElement("canvas");
        const drawing = canvas.getContext("2d", { willReadFrequently: true });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled || !video.current) return stop();
        const camera = video.current;
        camera.srcObject = stream;
        await camera.play();
        const detect = async () => {
          if (cancelled) return;
          try {
            let codes: { rawValue: string }[] = [];
            if (native) codes = await native.detect(camera);
            else if (decoder && drawing && camera.videoWidth && camera.videoHeight) {
              const scale = Math.min(1, 640 / Math.max(camera.videoWidth, camera.videoHeight));
              canvas.width = Math.max(1, Math.round(camera.videoWidth * scale));
              canvas.height = Math.max(1, Math.round(camera.videoHeight * scale));
              drawing.drawImage(camera, 0, 0, canvas.width, canvas.height);
              const frame = drawing.getImageData(0, 0, canvas.width, canvas.height);
              const decoded = decoder.decodeBagBarcode(frame.data, frame.width, frame.height);
              if (decoded) codes = [{ rawValue: decoded }];
            }
            if (cancelled) return;
            const code = codes
              .find(({ rawValue }) => /^\S{1,160}$/.test(rawValue.trim()))
              ?.rawValue.trim();
            if (code) {
              callback.current(code);
              setNotice("Bag code read.");
              setActive(false);
              return;
            }
            timer = setTimeout(detect, 180);
          } catch {
            if (!cancelled) {
              setNotice("Could not read the camera. Enter the bag code by hand.");
              setActive(false);
            }
          }
        };
        await detect();
      } catch {
        if (!cancelled) {
          setNotice("Could not open the camera. Enter the bag code by hand.");
          setActive(false);
        }
      }
    }
    void scan();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stop();
    };
  }, [active]);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setNotice("");
          setActive(!active);
        }}
      >
        {active ? "Stop scan" : "Scan bag code"}
      </Button>
      {active ? (
        <video
          ref={video}
          muted
          playsInline
          aria-label="Bag code camera preview"
          className="w-full rounded-xl"
        />
      ) : null}
      {notice ? <output className="text-sm text-muted-foreground">{notice}</output> : null}
    </div>
  );
}
