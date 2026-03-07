import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Simple slugify helper for stable keys.
 * - lowercases
 * - replaces non-alphanumerics with underscores
 * - collapses repeats
 */
function slugify(input: string): string {
  const slug: string = input
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return slug.length > 0 ? slug : "untitled";
}

type SeedCategory = {
  name: string;
  order: number;
  enabled: boolean;
  image?: string;
  description?: string;
  subcategories: Array<{
    name: string;
    order: number;
    enabled: boolean;
    description?: string;
  }>;
};

/**
 * Master category + subcategory seed list (v1).
 * Keep names "screen friendly".
 */
const SEED: SeedCategory[] = [
  {
    name: "Sports",
    order: 1,
    enabled: true,
    subcategories: [
      { name: "Soccer Club", order: 1, enabled: true },
      { name: "Soccer International", order: 2, enabled: true },
      { name: "Basketball", order: 3, enabled: true },
      { name: "American Football", order: 4, enabled: true },
      { name: "Baseball", order: 5, enabled: true },
      { name: "Ice Hockey", order: 6, enabled: true },
      { name: "Tennis", order: 7, enabled: true },
      { name: "Golf", order: 8, enabled: true },
      { name: "Motorsport", order: 9, enabled: true },
      { name: "Rugby", order: 10, enabled: true },
      { name: "Combat Sports", order: 11, enabled: true },
      { name: "Olympics", order: 12, enabled: true }
    ]
  },
  {
    name: "Entertainment",
    order: 2,
    enabled: true,
    subcategories: [
      { name: "Movies", order: 1, enabled: true },
      { name: "TV Shows", order: 2, enabled: true },
      { name: "Music", order: 3, enabled: true },
      { name: "Books", order: 4, enabled: true },
      { name: "Celebrities", order: 5, enabled: true },
      { name: "Awards & Oscars", order: 6, enabled: true },
      { name: "Cartoons & Animation", order: 7, enabled: true },
      { name: "Video Games", order: 8, enabled: true },
      { name: "Famous Characters", order: 9, enabled: true },
      { name: "Flops & Box Office Bombs", order: 10, enabled: true }
    ]
  },
  {
    name: "History",
    order: 3,
    enabled: true,
    subcategories: [
      { name: "Ancient Egypt", order: 1, enabled: true },
      { name: "Ancient Greece", order: 2, enabled: true },
      { name: "Ancient Rome", order: 3, enabled: true },
      { name: "Ancient Civilisations", order: 4, enabled: true },
      { name: "Medieval History", order: 5, enabled: true },
      { name: "Empires & Colonisation", order: 6, enabled: true },
      { name: "Age of Exploration", order: 7, enabled: true },
      { name: "Revolutions & Independence", order: 8, enabled: true },
      { name: "World Wars", order: 9, enabled: true },
      { name: "Modern History", order: 10, enabled: true }
    ]
  },
  {
    name: "Science",
    order: 4,
    enabled: true,
    subcategories: [
      { name: "Biology", order: 1, enabled: true },
      { name: "Chemistry", order: 2, enabled: true },
      { name: "Physics", order: 3, enabled: true },
      { name: "Geography & Earth Science", order: 4, enabled: true },
      { name: "Space & Astronomy", order: 5, enabled: true },
      { name: "Human Body", order: 6, enabled: true },
      { name: "Psychology", order: 7, enabled: true },
      { name: "Medicine", order: 8, enabled: true },
      { name: "Inventions & Discoveries", order: 9, enabled: true },
      { name: "Famous Scientists", order: 10, enabled: true },
      { name: "Technology & Computing", order: 11, enabled: true },
      { name: "Weather & Climate", order: 12, enabled: true },
      { name: "Science Myths & Misconceptions", order: 13, enabled: true }
    ]
  },
  {
    name: "Decades",
    order: 5,
    enabled: true,
    subcategories: [
      { name: "1920s", order: 1, enabled: true },
      { name: "1930s", order: 2, enabled: true },
      { name: "1940s", order: 3, enabled: true },
      { name: "1950s", order: 4, enabled: true },
      { name: "1960s", order: 5, enabled: true },
      { name: "1970s", order: 6, enabled: true },
      { name: "1980s", order: 7, enabled: true },
      { name: "1990s", order: 8, enabled: true },
      { name: "2000s", order: 9, enabled: true },
      { name: "2010s", order: 10, enabled: true },
      { name: "2020s", order: 11, enabled: true },
      { name: "Guess the Decade", order: 12, enabled: true }
    ]
  },
  {
    name: "Mythology",
    order: 6,
    enabled: true,
    subcategories: [
      { name: "Greek Mythology", order: 1, enabled: true },
      { name: "Roman Mythology", order: 2, enabled: true },
      { name: "Norse Mythology", order: 3, enabled: true },
      { name: "Egyptian Mythology", order: 4, enabled: true },
      { name: "Celtic Mythology", order: 5, enabled: true },
      { name: "Asian Mythology", order: 6, enabled: true },
      { name: "Mythical Creatures", order: 7, enabled: true },
      { name: "Heroes & Legends", order: 8, enabled: true },
      { name: "Underworlds & Afterlife", order: 9, enabled: true },
      { name: "Myth vs Reality", order: 10, enabled: true }
    ]
  },
  {
    name: "Politics",
    order: 7,
    enabled: true,
    subcategories: [
      { name: "World Leaders", order: 1, enabled: true },
      { name: "How Countries Are Run", order: 2, enabled: true },
      { name: "Elections & Voting", order: 3, enabled: true },
      { name: "Global Politics", order: 4, enabled: true },
      { name: "Political Scandals", order: 5, enabled: true },
      { name: "Coups & Revolutions", order: 6, enabled: true },
      { name: "Cold War Era", order: 7, enabled: true },
      { name: "Laws & Rights", order: 8, enabled: true },
      { name: "Flags & Symbols", order: 9, enabled: true },
      { name: "Politics on Screen", order: 10, enabled: true }
    ]
  },
  {
    name: "Geography",
    order: 8,
    enabled: true,
    subcategories: [
      { name: "Countries of the World", order: 1, enabled: true },
      { name: "Maps & Locations", order: 2, enabled: true },
      { name: "Flags of the World", order: 3, enabled: true },
      { name: "Natural Wonders", order: 4, enabled: true },
      { name: "Cities & Landmarks", order: 5, enabled: true },
      { name: "Islands & Seas", order: 6, enabled: true },
      { name: "Climate & Weather", order: 7, enabled: true },
      { name: "Borders & Boundaries", order: 8, enabled: true },
      { name: "People & Places", order: 9, enabled: true },
      { name: "Guess the Place", order: 10, enabled: true }
    ]
  }
];

