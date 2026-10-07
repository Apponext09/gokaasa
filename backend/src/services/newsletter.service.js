import { newsletterRepository } from '../repositories/newsletter.repository.js';

export const newsletterService = {
  async subscribe(email) {
    const row = await newsletterRepository.subscribe(email);
    return { email: row.email };
  },
};
