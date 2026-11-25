import { disposableDatabase } from "@/db/config";

export function testDatabase() {
  if (process.env.SLATE_TEST_DATABASE !== "1") {
    throw new Error("Set SLATE_TEST_DATABASE=1 only for a disposable test database");
  }
  return disposableDatabase("test");
}
