import { IssuesPage } from '@/components/issues/issues-page';

export default async function WorkspaceIssuesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <IssuesPage slug={slug} />;
}
