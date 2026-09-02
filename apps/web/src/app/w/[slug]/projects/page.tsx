import { ProjectsPage } from '@/components/projects/projects-page';

export default async function WorkspaceProjectsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProjectsPage slug={slug} />;
}
