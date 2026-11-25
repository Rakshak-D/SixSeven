import { notFound } from "next/navigation";
import { SlateLockup } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Development reference for the design tokens. Not a product screen: hidden in production builds.

const surfaces = [
  { name: "background", className: "bg-background" },
  { name: "band", className: "bg-band" },
  { name: "card", className: "bg-card" },
  { name: "secondary", className: "bg-secondary" },
  { name: "tile", className: "bg-tile" },
];

const colours = [
  { name: "primary", use: "the one action colour", className: "bg-primary" },
  { name: "materials", use: "category", className: "bg-materials" },
  { name: "wages", use: "category", className: "bg-wages" },
  { name: "other", use: "category", className: "bg-other" },
  { name: "success", use: "fine, received", className: "bg-success" },
  { name: "warning", use: "low stock", className: "bg-warning" },
  { name: "destructive", use: "blocked, refused", className: "bg-destructive" },
];

const inks = [
  { name: "foreground", className: "text-foreground" },
  { name: "ink-2", className: "text-ink-2" },
  { name: "muted-foreground", className: "text-muted-foreground" },
];

export default function StyleguidePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-24 sm:px-6">
      <header className="flex animate-drop items-center justify-between gap-4 rounded-full border bg-card py-2 pr-2 pl-6 shadow-float">
        <SlateLockup />
        <span className="hidden rounded-full border px-3 py-1 font-semibold text-muted-foreground text-sm sm:inline">
          Design tokens · development only
        </span>
        <ThemeToggle />
      </header>

      <section className="mt-10 animate-rise rounded-[2.25rem] border bg-band p-6 sm:p-9">
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]">
          Type
        </p>
        <h1 className="mt-3 text-5xl leading-[1.02] sm:text-6xl">
          Week 14,
          <br />
          <span className="text-muted-foreground italic">slab L2 going up</span>
        </h1>
        <div className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-6">
          <div>
            <p className="text-ink-2">Left in budget</p>
            <p className="num mt-1 font-serif text-7xl leading-none tracking-tight sm:text-8xl">
              ₹17.7 L
            </p>
            <p className="mt-2 text-muted-foreground">₹22.3 L spent of ₹40 L · 56%</p>
          </div>
          <div className="max-w-sm space-y-2">
            <h2 className="text-3xl">Newsreader for headings</h2>
            <p>
              Geist for everything people read and tap. Body text is never smaller than 16px, and
              every amount uses tabular figures so columns line up.
            </p>
            <p className="num text-muted-foreground">₹1,11,111 · ₹8,88,888 · 42 bags</p>
          </div>
        </div>
      </section>

      <section className="mt-10 grid animate-rise gap-6 [animation-delay:80ms] md:grid-cols-2">
        <div>
          <h2 className="text-3xl">Surfaces</h2>
          <div className="mt-4 grid grid-cols-5 gap-2">
            {surfaces.map((s) => (
              <div key={s.name} className="space-y-2">
                <div className={`h-20 rounded-2xl border ${s.className}`} />
                <p className="truncate text-muted-foreground text-sm">{s.name}</p>
              </div>
            ))}
          </div>
          <h2 className="mt-8 text-3xl">Ink</h2>
          <div className="mt-3 space-y-1">
            {inks.map((i) => (
              <p key={i.name} className={`text-lg ${i.className}`}>
                {i.name}: Cement · 50 bags · challan 4471
              </p>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-3xl">Colour</h2>
          <ul className="mt-4 space-y-2">
            {colours.map((c) => (
              <li key={c.name} className="flex items-center gap-3">
                <span className={`size-9 shrink-0 rounded-xl ${c.className}`} />
                <span className="font-semibold">{c.name}</span>
                <span className="text-muted-foreground">{c.use}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-10 grid animate-rise gap-6 [animation-delay:160ms] md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Buttons</CardTitle>
            <CardDescription>Pills, at least 44px tall where people tap.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button>Approve 2</Button>
            <Button variant="outline">Filter</Button>
            <Button variant="secondary">Reset</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="destructive">Reject</Button>
            <Button size="lg">Show 6 entries</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fields and badges</CardTitle>
            <CardDescription>
              Labelled inputs; status always has words, not colour alone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sg-amount">From ₹</Label>
              <Input id="sg-amount" inputMode="numeric" placeholder="0" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>Due</Badge>
              <Badge variant="secondary">Demo data</Badge>
              <Badge variant="outline">Received</Badge>
              <Badge variant="destructive">Blocked</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Tabs</CardTitle>
            <CardDescription>The selected pill fills with ink.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="30d">
              <TabsList>
                <TabsTrigger value="7d">7D</TabsTrigger>
                <TabsTrigger value="30d">30D</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
              <TabsContent value="7d" className="pt-4 text-muted-foreground">
                Last 7 days
              </TabsContent>
              <TabsContent value="30d" className="pt-4 text-muted-foreground">
                Last 30 days
              </TabsContent>
              <TabsContent value="all" className="pt-4 text-muted-foreground">
                Whole project
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
