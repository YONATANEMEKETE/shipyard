'use client';

// Auth pages previously owned these primitives; they now live in
// @/components/motion/stagger so any page (e.g. onboarding) can reuse them.
// Re-exported here to keep every existing auth import working unchanged.
export {
  Stagger as AuthStagger,
  StaggerItem as AuthStaggerItem,
} from '@/components/motion/stagger';
