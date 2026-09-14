import { CyclesPage } from '@/components/cycles/cycles-page';

export default async function WorkspaceCyclesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CyclesPage slug={slug} />;
}
