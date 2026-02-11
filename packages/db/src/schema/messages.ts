import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { agents } from "./agents";

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    receiverId: uuid("receiver_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    threadId: uuid("thread_id").references((): AnyPgColumn => messages.id, {
      onDelete: "restrict",
    }),
    encryptedContent: text("encrypted_content").notNull(),
    encryptionKeyVersion: integer("encryption_key_version")
      .notNull()
      .default(1),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_messages_sender").on(table.senderId),
    index("idx_messages_receiver_created").on(
      table.receiverId,
      table.createdAt,
    ),
    index("idx_messages_thread").on(table.threadId),
    check("no_self_message", sql`${table.senderId} != ${table.receiverId}`),
  ],
);

export const messagesRelations = relations(messages, ({ one, many }) => ({
  sender: one(agents, {
    fields: [messages.senderId],
    references: [agents.id],
    relationName: "sentMessages",
  }),
  receiver: one(agents, {
    fields: [messages.receiverId],
    references: [agents.id],
    relationName: "receivedMessages",
  }),
  thread: one(messages, {
    fields: [messages.threadId],
    references: [messages.id],
    relationName: "threadReplies",
  }),
  replies: many(messages, { relationName: "threadReplies" }),
}));
