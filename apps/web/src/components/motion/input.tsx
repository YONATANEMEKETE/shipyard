'use client';
// beui.dev/components/motion/input

import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
} from 'motion/react';
import { X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

export type InputClassNames = {
  root?: string;
  label?: string;
  field?: string;
  input?: string;
  leftIcon?: string;
  rightIcon?: string;
  successIcon?: string;
  errorMessage?: string;
};

export interface InputChip {
  id: string;
  label: string;
}

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange'
> {
  label?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Truthy error triggers a shake, red border and (if a string) a message. */
  error?: string | boolean;
  success?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** Render value chips inside the field (tag-input mode). Combine with
   *  onRemoveChip; Enter/Backspace behaviour is owned by the consumer. */
  chips?: InputChip[];
  onRemoveChip?: (id: string) => void;
  chipRemoveIcon?: ReactNode;
  className?: string;
  classNames?: InputClassNames;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    value: valueProp,
    defaultValue,
    onChange,
    onFocus,
    onBlur,
    error,
    success,
    leftIcon,
    rightIcon,
    chips,
    onRemoveChip,
    chipRemoveIcon,
    className,
    classNames,
    disabled,
    id: idProp,
    type,
    ...rest
  },
  ref,
) {
  const reactId = useId();
  const id = idProp ?? reactId;
  const reduce = useReducedMotion();

  const controlled = valueProp !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? '');
  const value = controlled ? (valueProp ?? '') : internal;

  const [focused, setFocused] = useState(false);

  const fieldRef = useRef<HTMLDivElement>(null);

  const hasError = Boolean(error);
  const errorMessage = typeof error === 'string' ? error : null;

  // Right edge shows the success check, otherwise the caller's right icon.
  const rightSlot = success ? null : rightIcon;
  const chipsPresent = (chips?.length ?? 0) > 0;

  const inputElement = (
    <input
      ref={ref}
      id={id}
      type={type}
      value={value}
      disabled={disabled}
      aria-invalid={hasError || undefined}
      aria-describedby={errorMessage ? `${id}-error` : undefined}
      {...rest}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      className={cn(
        chipsPresent
          ? 'h-6 min-w-[140px] flex-1 bg-transparent text-sm text-foreground caret-ds-brand outline-none'
          : 'peer h-full w-full bg-transparent text-base leading-6 text-foreground caret-foreground outline-none',
        'placeholder:text-muted-foreground/60',
        !chipsPresent && (leftIcon ? 'pl-10' : 'pl-3.5'),
        !chipsPresent && (rightSlot || success ? 'pr-10' : 'pr-3.5'),
        disabled && 'cursor-not-allowed',
        classNames?.input,
      )}
    />
  );

  // Shake the field when an error appears.
  useEffect(() => {
    if (!fieldRef.current || reduce || !hasError) return;
    animate(
      fieldRef.current,
      { x: [0, -6, 6, -4, 4, -2, 0] },
      { duration: 0.45 },
    );
  }, [hasError, reduce]);

  const handleChange = (next: string) => {
    if (!controlled) setInternal(next);
    onChange?.(next);
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className, classNames?.root)}>
      {label ? (
        <label
          htmlFor={id}
          className={cn(
            'px-1 text-sm font-medium text-foreground',
            classNames?.label,
          )}
        >
          {label}
        </label>
      ) : null}

      <div
        ref={fieldRef}
        data-state={
          hasError
            ? 'error'
            : success
              ? 'success'
              : focused
                ? 'focused'
                : 'idle'
        }
        className={cn(
          'relative rounded-md border transition-colors duration-200',
          chipsPresent
            ? 'flex h-auto min-h-9 flex-wrap items-center gap-1.5'
            : 'h-9 overflow-hidden',
          'border-border',
          focused && !hasError && 'border-foreground/40 ring-2 ring-ring/40',
          hasError && 'border-destructive ring-2 ring-destructive/25',
          disabled && 'opacity-60',
          classNames?.field,
        )}
      >
        {leftIcon ? (
          <span
            className={cn(
              'pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-muted-foreground [&_svg]:h-4 [&_svg]:w-4',
              classNames?.leftIcon,
            )}
          >
            {leftIcon}
          </span>
        ) : null}

        {chipsPresent ? (
          <div
            className={cn(
              'flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-2',
              leftIcon ? 'pl-10' : 'pl-3.5',
              'pr-2.5',
            )}
          >
            {chips?.map((chip) => (
              <span
                key={chip.id}
                className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border border-[#EED8A8] bg-ds-brand-soft px-2 text-[11px] font-medium text-foreground"
              >
                <span className="truncate">{chip.label}</span>
                {onRemoveChip ? (
                  <button
                    type="button"
                    aria-label={`Remove ${chip.label}`}
                    onClick={() => onRemoveChip(chip.id)}
                    className="flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {chipRemoveIcon ?? <X className="size-3" />}
                  </button>
                ) : null}
              </span>
            ))}
            {inputElement}
          </div>
        ) : (
          inputElement
        )}

        {success ? (
          <motion.svg
            viewBox="0 0 24 24"
            fill="none"
            className={cn(
              'absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-(--color-success)',
              classNames?.successIcon,
            )}
          >
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
          </motion.svg>
        ) : rightSlot ? (
          <span
            className={cn(
              'absolute right-0 top-0 flex h-full items-center text-muted-foreground [&_button]:grid [&_button]:size-9 [&_button]:place-items-center [&_svg]:h-4 [&_svg]:w-4',
              classNames?.rightIcon,
            )}
          >
            {rightSlot}
          </span>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {errorMessage ? (
          <motion.p
            id={`${id}-error`}
            role="alert"
            initial={
              reduce
                ? { opacity: 0 }
                : { opacity: 0, y: -4, filter: 'blur(4px)' }
            }
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={
              reduce
                ? { opacity: 0 }
                : { opacity: 0, y: -4, filter: 'blur(4px)' }
            }
            transition={{ duration: 0.2 }}
            className={cn(
              'px-1 text-xs text-destructive',
              classNames?.errorMessage,
            )}
          >
            {errorMessage}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
});
