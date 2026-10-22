import { z } from 'zod';

export const assistantExtractSchema = z.object({
  message: z.string().trim().min(1, 'Tell me about the stay you are looking for').max(500, 'Keep your message under 500 characters'),
});
