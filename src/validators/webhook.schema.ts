import { z } from 'zod';

export const webhookPayloadSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.object({
    key: z.object({
      remoteJid: z.string(),
      fromMe: z.boolean(),
      id: z.string(),
    }),
    message: z.object({
      conversation: z.string().optional(),
      extendedTextMessage: z.object({
        text: z.string().optional(),
      }).optional(),
    }).optional(),
  }),
});
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
