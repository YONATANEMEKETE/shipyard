import { MembersPage } from '@/components/members/members-page';

export default async function WorkspaceMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const { member } = await searchParams;
  // `?member=<id>` deep-links from global search: the page opens the member
  // details dialog for that member once the directory resolves.
  const initialMemberId = typeof member === 'string' ? member : undefined;

  return <MembersPage slug={slug} initialMemberId={initialMemberId} />;
}
