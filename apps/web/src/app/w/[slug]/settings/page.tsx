import { SettingsForm } from '@/components/workspace/settings-form';

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <SettingsForm slug={slug} />;
}
