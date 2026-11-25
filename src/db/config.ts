const invalid = () =>
  new Error("Set DATABASE_URL to an explicit PostgreSQL URL with a host, user and database");

export function databaseUrl(raw = process.env.DATABASE_URL): URL {
  if (!raw || raw !== raw.trim()) throw invalid();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid();
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !/^[a-zA-Z0-9.:[\]-]+$/.test(url.hostname) ||
    !url.username ||
    !/^\/[a-zA-Z0-9_-]+$/.test(url.pathname) ||
    url.hash ||
    [...url.searchParams.keys()].some((key) => key !== "sslmode")
  )
    throw invalid();
  url.port ||= "5432";
  return url;
}

export function disposableDatabase(kind: "demo" | "test"): URL {
  const url = databaseUrl();
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !new RegExp(`^/slate_${kind}(?:_[a-zA-Z0-9_-]+)?$`).test(url.pathname)
  ) {
    throw new Error(`Use an explicit loopback slate_${kind} database for this operation`);
  }
  return url;
}
