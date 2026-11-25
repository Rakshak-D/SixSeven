// Placeholder: lane B replaces this with the login redirect / project list.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-3 px-4 py-16">
      <h1 className="font-semibold text-3xl tracking-tight">Slate</h1>
      <p className="font-medium text-lg">Every Detail is Accounted For</p>
      <p className="text-muted-foreground">
        Construction site progress and material tracker. Scaffold is running; API health is at{" "}
        <a className="underline underline-offset-4" href="/api/v1/health">
          /api/v1/health
        </a>{" "}
        and the OpenAPI spec at{" "}
        <a className="underline underline-offset-4" href="/api/v1/doc">
          /api/v1/doc
        </a>
        .
      </p>
    </main>
  );
}
