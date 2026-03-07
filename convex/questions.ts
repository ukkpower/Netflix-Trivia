import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const Difficulty = v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"));

function assertFourOptions(options: string[]) {
  if (!Array.isArray(options) || options.length !== 4) {
    throw new Error("options must be an array of exactly 4 strings");
  }
  for (const opt of options) {
    if (typeof opt !== "string" || opt.trim().length === 0) {
      throw new Error("options must contain non-empty strings");
    }
  }
}

function assertAnswerIndex(answerIndex: number) {
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
    throw new Error("answerIndex must be an integer between 0 and 3");
  }
}

function normalizeOptionalString(value?: string): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Create one question.
 * Validates:
 * - category & subcategory exist
 * - subcategory belongs to category
 * - options length = 4
 * - answerIndex 0..3
 */
export const create = mutation({
  args: {
    categoryId: v.id("categories"),
    subcategoryId: v.id("subcategories"),

    difficulty: Difficulty,
    general: v.boolean(),

    question: v.string(),
    options: v.array(v.string()),
    answerIndex: v.number(),
    imageName: v.optional(v.string()),

    explanation: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),

    media: v.optional(
      v.object({
        type: v.union(v.literal("image"), v.literal("audio"), v.literal("video")),
        url: v.string(),
        credit: v.optional(v.string())
      })
    ),

    source: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    enabled: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    assertFourOptions(args.options);
    assertAnswerIndex(args.answerIndex);

    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new Error("categoryId not found");
    }

    const subcategory = await ctx.db.get(args.subcategoryId);
    if (!subcategory) {
      throw new Error("subcategoryId not found");
    }

    if (subcategory.categoryId !== args.categoryId) {
      throw new Error("subcategoryId does not belong to categoryId");
    }

    const questionText: string = args.question.trim();
    if (questionText.length < 5) {
      throw new Error("question is too short");
    }

    const docId = await ctx.db.insert("questions", {
      categoryId: args.categoryId,
      subcategoryId: args.subcategoryId,
      difficulty: args.difficulty,
      general: args.general,
      question: questionText,
      options: args.options.map((o) => o.trim()),
      answerIndex: args.answerIndex,
      imageName: normalizeOptionalString(args.imageName),
      explanation: args.explanation?.trim(),
      tags: args.tags?.map((t) => t.trim()).filter((t) => t.length > 0),
      media: args.media,
      source: args.source?.trim(),
      createdBy: args.createdBy?.trim(),
      enabled: args.enabled ?? true
    });

    return docId;
  }
});

/**
 * Bulk insert questions.
 * Returns inserted ids.
 * Notes:
 * - If you expect huge batches, consider chunking client-side.
 */
export const bulkCreate = mutation({
  args: {
    items: v.array(
      v.object({
        categoryId: v.id("categories"),
        subcategoryId: v.id("subcategories"),
        difficulty: Difficulty,
        general: v.boolean(),
        question: v.string(),
        options: v.array(v.string()),
        answerIndex: v.number(),
        imageName: v.optional(v.string()),
        explanation: v.optional(v.string()),
        tags: v.optional(v.array(v.string())),
        media: v.optional(
          v.object({
            type: v.union(v.literal("image"), v.literal("audio"), v.literal("video")),
            url: v.string(),
            credit: v.optional(v.string())
          })
        ),
        source: v.optional(v.string()),
        createdBy: v.optional(v.string()),
        enabled: v.optional(v.boolean())
      })
    )
  },
  handler: async (ctx, args) => {
    const insertedIds: Array<any> = [];

    // Optional: cache subcategory lookups to reduce reads
    const subcategoryCache = new Map<string, any>();

    for (const item of args.items) {
      assertFourOptions(item.options);
      assertAnswerIndex(item.answerIndex);

      const category = await ctx.db.get(item.categoryId);
      if (!category) {
        throw new Error(`categoryId not found: ${item.categoryId}`);
      }

      let subcategory = subcategoryCache.get(item.subcategoryId);
      if (!subcategory) {
        subcategory = await ctx.db.get(item.subcategoryId);
        if (!subcategory) {
          throw new Error(`subcategoryId not found: ${item.subcategoryId}`);
        }
        subcategoryCache.set(item.subcategoryId, subcategory);
      }

      if (subcategory.categoryId !== item.categoryId) {
        throw new Error(`subcategoryId does not belong to categoryId: ${item.subcategoryId}`);
      }

      const docId = await ctx.db.insert("questions", {
        categoryId: item.categoryId,
        subcategoryId: item.subcategoryId,
        difficulty: item.difficulty,
        general: item.general,
        question: item.question.trim(),
        options: item.options.map((o) => o.trim()),
        answerIndex: item.answerIndex,
        imageName: normalizeOptionalString(item.imageName),
        explanation: item.explanation?.trim(),
        tags: item.tags?.map((t) => t.trim()).filter((t) => t.length > 0),
        media: item.media,
        source: item.source?.trim(),
        createdBy: item.createdBy?.trim(),
        enabled: item.enabled ?? true
      });

      insertedIds.push(docId);
    }

    return {
      insertedCount: insertedIds.length,
      insertedIds
    };
  }
});

