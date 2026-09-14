import { CycleDetailPage } from '@/components/cycles/cycle-detail-page';

export default async function WorkspaceCycleDetailPage({
  params,
}: {
  params: Promise<{ slug: string; cycleId: string }>;
}) {
  const { slug, cycleId } = await params;
  return <CycleDetailPage slug={slug} cycleId={cycleId} />;
}
