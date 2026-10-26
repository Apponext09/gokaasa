import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('mail');
let transporter;

function getTransporter() {
  if (!config.mail.host) return null;
  transporter ??= nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    requireTLS: !config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
    connectionTimeout: config.mail.connectionTimeoutMs,
    greetingTimeout: config.mail.connectionTimeoutMs,
    socketTimeout: config.mail.connectionTimeoutMs * 2,
  });
  return transporter;
}

export const mailService = {
  async send({ to, subject, text, html }) {
    if (config.env === 'test' || process.env.NODE_TEST_CONTEXT) {
      // Integration tests that care about content replace this method with a capture fake. All other
      // tests get an inert acceptance response, guaranteeing that a real SMTP connection is never made.
      return { messageId: null, accepted: [to], rejected: [], simulated: true };
    }
    const transport = getTransporter();
    if (!transport) {
      log.warn('SMTP is not configured; email was not accepted', { subject });
      const error = new Error('SMTP is not configured');
      error.code = 'SMTP_NOT_CONFIGURED';
      throw error;
    }
    const info = await transport.sendMail({ from: config.mail.from, to, subject, text, html });
    if ((info.rejected?.length ?? 0) > 0 || (info.accepted?.length ?? 0) === 0) {
      const error = new Error('SMTP provider rejected the recipient');
      error.code = 'SMTP_RECIPIENT_REJECTED';
      throw error;
    }
    return { messageId: info.messageId ?? null, accepted: info.accepted ?? [], rejected: info.rejected ?? [] };
  },
};
