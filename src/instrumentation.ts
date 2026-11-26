/** Runs once when the server starts. In local demo mode, demo accounts follow SLATE_DEMO_PASSWORD. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { demoSyncAllowed, syncDemoPasswords } = await import("@/db/demo-passwords");
  if (!demoSyncAllowed()) return;
  try {
    const { getDatabase } = await import("@/db/client");
    const changed = await syncDemoPasswords(getDatabase().db);
    if (changed) console.log(`Demo accounts now use SLATE_DEMO_PASSWORD (${changed} updated)`);
  } catch (error) {
    console.warn(
      `Demo password sync skipped: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
