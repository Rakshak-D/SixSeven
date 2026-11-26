"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FormError, SavedNotice } from "@/components/forms";
import { PhotoPicker, photoProblem } from "@/components/photos/photo-picker";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { ChallanPhotoResponse, CreateChallanPhotoInput } from "@/shared/schemas/deliveries";

export function ChallanEvidence({
  projectId,
  deliveryId,
}: {
  projectId: string;
  deliveryId: string;
}) {
  const client = useQueryClient();
  const [photos, setPhotos] = useState<File[]>([]);
  const save = useMutation({
    mutationFn: () => {
      const problem = photoProblem(photos);
      if (problem) throw new Error(problem);
      const photo = photos[0];
      const fields = CreateChallanPhotoInput.parse({
        photo,
        capturedAt: new Date(photo.lastModified).toISOString(),
      });
      const form = new FormData();
      form.set("photo", fields.photo);
      form.set("capturedAt", fields.capturedAt);
      return api(
        "POST",
        `/projects/${encodeURIComponent(projectId)}/deliveries/${encodeURIComponent(deliveryId)}/challan-photo`,
        {
          body: form,
          schema: ChallanPhotoResponse,
        },
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [projectId] }),
  });
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="font-medium">Challan photo</p>
      <a
        className="text-primary underline"
        target="_blank"
        rel="noreferrer"
        href={`/api/v1/projects/${encodeURIComponent(projectId)}/deliveries/${encodeURIComponent(deliveryId)}/challan-photo`}
      >
        Open saved photo
      </a>
      {save.isSuccess ? (
        <SavedNotice>Challan evidence saved.</SavedNotice>
      ) : (
        <>
          <PhotoPicker files={photos} onChange={setPhotos} max={1} />
          <Button
            type="button"
            variant="outline"
            disabled={!photos.length || save.isPending}
            onClick={() => save.mutate()}
          >
            Attach challan photo
          </Button>
        </>
      )}
      <FormError error={save.error} />
    </div>
  );
}
