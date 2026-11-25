import { z } from "zod";
import { Id, IsoDate, Note, Timestamp } from "./common";

export const PhotoMime = z.enum(["image/jpeg", "image/png", "image/webp"]);
export const MaxPhotoBytes = 5_000_000;
export const PhotoParams = z.strictObject({ id: Id, photoId: Id });
export const PhotoFile = z.file().min(1).max(MaxPhotoBytes).mime(PhotoMime.options);
export const CreateProgressInput = z.strictObject({
  note: Note,
  checklistItemId: Id.optional(),
  photos: z.array(PhotoFile).min(1).max(10),
});
export const PhotoResponse = z.strictObject({
  id: Id,
  mime: PhotoMime,
  sizeBytes: z.int().positive().max(MaxPhotoBytes),
  takenOn: IsoDate,
  url: z.string().regex(/^\/(?!\/)[A-Za-z0-9/_-]+(?:\.[A-Za-z0-9]+)?$/),
});
export const ProgressResponse = z.strictObject({
  id: Id,
  note: Note,
  checklistItemId: Id.nullable(),
  createdAt: Timestamp,
  photos: z.array(PhotoResponse).min(1).max(10),
});
export const TimelineResponse = z.array(
  z.strictObject({ date: IsoDate, updates: z.array(ProgressResponse) }),
);

export type PhotoMime = z.infer<typeof PhotoMime>;
export type PhotoParams = z.infer<typeof PhotoParams>;
export type PhotoFile = z.infer<typeof PhotoFile>;
export type CreateProgressInput = z.infer<typeof CreateProgressInput>;
export type PhotoResponse = z.infer<typeof PhotoResponse>;
export type ProgressResponse = z.infer<typeof ProgressResponse>;
export type TimelineResponse = z.infer<typeof TimelineResponse>;