async function upsertCategory(ctx: any, cat: SeedCategory) {
  const slug: string = slugify(cat.name);

  const existing = await ctx.db
    .query("categories")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      name: cat.name,
      slug,
      order: cat.order,
      enabled: cat.enabled,
      image: cat.image,
      description: cat.description
    });
    return existing._id;
  }

  return await ctx.db.insert("categories", {
    name: cat.name,
    slug,
    order: cat.order,
    enabled: cat.enabled,
    image: cat.image,
    description: cat.description
  });
}

async function upsertSubcategory(ctx: any, categoryId: any, sub: SeedCategory["subcategories"][0]) {
  const slug: string = slugify(sub.name);

  const existing = await ctx.db
    .query("subcategories")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .unique();

  // If slug collisions ever happen across categories, switch to a composite slug
  // like `${slugify(categoryName)}__${slugify(subName)}`. For now, names are unique.

  if (existing) {
    await ctx.db.patch(existing._id, {
      categoryId,
      name: sub.name,
      slug,
      order: sub.order,
      enabled: sub.enabled,
      description: sub.description
    });
    return existing._id;
  }

  return await ctx.db.insert("subcategories", {
    categoryId,
    name: sub.name,
    slug,
    order: sub.order,
    enabled: sub.enabled,
    description: sub.description
  });
}

/**
 * Seed (or update) the categories + subcategories.
 * Safe to run multiple times (idempotent by slug).
 */
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const result: {
      categoriesCreatedOrUpdated: number;
      subcategoriesCreatedOrUpdated: number;
    } = {
      categoriesCreatedOrUpdated: 0,
      subcategoriesCreatedOrUpdated: 0
    };

    for (const cat of SEED) {
      const categoryId = await upsertCategory(ctx, cat);
      result.categoriesCreatedOrUpdated += 1;

      for (const sub of cat.subcategories) {
        await upsertSubcategory(ctx, categoryId, sub);
        result.subcategoriesCreatedOrUpdated += 1;
      }
    }

    return result;
  }
});

/**
 * Convenience query: get all categories with their subcategories for your setup UI.
 */
export const listTree = query({
  args: {
    enabledOnly: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const enabledOnly: boolean = args.enabledOnly ?? true;

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_order")
      .collect();

    const filteredCategories = enabledOnly
      ? categories.filter((c: any) => c.enabled !== false)
      : categories;

    const tree = [];
    for (const cat of filteredCategories) {
      const subs = await ctx.db
        .query("subcategories")
        .withIndex("by_category_order", (q: any) => q.eq("categoryId", cat._id))
        .collect();

      const filteredSubs = enabledOnly
        ? subs.filter((s: any) => s.enabled !== false)
        : subs;

      tree.push({
        category: cat,
        subcategories: filteredSubs
      });
    }

    return tree;
  }
});

/**
 * Handy lookup: resolve a category by slug (or name fallback).
 */
export const getCategoryBySlug = query({
  args: {
    slug: v.string()
  },
  handler: async (ctx, args) => {
    const cat = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q: any) => q.eq("slug", args.slug))
      .unique();

    return cat;
  }
});

/**
 * Fetch a category and its subcategories by category slug.
 */
export const getCategoryTreeBySlug = query({
  args: {
    slug: v.string(),
    enabledOnly: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const enabledOnly: boolean = args.enabledOnly ?? true;

    const category = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q: any) => q.eq("slug", args.slug))
      .unique();

    if (!category) {
      return null;
    }

    const subcategories = await ctx.db
      .query("subcategories")
      .withIndex("by_category_order", (q: any) => q.eq("categoryId", category._id))
      .collect();

    const filteredSubs = enabledOnly
      ? subcategories.filter((s: any) => s.enabled !== false)
      : subcategories;

    return {
      category,
      subcategories: filteredSubs
    };
  }
});
