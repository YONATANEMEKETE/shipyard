import { MembersPage } from '@/components/members/members-page';

export default async function WorkspaceMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <MembersPage slug={slug} />;
}
