import { IssueDetailPage } from '@/components/issues/issue-detail-page';

export default async function WorkspaceIssueDetailPage({
  params,
}: {
  params: Promise<{ slug: string; issueId: string }>;
}) {
  const { slug, issueId } = await params;
  return <IssueDetailPage slug={slug} issueId={issueId} />;
}
