import type { ProjectStatus } from '@shipyard/shared';

/**
 * Dummy Kanban board data — groups projects by status with assigned member
 * stacks, mirroring the Kanban view in shipyard.pen (Planned / Active /
 * Completed columns). Used to taste the board visually until the live
 * list query drives it.
 */
export interface KanbanDummyCard {
  id: string;
  name: string;
  description: string;
  targetDate: string;
  status: ProjectStatus;
  members: string[];
}

export const kanbanDummy: Record<ProjectStatus, KanbanDummyCard[]> = {
  PLANNED: [
    {
      id: 'k1',
      name: 'Customer Onboarding',
      description:
        'Guided setup flow to bring new customers on board with minimal friction.',
      targetDate: '2026-10-20',
      status: 'PLANNED',
      members: ['Casey Kim', 'Elena Torres'],
    },
    {
      id: 'k2',
      name: 'Search Overhaul',
      description:
        'Rebuild search with faster indexing and more relevant ranking.',
      targetDate: '2026-12-04',
      status: 'PLANNED',
      members: ['Elena Torres', 'Noah Kim', 'Marcus Chen'],
    },
    {
      id: 'k3',
      name: 'Data Privacy Audit',
      description: 'Audit data handling to meet new compliance requirements.',
      targetDate: '2027-01-15',
      status: 'PLANNED',
      members: ['Maya Patel', 'Samir Patel', 'Ravi Sharma', 'Priya Nair'],
    },
  ],
  ACTIVE: [
    {
      id: 'k4',
      name: 'Ship Payroll',
      description:
        'Deliver a fully featured payroll system ahead of the tax season deadline.',
      targetDate: '2026-12-01',
      status: 'ACTIVE',
      members: ['Yonatane Mekete', 'Alex Rivera', 'Jordan Lee'],
    },
    {
      id: 'k5',
      name: 'Platform Migration',
      description:
        'Move core services to the new infrastructure with zero downtime.',
      targetDate: '2026-09-30',
      status: 'ACTIVE',
      members: ['Jordan Lee', 'Dana White', 'Ravi Sharma'],
    },
    {
      id: 'k6',
      name: 'Mobile App Refresh',
      description:
        'Modernize the mobile experience with a refreshed navigation layer.',
      targetDate: '2026-08-15',
      status: 'ACTIVE',
      members: ['Alex Rivera', 'Yonatane Mekete', 'Casey Kim'],
    },
    {
      id: 'k7',
      name: 'API v2',
      description:
        'Ship the next major API version with backward-compatible routes.',
      targetDate: '2026-07-01',
      status: 'ACTIVE',
      members: ['Yonatane Mekete', 'Marcus Chen'],
    },
  ],
  COMPLETED: [
    {
      id: 'k8',
      name: 'Design System V2',
      description:
        'Unify tokens, components and docs across all product surfaces.',
      targetDate: '2026-02-28',
      status: 'COMPLETED',
      members: ['Samir Patel'],
    },
    {
      id: 'k9',
      name: 'Billing Overhaul',
      description: 'Modernize invoicing and payment reconciliation flows.',
      targetDate: '2026-01-10',
      status: 'COMPLETED',
      members: ['Priya Nair', 'Maya Patel'],
    },
    {
      id: 'k10',
      name: 'Payments API',
      description: 'Stable payment gateway integration with retry handling.',
      targetDate: '2026-01-22',
      status: 'COMPLETED',
      members: ['Marcus Chen', 'Jordan Lee', 'Ravi Sharma', 'Noah Kim'],
    },
    {
      id: 'k11',
      name: 'Customer Portal',
      description: 'Self-service portal for account and billing management.',
      targetDate: '2025-12-30',
      status: 'COMPLETED',
      members: ['Casey Kim', 'Elena Torres'],
    },
    {
      id: 'k12',
      name: 'Auth Migration',
      description: 'Migrate all surfaces to the new authentication stack.',
      targetDate: '2026-02-14',
      status: 'COMPLETED',
      members: ['Maya Patel', 'Noah Kim'],
    },
    {
      id: 'k13',
      name: 'Analytics Dashboard',
      description: 'Unified analytics across all product surfaces.',
      targetDate: '2026-01-18',
      status: 'COMPLETED',
      members: ['Ravi Sharma', 'Yonatane Mekete'],
    },
    {
      id: 'k14',
      name: 'Mobile Notifications',
      description: 'Reliable push and in-app notification delivery.',
      targetDate: '2025-12-05',
      status: 'COMPLETED',
      members: ['Noah Kim', 'Casey Kim'],
    },
    {
      id: 'k15',
      name: 'Web Performance',
      description: 'Cut load times and improve Core Web Vitals.',
      targetDate: '2026-03-15',
      status: 'COMPLETED',
      members: ['Marcus Chen', 'Elena Torres', 'Samir Patel'],
    },
    {
      id: 'k16',
      name: 'Notification Center',
      description: 'Central inbox for all workspace activity.',
      targetDate: '2026-04-30',
      status: 'COMPLETED',
      members: ['Maya Patel', 'Jordan Lee'],
    },
    {
      id: 'k17',
      name: 'API Gateway',
      description: 'Stable, rate-limited entry point for all services.',
      targetDate: '2026-05-28',
      status: 'COMPLETED',
      members: ['Yonatane Mekete', 'Priya Nair', 'Ravi Sharma', 'Alex Rivera'],
    },
    {
      id: 'k18',
      name: 'Reporting v1',
      description: 'First iteration of workspace reporting.',
      targetDate: '2025-11-15',
      status: 'COMPLETED',
      members: ['Priya Nair'],
    },
    {
      id: 'k19',
      name: 'Import / Export v1',
      description: 'CSV import and export for projects.',
      targetDate: '2025-10-30',
      status: 'COMPLETED',
      members: ['Casey Kim', 'Noah Kim', 'Samir Patel'],
    },
    {
      id: 'k20',
      name: 'Data Pipeline',
      description: 'ETL pipeline for workspace analytics.',
      targetDate: '2026-03-09',
      status: 'COMPLETED',
      members: ['Ravi Sharma', 'Marcus Chen'],
    },
    {
      id: 'k21',
      name: 'Team Hub',
      description: 'Shared team directory and availability.',
      targetDate: '2025-12-20',
      status: 'COMPLETED',
      members: ['Jordan Lee', 'Elena Torres', 'Maya Patel', 'Alex Rivera'],
    },
    {
      id: 'k22',
      name: 'Onboarding v1',
      description: 'First-run onboarding for new members.',
      targetDate: '2025-11-05',
      status: 'COMPLETED',
      members: ['Samir Patel', 'Casey Kim'],
    },
    {
      id: 'k23',
      name: 'Docs Portal',
      description: 'Searchable docs site covering guides and APIs.',
      targetDate: '2026-02-20',
      status: 'COMPLETED',
      members: ['Elena Torres', 'Marcus Chen'],
    },
  ],
};