/**
 * Query: list questions for a round.
 * Supports:
 * - category (required)
 * - optionally subcategory
 * - optionally generalOnly
 * - difficulty filter
 */
export const listByFilter = query({
  args: {
    categoryId: v.id("categories"),
    subcategoryId: v.optional(v.id("subcategories")),
    difficulty: v.optional(Difficulty),
    generalOnly: v.optional(v.boolean()),
    enabledOnly: v.optional(v.boolean()),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit: number = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const enabledOnly: boolean = args.enabledOnly ?? true;

    if (args.subcategoryId && args.difficulty && typeof args.generalOnly !== "boolean") {
      const rows = await ctx.db
        .query("questions")
        .withIndex("by_category_subcategory_difficulty", (q: any) =>
          q
            .eq("categoryId", args.categoryId)
            .eq("subcategoryId", args.subcategoryId)
            .eq("difficulty", args.difficulty)
        )
        .take(limit);

      return enabledOnly ? rows.filter((r: any) => r.enabled !== false) : rows;
    }

    if (args.subcategoryId && !args.difficulty && typeof args.generalOnly !== "boolean") {
      const rows = await ctx.db
        .query("questions")
        .withIndex("by_category_subcategory", (q: any) =>
          q.eq("categoryId", args.categoryId).eq("subcategoryId", args.subcategoryId)
        )
        .take(limit);

      return enabledOnly ? rows.filter((r: any) => r.enabled !== false) : rows;
    }

    // Fast paths using indexes that match your gameplay.
    if (args.subcategoryId && args.difficulty && typeof args.generalOnly === "boolean") {
      const rows = await ctx.db
        .query("questions")
        .withIndex("by_category_subcategory_general_difficulty", (q: any) =>
          q
            .eq("categoryId", args.categoryId)
            .eq("subcategoryId", args.subcategoryId)
            .eq("general", args.generalOnly)
            .eq("difficulty", args.difficulty)
        )
        .take(limit);

      return enabledOnly ? rows.filter((r: any) => r.enabled !== false) : rows;
    }

    if (!args.subcategoryId && args.difficulty && typeof args.generalOnly === "boolean") {
      const rows = await ctx.db
        .query("questions")
        .withIndex("by_category_general_difficulty", (q: any) =>
          q.eq("categoryId", args.categoryId).eq("general", args.generalOnly).eq("difficulty", args.difficulty)
        )
        .take(limit);

      return enabledOnly ? rows.filter((r: any) => r.enabled !== false) : rows;
    }

    // Fallback: category (optionally filtered in-memory)
    const base = await ctx.db
      .query("questions")
      .withIndex("by_category", (q: any) => q.eq("categoryId", args.categoryId))
      .take(limit);

    let rows = base;

    if (args.subcategoryId) {
      rows = rows.filter((r: any) => r.subcategoryId === args.subcategoryId);
    }

    if (args.difficulty) {
      rows = rows.filter((r: any) => r.difficulty === args.difficulty);
    }

    if (typeof args.generalOnly === "boolean") {
      rows = rows.filter((r: any) => r.general === args.generalOnly);
    }

    if (enabledOnly) {
      rows = rows.filter((r: any) => r.enabled !== false);
    }

    return rows.slice(0, limit);
  }
});

/**
 * Optional: disable/enable a question (admin).
 */
export const setEnabled = mutation({
  args: {
    questionId: v.id("questions"),
    enabled: v.boolean()
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.questionId);
    if (!existing) {
      throw new Error("questionId not found");
    }
    await ctx.db.patch(args.questionId, { enabled: args.enabled });
    return { ok: true };
  }
});
