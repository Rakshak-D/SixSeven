import { authHandler } from "@/server/auth-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = authHandler;
export const POST = authHandler;
