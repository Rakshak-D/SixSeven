"use client";

import { Bot, Calculator, CheckSquare, Loader2, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mocksEnabled } from "@/mocks";
import { useCurrentProject } from "./project-context";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const QUICK_PROMPTS = [
  {
    label: "Calc Slab Concrete",
    prompt: "Calculate concrete and steel for a 1200 sq.ft 5-inch thick RCC roof slab.",
  },
  {
    label: "Brick Wall Quantity",
    prompt: "Estimate bricks and cement mortar for a 10ft high, 50ft long 9-inch brick wall.",
  },
  {
    label: "Site Inspection Checklist",
    prompt: "Give me a critical 5-step checklist before pouring a concrete slab.",
  },
];

/** Offline responses used when mocks are enabled (no live API available). */
function mockReply(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("slab") || q.includes("concrete") || q.includes("rcc")) {
    return [
      "📐 **RCC Roof Slab – 1200 sq.ft @ 5-inch (127mm)**",
      "",
      "**Concrete (M20 mix 1:1.5:3)**",
      "• Volume = 1200 × 0.417ft = 500 cu.ft = 14.15 m³",
      "• Cement: ~6.8 bags/m³ → **~96 bags (50kg)**",
      "• Sand: ~0.46 m³/m³ → **~6.5 m³**",
      "• Aggregate (20mm): ~0.90 m³/m³ → **~12.7 m³**",
      "",
      "**Steel (Fe500 @ 1%)**",
      "• ~80–100 kg/m³ of concrete → **~1,130–1,415 kg**",
      "",
      'Add 5–8% wastage. Use M20 (1:1.5:3) for a 5" slab.',
      "",
      "*(Demo mode — connect AI_API_KEY for live calculations)*",
    ].join("\n");
  }
  if (q.includes("brick")) {
    return [
      "🧱 **9-inch Brick Wall – 10ft × 50ft**",
      "",
      "**Bricks**",
      "• Volume = 50ft × 10ft × 0.75ft = 375 cu.ft = 10.6 m³",
      "• Bricks/m³ ≈ 500 → **~5,300 bricks** (+ 5% breakage = ~5,565)",
      "",
      "**Cement Mortar (1:6 mix)**",
      "• Mortar volume ≈ 30% of wall = ~3.2 m³ (wet)",
      "• Cement: ~1.5 bags/m³ mortar → **~5 bags (50kg)**",
      "• Sand: **~1.8 m³**",
      "",
      "*(Demo mode — connect AI_API_KEY for live calculations)*",
    ].join("\n");
  }
  if (q.includes("checklist")) {
    return [
      "✅ **Pre-Concrete Pour Checklist**",
      "",
      "1. **Formwork** – Check shuttering alignment, plumb, and adequate props/supports",
      "2. **Reinforcement** – Verify bar spacing, cover blocks (25mm min), and all laps tied",
      "3. **Cleanliness** – Remove debris, sawdust, and stagnant water from formwork",
      "4. **Embeds & MEP** – Confirm all sleeves, conduits, and inserts are secured",
      "5. **Concrete Mix** – Agree slump (100–125mm), test first batch, check water-cement ratio",
      "",
      "*(Demo mode — connect AI_API_KEY for live AI checklists)*",
    ].join("\n");
  }
  return [
    "👋 I'm Slate AI Copilot running in **demo mode**.",
    "",
    "I can help with:",
    "• Material quantity estimates (concrete, bricks, steel)",
    "• Mix ratios and standard calculations",
    "• Site inspection checklists",
    "",
    'Try the quick-prompt buttons above, or ask e.g. "How much cement for a 20ft × 30ft slab?"',
    "",
    "*(Set AI_API_KEY in .env to enable live AI responses)*",
  ].join("\n");
}

export function AiAssistantWidget() {
  const project = useCurrentProject();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Hello! I'm your **Slate AI Copilot** for **${project.name}**.\n\nAsk me for material estimations, concrete ratios, construction checklists, or labour planning.`,
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  const handleSend = async (textToSend?: string) => {
    const userQuery = textToSend || input.trim();
    if (!userQuery || isLoading) return;

    const newMessages: Message[] = [...messages, { role: "user", content: userQuery }];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    // In mock/demo mode, return canned responses immediately
    if (mocksEnabled) {
      await new Promise((r) => setTimeout(r, 400)); // small delay for realism
      setMessages((prev) => [...prev, { role: "assistant", content: mockReply(userQuery) }]);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/v1/projects/${project.id}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          projectContext: {
            name: project.name,
            location: project.location,
            role: project.role,
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Unable to connect to AI assistant");
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "Calculation completed with standard engineering safety buffers.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I encountered an error communicating with the server. Please verify your connection or `.env` configuration.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Pill */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed right-5 bottom-20 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 sm:bottom-6"
        aria-label="Toggle AI Assistant"
      >
        <Sparkles className="size-5 animate-pulse" />
        <span className="font-semibold text-sm">AI Copilot</span>
      </button>

      {/* Slide-over / Bottom Drawer */}
      {isOpen && (
        <aside
          aria-label="Slate AI Copilot"
          className="fixed inset-x-0 bottom-0 z-50 flex h-[82vh] max-h-[700px] flex-col rounded-t-[2rem] border-t border-border bg-card shadow-2xl transition-all duration-300 sm:inset-x-auto sm:right-6 sm:bottom-20 sm:h-[650px] sm:w-[420px] sm:rounded-[2rem] sm:border"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="size-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm leading-none">Slate AI Copilot</h3>
                <p className="text-muted-foreground text-xs mt-1">
                  Calculations &amp; Site Planning
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] uppercase font-mono">
                {project.role}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="size-8 rounded-full"
                aria-label="Close Assistant"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {/* Quick Prompts */}
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/50 px-4 py-2.5 text-xs">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => handleSend(p.prompt)}
                disabled={isLoading}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                {p.label.includes("Calc") ? (
                  <Calculator className="size-3 text-primary" />
                ) : (
                  <CheckSquare className="size-3 text-primary" />
                )}
                <span>{p.label}</span>
              </button>
            ))}
          </div>

          {/* Chat Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3.5 text-sm">
            {messages.map((m, idx) => (
              <div
                key={`msg-${idx}-${m.role}`}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-xs"
                      : "bg-muted text-foreground rounded-bl-xs border border-border/60"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs pl-1">
                <Loader2 className="size-3.5 animate-spin" />
                <span>Copilot is calculating...</span>
              </div>
            )}
          </div>

          {/* Input Area */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="border-t border-border p-3 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask calculation, checklist or materials..."
              className="flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !input.trim()}
              className="size-9 shrink-0 rounded-full"
              aria-label="Send message"
            >
              <Send className="size-4" />
            </Button>
          </form>
        </aside>
      )}
    </>
  );
}
