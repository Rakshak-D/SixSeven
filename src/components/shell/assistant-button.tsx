// Client-only: imported by the app shell.
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AssistantButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label="Ask Slate"
      title="Ask Slate"
      className="shrink-0"
    >
      <Sparkles aria-hidden="true" className="text-primary" />
    </Button>
  );
}
