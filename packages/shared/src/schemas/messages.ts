import { z } from "zod";

export const sendMessageSchema = z.object({
  receiverId: z.string().uuid(),
  content: z.string().min(1).max(5000),
  threadId: z.string().uuid().optional(),
});

export const messageListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z.enum(["true", "false"]).optional(),
});
