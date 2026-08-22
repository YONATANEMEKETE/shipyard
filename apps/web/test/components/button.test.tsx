import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button, buttonVariants } from '@/components/ui/button';

describe('Button', () => {
  it('renders with default variant and size', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('data-variant', 'default');
    expect(button).toHaveAttribute('data-size', 'default');
  });

  it('applies variant classes', () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button')).toHaveAttribute(
      'data-variant',
      'destructive',
    );
  });

  it('applies size classes', () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('data-size', 'sm');
  });

  it('forwards native button props', () => {
    render(
      <Button type="submit" disabled>
        Submit
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toBeDisabled();
  });

  it('merges custom className with variant classes', () => {
    render(<Button className="my-custom">Custom</Button>);
    expect(screen.getByRole('button')).toHaveClass('my-custom');
  });

  it('renders as child when asChild is true', () => {
    render(
      <Button asChild>
        <a href="/somewhere">Link button</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Link button' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('data-slot', 'button');
  });

  it('exports buttonVariants cva function', () => {
    expect(typeof buttonVariants).toBe('function');
    expect(buttonVariants({ variant: 'ghost' })).toContain('hover:bg-accent');
  });
});
