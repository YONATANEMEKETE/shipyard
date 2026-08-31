import { Users } from 'lucide-react';

/**
 * Member directory content — placeholder for the directory card
 * ("Directory Card" in shipyard.pen: 576px white surface with a mono
 * column-header strip). Wired to useMembers next.
 */
export function MemberDirectory() {
  return (
    <div className="flex h-[576px] w-full flex-col overflow-hidden rounded-xl border border-ds-border bg-ds-surface">
      <div className="grid h-9 grid-cols-[2fr_3fr_1fr_1fr] items-center gap-3 border-b border-ds-border bg-ds-bg px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
        <span>Name</span>
        <span>Email</span>
        <span>Role</span>
        <span>Added</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <span className="grid size-11 place-items-center rounded-lg border border-ds-border bg-ds-bg">
          <Users className="size-5 text-muted-foreground" />
        </span>
        <p className="text-[13px] font-semibold text-foreground">
          Member directory
        </p>
        <p className="max-w-[320px] text-xs leading-[1.5] text-muted-foreground">
          Member rows land here once the list is wired to the API.
        </p>
      </div>
    </div>
  );
}
