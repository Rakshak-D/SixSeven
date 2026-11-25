import { readdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MaxPhotoBytes } from "@/shared/schemas/progress";
import {
  ensurePhotoStorage,
  persistValidatedPhotos,
  readStoredPhoto,
  validateImageUpload,
} from "./photo-storage";

let relativeRoot: string;
let absoluteRoot: string;
let previousConfiguredUploadDir: string | undefined;

beforeEach(() => {
  previousConfiguredUploadDir = process.env.UPLOAD_DIR;
  relativeRoot = `.cache/photo-storage-tests/${crypto.randomUUID()}`;
  absoluteRoot = resolve(process.cwd(), relativeRoot);
  process.env.UPLOAD_DIR = relativeRoot;
});

afterEach(async () => {
  await rm(absoluteRoot, { recursive: true, force: true });
  if (previousConfiguredUploadDir === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = previousConfiguredUploadDir;
});

async function imageFile(type: "jpeg" | "png" | "webp") {
  const source = sharp({
    create: { width: 4, height: 3, channels: 3, background: { r: 20, g: 70, b: 110 } },
  });
  const buffer = await (type === "jpeg"
    ? source.jpeg().toBuffer()
    : type === "png"
      ? source.png().toBuffer()
      : source.webp().toBuffer());
  const mime = `image/${type === "jpeg" ? "jpeg" : type}` as const;
  return {
    buffer,
    file: new File([new Uint8Array(buffer)], `user-controlled-name.${type}`, { type: mime }),
  };
}

describe("photo storage", () => {
  it.each(["jpeg", "png", "webp"] as const)("decodes valid %s content", async (type) => {
    const { file, buffer } = await imageFile(type);
    const validated = await validateImageUpload(file);
    expect(validated.mime).toBe(file.type);
    expect(validated.sizeBytes).toBe(buffer.length);
    expect(validated.bytes).toEqual(buffer);
  });

  it("rejects malformed bytes and a declared MIME that disagrees with the decoder", async () => {
    const { buffer } = await imageFile("jpeg");
    const mismatch = new File([new Uint8Array(buffer)], "fake.png", { type: "image/png" });
    const malformed = new File(["not a photo"], "fake.jpg", { type: "image/jpeg" });
    await expect(validateImageUpload(mismatch)).rejects.toThrow();
    await expect(validateImageUpload(malformed)).rejects.toThrow();
  });

  it("rejects an over-limit file and an upload directory outside the workspace", async () => {
    const overLimit = new File([new Uint8Array(MaxPhotoBytes + 1)], "large.jpg", {
      type: "image/jpeg",
    });
    await expect(validateImageUpload(overLimit)).rejects.toThrow();

    process.env.UPLOAD_DIR = "../outside-workspace";
    await expect(ensurePhotoStorage()).rejects.toThrow();
    expect(await stat(absoluteRoot).catch(() => null)).toBeNull();
  });

  it("stores bytes under an opaque key and removes files when asked to roll back", async () => {
    const { file, buffer } = await imageFile("webp");
    const validated = await validateImageUpload(file);
    const staged = await persistValidatedPhotos([validated]);
    const [stored] = staged.photos;
    expect(stored).toBeDefined();
    expect(stored?.storageKey).toMatch(/^[0-9a-f-]{36}\.webp$/);
    expect(stored?.storageKey).not.toContain("user-controlled-name");
    expect(await readStoredPhoto(stored?.storageKey ?? "")).toEqual(buffer);

    await staged.cleanup();
    expect(await readStoredPhoto(stored?.storageKey ?? "")).toBeNull();
    expect(await readdir(absoluteRoot)).toEqual([".staging"]);
  });

  it("does not resolve arbitrary storage keys", async () => {
    expect(await readStoredPhoto("../../private.jpg")).toBeNull();
  });
});
