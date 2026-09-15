import { DashboardPage } from '@/components/dashboard/dashboard-page';

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <DashboardPage slug={slug} />;
}
