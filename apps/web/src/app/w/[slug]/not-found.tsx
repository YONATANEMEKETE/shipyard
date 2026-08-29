import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function WorkspaceNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-lg font-semibold text-foreground">
        Workspace not found
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This workspace doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/w">Go to workspaces</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/select-workspace">Choose workspace</Link>
        </Button>
      </div>
    </div>
  );
}
