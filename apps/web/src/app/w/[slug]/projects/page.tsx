import { ProjectsPage } from '@/components/projects/projects-page';

export default async function WorkspaceProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const { project } = await searchParams;
  // `?project=<id>` deep-links from global search: the page opens its inline
  // detail panel for that project on mount.
  const initialProjectId = typeof project === 'string' ? project : undefined;

  return <ProjectsPage slug={slug} initialProjectId={initialProjectId} />;
}
