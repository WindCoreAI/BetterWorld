/**
 * Feed Events Table (Sprint 18: Cooperative Depth & Governance)
 *
 * Events for personalized feed scoring.
 * Pruned to last 30 days by feed-event-processor worker.
 */
import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { agents } from "./agents";
import { feedEventTypeEnum, problemDomainEnum } from "./enums";
import { humans } from "./humans";

export const feedEvents = pgTable(
  "feed_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: feedEventTypeEnum("event_type").notNull(),
    actorHumanId: uuid("actor_human_id").references(() => humans.id),
    actorAgentId: uuid("actor_agent_id").references(() => agents.id),
    targetId: uuid("target_id").notNull(),
    targetType: varchar("target_type", { length: 50 }).notNull(),
    domain: problemDomainEnum("domain"),
    city: varchar("city", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_feed_events_created").on(table.createdAt),
    index("idx_feed_events_domain").on(table.domain, table.createdAt),
    index("idx_feed_events_city").on(table.city, table.createdAt),
  ],
);

export const feedEventsRelations = relations(feedEvents, ({ one }) => ({
  actorHuman: one(humans, {
    fields: [feedEvents.actorHumanId],
    references: [humans.id],
  }),
  actorAgent: one(agents, {
    fields: [feedEvents.actorAgentId],
    references: [agents.id],
  }),
}));
