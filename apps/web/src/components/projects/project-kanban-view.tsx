'use client';

import type { ProjectStatus } from '@shipyard/shared';

import { KanbanColumn } from '@/components/projects/kanban-column';
import { ProjectKanbanCard } from '@/components/projects/project-kanban-card';
import { kanbanDummy } from '@/components/projects/mock-kanban';

const STATUS_ORDER: ProjectStatus[] = ['PLANNED', 'ACTIVE', 'COMPLETED'];

/**
 * Projects Kanban view — mirrors the Kanban board in shipyard.pen: three
 * columns (Planned / Active / Completed), each a status column populated with
 * project cards. Driven by dummy data until the live query is wired in. Card
 * click bubbles up through `onOpenProject` to drive the detail panel.
 */
export function ProjectKanbanView({
  onOpenProject,
}: {
  onOpenProject?: (id: string) => void;
}) {
  return (
    <div className="flex h-full w-full gap-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {STATUS_ORDER.map((status) => {
        const cards = kanbanDummy[status];
        return (
          <KanbanColumn key={status} status={status} count={cards.length}>
            {cards.map((card) => (
              <ProjectKanbanCard
                key={card.id}
                project={{
                  id: card.id,
                  workspaceId: 'ws_mock',
                  name: card.name,
                  status: card.status,
                  owner: {
                    memberId: 'mb_x',
                    userId: 'usr_x',
                    name: card.members[0] ?? 'Unassigned',
                    email: 'owner@shipyard.dev',
                    image: null,
                  },
                  startDate: null,
                  targetDate: card.targetDate,
                  archivedAt: null,
                  createdAt: '2025-11-02T10:00:00.000Z',
                  updatedAt: '2025-11-02T10:00:00.000Z',
                }}
                description={card.description}
                members={card.members}
                onOpen={
                  onOpenProject ? () => onOpenProject(card.id) : () => undefined
                }
              />
            ))}
          </KanbanColumn>
        );
      })}
    </div>
  );
}
