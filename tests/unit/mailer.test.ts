import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const send = vi.fn(async () => ({ data: { id: 'test' }, error: null }))

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send },
  })),
}))

const { sendEmail, sendHtmlEmail, isEmailConfigured } = await import('@/lib/mailer')

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  send.mockClear()
  send.mockResolvedValue({ data: { id: 'test' }, error: null })
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('mailer (Resend)', () => {
  it('isEmailConfigured reflète RESEND_API_KEY', () => {
    delete process.env.RESEND_API_KEY
    expect(isEmailConfigured()).toBe(false)
    process.env.RESEND_API_KEY = 'test-key'
    expect(isEmailConfigured()).toBe(true)
  })

  it('sendEmail refuse d\'envoyer sans RESEND_API_KEY', async () => {
    delete process.env.RESEND_API_KEY
    await expect(sendEmail({ to: 'a@b.com', subject: 'x', body: 'y' })).rejects.toThrow(/RESEND_API_KEY/)
    expect(send).not.toHaveBeenCalled()
  })

  it('sendEmail envoie toujours depuis contact@operis-pro.com', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    delete process.env.MAIL_REPLY_TO
    await sendEmail({ to: 'client@example.com', subject: 'Sujet', body: 'Corps' })
    expect(send).toHaveBeenCalledTimes(1)
    const arg = send.mock.calls[0][0]
    expect(arg.from).toBe('Operis <contact@operis-pro.com>')
    expect(arg.from).not.toMatch(/nikodex/i)
    expect(arg.replyTo).toBeUndefined()
  })

  it('sendHtmlEmail envoie toujours depuis contact@operis-pro.com', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    await sendHtmlEmail({ to: 'client@example.com', subject: 'Sujet', html: '<p>Corps</p>' })
    expect(send).toHaveBeenCalledTimes(1)
    const arg = send.mock.calls[0][0]
    expect(arg.from).toBe('Operis Alertes <contact@operis-pro.com>')
    expect(arg.from).not.toMatch(/nikodex/i)
  })

  it('applique MAIL_REPLY_TO comme reply-to quand défini', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.MAIL_REPLY_TO = 'uki.baralic@gmail.com'
    await sendEmail({ to: 'client@example.com', subject: 'Sujet', body: 'Corps' })
    const arg = send.mock.calls[0][0]
    expect(arg.replyTo).toBe('uki.baralic@gmail.com')
    expect(arg.replyTo).not.toMatch(/nikodex/i)
  })

  it('propage une erreur Resend explicite', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    send.mockResolvedValueOnce({ data: null, error: { message: 'domaine non vérifié' } })
    await expect(sendEmail({ to: 'a@b.com', subject: 'x', body: 'y' })).rejects.toThrow(/domaine non vérifié/)
  })
})
