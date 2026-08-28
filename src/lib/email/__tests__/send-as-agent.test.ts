import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendMeerkatHtmlEmail } from '../send-as-agent';
import { sendEmail } from '../send';

vi.mock('../send', () => ({
  sendEmail:        vi.fn(() => Promise.resolve(true)),
  agentBrandedFrom: vi.fn(() => 'Nelia Centinelia <notificaciones@centinelia.mx>'),
}));

vi.mock('../agent-connector', () => ({
  getFileConnector: vi.fn(),
  NO_DRIVE_ERROR:   'stub',
}));

function fakeConnector(provider: 'gmail' | 'outlook', sendImpl: () => Promise<void>) {
  return {
    integration: { provider, send_as_email: `nelia@dominio.mx` } as any,
    conn: {
      email: { send: vi.fn(sendImpl) },
    } as any,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('sendMeerkatHtmlEmail', () => {
  it('usa OAuth Gmail cuando hay connector conectado', async () => {
    const ic = fakeConnector('gmail', async () => {});
    const res = await sendMeerkatHtmlEmail(
      { agentId: 'a1', to: 'x@y.com', subject: 'S', html: '<p>hi</p>' },
      {} as any,
      ic,
    );
    expect(res.ok).toBe(true);
    expect(res.provider).toBe('gmail');
    expect(ic.conn.email.send).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('usa OAuth Outlook cuando el connector es outlook', async () => {
    const ic = fakeConnector('outlook', async () => {});
    const res = await sendMeerkatHtmlEmail(
      { agentId: 'a1', to: 'x@y.com', subject: 'S', html: '<p>hi</p>' },
      {} as any,
      ic,
    );
    expect(res.provider).toBe('outlook');
  });

  it('cae a Resend cuando el OAuth throws', async () => {
    const ic = fakeConnector('gmail', async () => { throw new Error('token expired'); });
    const res = await sendMeerkatHtmlEmail(
      { agentId: 'a1', to: 'x@y.com', subject: 'S', html: '<p>hi</p>' },
      {} as any,
      ic,
    );
    expect(res.ok).toBe(true);
    expect(res.provider).toBe('resend');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('cae a Resend cuando no hay connector (null explícito)', async () => {
    const res = await sendMeerkatHtmlEmail(
      { agentId: 'a1', to: 'x@y.com', subject: 'S', html: '<p>hi</p>' },
      {} as any,
      null,
    );
    expect(res.provider).toBe('resend');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('retorna provider=none cuando Resend también falla', async () => {
    (sendEmail as any).mockResolvedValueOnce(false);
    const res = await sendMeerkatHtmlEmail(
      { agentId: 'a1', to: 'x@y.com', subject: 'S', html: '<p>hi</p>' },
      {} as any,
      null,
    );
    expect(res.ok).toBe(false);
    expect(res.provider).toBe('none');
  });

  it('respeta el from explícito en el path Resend', async () => {
    await sendMeerkatHtmlEmail(
      { agentId: 'a1', to: 'x@y.com', subject: 'S', html: '<p>hi</p>', from: 'Custom <custom@x.com>' },
      {} as any,
      null,
    );
    const callArgs = (sendEmail as any).mock.calls[0][0];
    expect(callArgs.from).toBe('Custom <custom@x.com>');
  });
});
