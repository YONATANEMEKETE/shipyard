'use client';

// Re-export beUI Input as the canonical primitive so every
// `@/components/ui/input` import now renders the motion input
// (Harbor Amber: h-9 rounded-md — see motion/input.tsx).
export {
  Input,
  type InputChip,
  type InputProps,
  type InputClassNames,
} from '@/components/motion/input';
