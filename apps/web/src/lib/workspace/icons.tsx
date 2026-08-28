import {
  Anchor,
  Boxes,
  Briefcase,
  Building2,
  Compass,
  Cpu,
  Flag,
  Folder,
  Globe,
  HardHat,
  Layers,
  LayoutDashboard,
  Package,
  Rocket,
  Sailboat,
  Shield,
  Ship,
  ShipWheel,
  Star,
  Target,
  Telescope,
  Zap,
  Terminal,
  Code,
  GitBranch,
  GitMerge,
  Workflow,
  Wrench,
  PencilRuler,
  Webhook,
  Server,
  Database,
  Bug,
  Users,
  Handshake,
  Network,
  Crown,
  Trophy,
  Medal,
  Home,
  Castle,
  Factory,
  Mountain,
  TreePine,
  Sprout,
  Flame,
  Gem,
  Sparkles,
  Orbit,
  SquareKanban,
  Gauge,
  TrendingUp,
} from 'lucide-react';

import type { WorkspaceIconKey } from '@shipyard/shared';
import { WORKSPACE_ICON_KEYS } from '@shipyard/shared';

// ─────────────────────────────────────────────────────────────────────────────
// IconPair — canonical Lucide map for workspace icons
//
// Single source: WORKSPACE_ICON_KEYS from @shipyard/shared is the allow-list
// the API validates against; this map must cover every key so both apps
// resolve identically. Add keys additively — never remove.
// ─────────────────────────────────────────────────────────────────────────────

export type WorkspaceIconComponent = typeof Rocket;

export const workspaceIconMap: Record<
  WorkspaceIconKey,
  WorkspaceIconComponent
> = {
  rocket: Rocket,
  boxes: Boxes,
  'layout-dashboard': LayoutDashboard,
  'ship-wheel': ShipWheel,
  globe: Globe,
  telescope: Telescope,
  target: Target,
  zap: Zap,
  layers: Layers,
  folder: Folder,
  star: Star,
  shield: Shield,
  anchor: Anchor,
  cpu: Cpu,
  briefcase: Briefcase,
  sailboat: Sailboat,
  ship: Ship,
  'hard-hat': HardHat,
  'building-2': Building2,
  package: Package,
  compass: Compass,
  flag: Flag,
  terminal: Terminal,
  code: Code,
  'git-branch': GitBranch,
  'git-merge': GitMerge,
  workflow: Workflow,
  wrench: Wrench,
  'pencil-ruler': PencilRuler,
  webhook: Webhook,
  server: Server,
  database: Database,
  bug: Bug,
  users: Users,
  handshake: Handshake,
  network: Network,
  crown: Crown,
  trophy: Trophy,
  medal: Medal,
  home: Home,
  castle: Castle,
  factory: Factory,
  mountain: Mountain,
  'tree-pine': TreePine,
  sprout: Sprout,
  flame: Flame,
  gem: Gem,
  sparkles: Sparkles,
  orbit: Orbit,
  'square-kanban': SquareKanban,
  gauge: Gauge,
  'trending-up': TrendingUp,
} as const;

// Runtime guard — ensures the map stays in sync with the allow-list.
// If a key is added to WORKSPACE_ICON_KEYS without a Lucide entry, this
// throws during module evaluation in dev/test.
if (process.env.NODE_ENV !== 'production') {
  const missing = WORKSPACE_ICON_KEYS.filter((k) => !(k in workspaceIconMap));
  if (missing.length > 0) {
    throw new Error(
      `[workspace/icons] Missing Lucide mapping for keys: ${missing.join(', ')}`,
    );
  }
}

export function getWorkspaceIcon(
  key: string | null | undefined,
): WorkspaceIconComponent | null {
  if (!key) return null;
  return (
    (workspaceIconMap as Record<string, WorkspaceIconComponent>)[key] ?? null
  );
}

export function isWorkspaceIconKey(
  key: string | null | undefined,
): key is WorkspaceIconKey {
  return typeof key === 'string' && key in workspaceIconMap;
}

export interface WorkspaceIconProps {
  icon: string | null | undefined;
  className?: string;
  size?: number;
  fallback?: WorkspaceIconComponent;
}

/**
 * Renders the Lucide icon for a workspace icon key.
 * Returns null when no valid key is provided and no fallback is set.
 */
export function WorkspaceIcon({
  icon,
  className,
  size = 16,
  fallback,
}: WorkspaceIconProps) {
  const Component = getWorkspaceIcon(icon) ?? fallback ?? null;
  if (!Component) return null;
  // Component is a Lucide icon resolved from the static map, not created during render.
  // eslint-disable-next-line react-hooks/static-components
  return <Component className={className} size={size} aria-hidden="true" />;
}
