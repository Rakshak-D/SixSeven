import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import sharp from "sharp";
import { ApiError } from "@/server/middleware/errors";
import { ErrorCode } from "@/shared/errors";
import {
  MaxPhotoBytes,
  PhotoMime,
  type PhotoMime as PhotoMimeType,
} from "@/shared/schemas/progress";

const MAX_IMAGE_PIXELS = 40_000_000;
const MIME_FORMAT: Record<PhotoMimeType, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};
const MIME_EXTENSION: Record<PhotoMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const STORAGE_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export type ValidatedPhoto = {
  bytes: Buffer;
  mime: PhotoMimeType;
  sizeBytes: number;
};

export type StoredPhoto = {
  storageKey: string;
  mime: PhotoMimeType;
  sizeBytes: number;
};

function invalidImage() {
  return new ApiError(
    400,
    ErrorCode.VALIDATION_ERROR,
    "Photo is not a valid JPEG, PNG, or WebP image",
  );
}

function resolveStorageRoot() {
  const workspaceRoot = resolve(/*turbopackIgnore: true*/ process.cwd());
  const configured = process.env.UPLOAD_DIR ?? ".cache/uploads";
  const root = resolve(/*turbopackIgnore: true*/ workspaceRoot, configured);
  const pathFromWorkspace = relative(workspaceRoot, root);
  if (
    !pathFromWorkspace ||
    pathFromWorkspace === "." ||
    pathFromWorkspace === ".." ||
    pathFromWorkspace.startsWith(`..${sep}`) ||
    isAbsolute(pathFromWorkspace)
  ) {
    throw new Error("UPLOAD_DIR must be a project-local subdirectory");
  }
  return { workspaceRoot, root, pathFromWorkspace };
}

async function ensureRealDirectory(directory: string) {
  try {
    const entry = await lstat(directory);
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new Error("Photo storage path contains a non-directory entry");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    try {
      await mkdir(directory, { mode: 0o700 });
    } catch (mkdirError) {
      if ((mkdirError as NodeJS.ErrnoException).code !== "EEXIST") throw mkdirError;
    }
    const entry = await lstat(directory);
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new Error("Photo storage path contains a non-directory entry");
    }
  }
}

export async function ensurePhotoStorage() {
  const { workspaceRoot, root, pathFromWorkspace } = resolveStorageRoot();
  await ensureRealDirectory(workspaceRoot);
  let current = workspaceRoot;
  for (const part of pathFromWorkspace.split(sep)) {
    current = join(current, part);
    await ensureRealDirectory(current);
  }
  const staging = join(root, ".staging");
  await ensureRealDirectory(staging);
  return { root, staging };
}

export async function validateImageUpload(file: File): Promise<ValidatedPhoto> {
  if (!(file instanceof File) || file.size < 1 || file.size > MaxPhotoBytes) throw invalidImage();
  const mime = PhotoMime.safeParse(file.type);
  if (!mime.success) throw invalidImage();

  const bytes = Buffer.from(await file.arrayBuffer());
  const options = {
    animated: false,
    failOn: "warning" as const,
    limitInputPixels: MAX_IMAGE_PIXELS,
  };
  try {
    const metadata = await sharp(bytes, options).metadata();
    if (
      metadata.format !== MIME_FORMAT[mime.data] ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
      (metadata.pages ?? 1) > 1
    ) {
      throw invalidImage();
    }
    // stats() forces the decoder to read pixel data, so a valid header alone is insufficient.
    await sharp(bytes, options).stats();
  } catch {
    throw invalidImage();
  }

  return { bytes, mime: mime.data, sizeBytes: bytes.byteLength };
}

async function removeFile(path: string) {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function persistValidatedPhotos(photos: readonly ValidatedPhoto[]) {
  if (photos.length < 1 || photos.length > 10) throw invalidImage();
  const { root, staging } = await ensurePhotoStorage();
  const stagedPaths: string[] = [];
  const storedPaths: string[] = [];
  const stored: StoredPhoto[] = [];

  const cleanup = async () => {
    const errors: unknown[] = [];
    for (const path of [...stagedPaths, ...storedPaths]) {
      try {
        await removeFile(path);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new Error("Unable to clean staged photo files");
  };

  try {
    for (const photo of photos) {
      const storageKey = `${crypto.randomUUID()}.${MIME_EXTENSION[photo.mime]}`;
      const temporaryPath = join(staging, `${crypto.randomUUID()}.part`);
      stagedPaths.push(temporaryPath);
      await writeFile(temporaryPath, photo.bytes, { flag: "wx", mode: 0o600 });
      const finalPath = join(/*turbopackIgnore: true*/ root, storageKey);
      await rename(temporaryPath, finalPath);
      storedPaths.push(finalPath);
      stored.push({ storageKey, mime: photo.mime, sizeBytes: photo.sizeBytes });
    }
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }

  return { photos: stored, cleanup };
}

export async function readStoredPhoto(storageKey: string): Promise<Buffer | null> {
  if (!STORAGE_KEY.test(storageKey)) return null;
  const { root } = await ensurePhotoStorage();
  const path = join(root, storageKey);
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink() || !entry.isFile()) return null;
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
