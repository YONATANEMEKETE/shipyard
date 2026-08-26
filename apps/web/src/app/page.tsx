import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Root placeholder. Sign-out is stubbed as UI-only until session handling
 * and the authenticated app shell land.
 */
export default function HomePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Button type="button" variant="outline">
        <LogOut />
        Sign out
      </Button>
    </div>
  );
}
