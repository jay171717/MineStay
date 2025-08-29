import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const bots = pgTable("bots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  status: text("status").notNull().default("offline"), // online, offline, connecting, error
  position: jsonb("position").$type<{ x: number; y: number; z: number }>(),
  health: integer("health").default(20),
  food: integer("food").default(20),
  inventory: jsonb("inventory").$type<Array<{ slot: number; name: string; count: number; displayName?: string }>>().default([]),
  uptime: integer("uptime").default(0), // seconds
  createdAt: timestamp("created_at").defaultNow(),
  lastConnected: timestamp("last_connected"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertBotSchema = createInsertSchema(bots).pick({
  name: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertBot = z.infer<typeof insertBotSchema>;
export type Bot = typeof bots.$inferSelect;

// WebSocket message types
export const wsMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bot_status"),
    data: z.object({
      botId: z.string(),
      status: z.enum(["online", "offline", "connecting", "error"]),
      position: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
      health: z.number().optional(),
      food: z.number().optional(),
      uptime: z.number().optional(),
    }),
  }),
  z.object({
    type: z.literal("bot_inventory"),
    data: z.object({
      botId: z.string(),
      inventory: z.array(z.object({
        slot: z.number(),
        name: z.string(),
        count: z.number(),
        displayName: z.string().optional(),
      })),
    }),
  }),
  z.object({
    type: z.literal("bot_created"),
    data: z.object({
      bot: z.object({
        id: z.string(),
        name: z.string(),
        status: z.string(),
        uptime: z.number(),
      }),
    }),
  }),
  z.object({
    type: z.literal("bot_deleted"),
    data: z.object({
      botId: z.string(),
    }),
  }),
  z.object({
    type: z.literal("error"),
    data: z.object({
      message: z.string(),
      botId: z.string().optional(),
    }),
  }),
]);

export type WSMessage = z.infer<typeof wsMessageSchema>;

// Bot action types
export const botActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("move"),
    direction: z.enum(["forward", "backward", "left", "right"]),
    distance: z.union([z.number(), z.literal("continuous")]),
  }),
  z.object({
    action: z.literal("look"),
    direction: z.enum(["up", "down", "left", "right"]),
    degrees: z.number(),
  }),
  z.object({
    action: z.literal("lookAt"),
    coordinates: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  }),
  z.object({
    action: z.literal("jump"),
  }),
  z.object({
    action: z.literal("sneak"),
    toggle: z.boolean(),
  }),
  z.object({
    action: z.literal("mine"),
    mode: z.enum(["once", "interval", "continuous", "stop"]),
    interval: z.number().optional(),
  }),
  z.object({
    action: z.literal("attack"),
    mode: z.enum(["once", "interval", "continuous", "stop"]),
    interval: z.number().optional(),
  }),
  z.object({
    action: z.literal("rightClick"),
    mode: z.enum(["once", "interval", "continuous", "stop"]),
    interval: z.number().optional(),
  }),
  z.object({
    action: z.literal("dropItem"),
    mode: z.enum(["once", "interval", "continuous", "stop"]),
    interval: z.number().optional(),
  }),
  z.object({
    action: z.literal("dropStack"),
    mode: z.enum(["once", "interval", "continuous", "stop"]),
    interval: z.number().optional(),
  }),
  z.object({
    action: z.literal("sprint"),
    mode: z.enum(["once", "interval", "continuous", "stop"]),
    interval: z.number().optional(),
  }),
  z.object({
    action: z.literal("selectSlot"),
    slot: z.number().min(0).max(8),
  }),
  z.object({
    action: z.literal("swapOffhand"),
    slot: z.number().min(0).max(8),
  }),
]);

export type BotAction = z.infer<typeof botActionSchema>;
