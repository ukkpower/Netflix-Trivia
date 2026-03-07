import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex schema for Netflix Trivia question bank.
 *
 * Design goals:
 * - Flat `questions` table for fast filtering + random selection
 * - Separate `categories` and `subcategories` tables for UI and future expansion
 * - Indexes aligned to your gameplay queries (difficulty + general + category)
 */

export default defineSchema({
  categories: defineTable({
    // Display name shown in UI (e.g., "Geography")
    name: v.string(),

    // Optional stable key/slug (e.g., "geography") to avoid renames breaking clients
    slug: v.optional(v.string()),

    // UI ordering and toggles
    order: v.optional(v.number()),
    enabled: v.optional(v.boolean()),

    // Optional asset pointers (you can store image paths or URLs)
    image: v.optional(v.string()),
    description: v.optional(v.string())
  })
    .index("by_name", ["name"])
    .index("by_slug", ["slug"])
    .index("by_order", ["order"])
    .index("by_enabled_order", ["enabled", "order"]),

  subcategories: defineTable({
    // Parent category reference
    categoryId: v.id("categories"),

    // Display name shown in UI (e.g., "Flags and Symbols")
    name: v.string(),

    // Optional stable key/slug (e.g., "flags_and_symbols")
    slug: v.optional(v.string()),

    // UI ordering and toggles
    order: v.optional(v.number()),
    enabled: v.optional(v.boolean()),

    // Optional round intro text, etc.
    description: v.optional(v.string())
  })
    .index("by_category", ["categoryId"])
    .index("by_category_order", ["categoryId", "order"])
    .index("by_category_name", ["categoryId", "name"])
    .index("by_slug", ["slug"])
    .index("by_enabled_category_order", ["enabled", "categoryId", "order"]),

  questions: defineTable({
    // References
    categoryId: v.id("categories"),
    subcategoryId: v.id("subcategories"),

    // Difficulty & eligibility
    difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
    general: v.boolean(),

    // Core question content
    question: v.string(),
    options: v.array(v.string()), // you can enforce length=4 in app logic
    answerIndex: v.number(), // enforce 0-3 in app logic
    imageName: v.optional(v.string()),

    // Optional enrichment
    explanation: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),

    // Optional media support for later (image/audio/video)
    media: v.optional(
      v.object({
        type: v.union(v.literal("image"), v.literal("audio"), v.literal("video")),
        url: v.string(),
        credit: v.optional(v.string())
      })
    ),

    // Optional housekeeping
    source: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    enabled: v.optional(v.boolean())
  })
    // Common lookups
    .index("by_category", ["categoryId"])
    .index("by_subcategory", ["subcategoryId"])
    .index("by_category_subcategory", ["categoryId", "subcategoryId"])

    // Gameplay filters
    .index("by_category_general_difficulty", ["categoryId", "general", "difficulty"])
    .index("by_subcategory_general_difficulty", ["subcategoryId", "general", "difficulty"])
    .index("by_category_subcategory_difficulty", ["categoryId", "subcategoryId", "difficulty"])
    .index("by_category_subcategory_general_difficulty", [
      "categoryId",
      "subcategoryId",
      "general",
      "difficulty"
    ])

    // Admin / ops
    .index("by_enabled_category", ["enabled", "categoryId"])
});
