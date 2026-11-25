import { redirect } from "next/navigation";

// Signed-in home is the project list; the sign-in screen will sit in front of it later.
export default function Home() {
  redirect("/projects");
}
