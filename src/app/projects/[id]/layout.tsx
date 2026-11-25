import { AppShell } from "@/components/shell/app-shell";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  const { id } = await params;
  return <AppShell projectId={decodeURIComponent(id)}>{children}</AppShell>;
}
