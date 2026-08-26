import { describe, it, expect, vi, beforeEach } from 'vitest';

// The mailer instantiates Resend at module load and branches on env.NODE_ENV,
// so each scenario re-imports with its own module graph (resetModules +
// doMock per test).

const mailerModulePath = '../../../src/lib/mailer.js';
const envModulePath = '../../../src/common/config/env.js';

const message = {
  to: 'someone@example.com',
  subject: 'Test subject',
  html: '<p>Test</p>',
  text: 'Test',
};

type SendEmailFn = (
  msg: typeof message,
) => Promise<
  | { status: 'sent'; id: string | undefined }
  | { status: 'logged' }
  | { status: 'failed'; error: unknown }
>;

type MailerModule = { sendEmail: SendEmailFn };

function mockResend(
  sendImplementation: (...args: unknown[]) => Promise<unknown>,
): void {
  vi.doMock('resend', () => ({
    Resend: function FakeResend() {
      return { emails: { send: sendImplementation } };
    },
  }));
}

function mockEnv(nodeEnv: string): void {
  vi.doMock(envModulePath, () => ({
    env: {
      NODE_ENV: nodeEnv,
      LOG_LEVEL: 'silent',
      RESEND_API_KEY: 'test-key',
      RESEND_FROM: 'Shipyard <no-reply@test.local>',
    },
  }));
}

describe('sendEmail', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('logs instead of sending in the test environment', async () => {
    // Real env module — vitest setup sets NODE_ENV=test.
    const { sendEmail } = (await import(mailerModulePath)) as MailerModule;

    const result = await sendEmail(message);

    expect(result).toEqual({ status: 'logged' });
  });

  it('sends through Resend outside test', async () => {
    const send = vi
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue({ data: { id: 'resend-id' }, error: null });
    mockResend(send);
    mockEnv('development');

    const { sendEmail } = (await import(mailerModulePath)) as MailerModule;

    const result = await sendEmail(message);

    expect(result).toEqual({ status: 'sent', id: 'resend-id' });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: message.to, subject: message.subject }),
    );
  });

  it('reports failed without throwing when Resend rejects', async () => {
    const send = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ data: null, error: { message: 'nope' } });
    mockResend(send);
    mockEnv('production');

    const { sendEmail } = (await import(mailerModulePath)) as MailerModule;

    const result = await sendEmail(message);

    expect(result.status).toBe('failed');
  });

  it('reports failed without throwing when Resend throws', async () => {
    const send = vi
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockRejectedValue(new Error('network down'));
    mockResend(send);
    mockEnv('production');

    const { sendEmail } = (await import(mailerModulePath)) as MailerModule;

    const result = await sendEmail(message);

    expect(result.status).toBe('failed');
  });
});
