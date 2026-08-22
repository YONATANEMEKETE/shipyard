import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('merges class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'no', true && 'yes')).toBe('base yes');
  });

  it('resolves clsx objects', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });

  it('deduplicates conflicting tailwind classes (tailwind-merge)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('last conflicting class wins', () => {
    expect(cn('text-sm', 'text-lg')).toBe('text-lg');
  });

  it('preserves non-conflicting classes', () => {
    expect(cn('font-bold', 'text-sm', 'text-lg')).toBe('font-bold text-lg');
  });
});
