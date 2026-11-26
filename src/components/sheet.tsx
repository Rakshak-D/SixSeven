// Client-only: import it from client components.

import { cn } from "cn";
import { XIcon } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/**
 * A bottom sheet on phones and a right-side panel on desktop, on solid surfaces (no blur).
 * Radix Dialog handles focus trapping, Escape, the scrim click and screen-reader labelling.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade" />
        <Dialog.Content
          // Without a description, tell Radix there is none instead of leaving a dangling id.
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cn(
            "fixed inset-x-2 bottom-2 z-50 flex max-h-[calc(100dvh-3.5rem)] flex-col rounded-[2.1rem] border bg-card text-card-foreground shadow-float outline-none data-[state=closed]:animate-sheet-down data-[state=open]:animate-sheet-up lg:inset-x-auto lg:top-4 lg:right-4 lg:bottom-4 lg:max-h-none lg:w-[400px] lg:data-[state=closed]:animate-panel-out lg:data-[state=open]:animate-panel-in",
            className,
          )}
        >
          <div
            aria-hidden="true"
            className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-strong lg:hidden"
          />
          <div className="flex items-start justify-between gap-3 pt-3 pr-3 pl-6 lg:pt-6">
            <div className="min-w-0 pt-1">
              <Dialog.Title className="font-serif text-3xl leading-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-[15px] text-muted-foreground">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <XIcon aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-6">{children}</div>
          {footer ? <div className="flex gap-2 px-4 pt-2 pb-4">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
