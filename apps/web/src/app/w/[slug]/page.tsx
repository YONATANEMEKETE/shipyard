export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">
        Workspace <span className="font-medium text-foreground">{slug}</span> —
        coming soon
      </p>
    </div>
  );
}
