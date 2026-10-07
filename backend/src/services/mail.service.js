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
    secure: config.mail.port === 465,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
  });
  return transporter;
}

export const mailService = {
  async send({ to, subject, text }) {
    const transport = getTransporter();
    if (!transport) {
      // Message bodies can contain reset links, so they are only logged outside production.
      if (config.isProduction) {
        log.warn('SMTP is not configured; email was not sent', { subject });
      } else {
        log.info('SMTP not configured; email printed for development', { to, subject, text });
      }
      return;
    }
    await transport.sendMail({ from: config.mail.from, to, subject, text });
  },
};
