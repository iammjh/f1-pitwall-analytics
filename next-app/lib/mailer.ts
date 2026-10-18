import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type MailResult =
  | { sent: true }
  | { sent: false; reason: 'not-configured' | 'failed'; error?: string };

interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
}

/** SMTP settings from the environment, or null when email delivery is not configured. */
export function getSmtpConfig(env: Record<string, string | undefined> = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const from = env.SMTP_FROM?.trim();
  if (!host || !from) return null;
  const port = Number(env.SMTP_PORT ?? 587);
  return {
    host,
    port: Number.isInteger(port) && port > 0 ? port : 587,
    user: env.SMTP_USER?.trim() || undefined,
    pass: env.SMTP_PASS || undefined,
    from,
  };
}

export function isMailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return getSmtpConfig(env) !== null;
}

let transporter: nodemailer.Transporter | null = null;

/** Sends one email. Never throws: failures come back as { sent: false } so callers can retry later. */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const config = getSmtpConfig();
  if (!config) return { sent: false, reason: 'not-configured' };

  transporter ??= nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });

  try {
    await transporter.sendMail({ from: config.from, ...message });
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}
