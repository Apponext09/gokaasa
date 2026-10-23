import { mailService } from '../services/mail.service.js';

/**
 * Sends an OTP code by email. mailService already logs instead of sending when SMTP is unconfigured
 * (see services/mail.service.js), which is exactly the dev-safe default this needs -- no separate
 * "simulated provider" is required. A later phase can add a sibling channel (e.g. SMS) and a config
 * switch in otpService.js without touching this file.
 */
export const emailOtpChannel = {
  async send(user, code, { ttlMinutes }) {
    await mailService.send({
      to: user.email,
      subject: 'Your Gokaasa partner verification code',
      text: `Your verification code is ${code}. It expires in ${ttlMinutes} minutes.\n\nIf you did not request this, you can ignore this email.`,
    });
  },
};
