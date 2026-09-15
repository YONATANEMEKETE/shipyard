import { ActivityPage } from '@/components/activity/activity-page';

export default async function WorkspaceActivityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <ActivityPage slug={slug} />;
}
