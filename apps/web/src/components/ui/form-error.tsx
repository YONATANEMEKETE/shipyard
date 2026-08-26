import { cn } from '@/lib/utils';

interface FormErrorProps {
  /** Error message to display; renders nothing when absent. */
  message?: string | null;
  className?: string;
}

/**
 * Inline API/submit error feedback for forms. Renders inside an
 * aria-live region so screen readers announce failures, styled uniformly
 * (`text-xs text-destructive`, left-aligned) across every auth flow.
 */
export function FormError({ message, className }: FormErrorProps) {
  if (!message) return null;

  return (
    <div aria-live="polite">
      <p className={cn('text-xs text-destructive', className)}>{message}</p>
    </div>
  );
}
