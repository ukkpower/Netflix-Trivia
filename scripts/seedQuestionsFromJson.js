import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

dotenv.config({ path: ".env.local" });

const CONVEX_URL = process.env.CONVEX_URL;
if (!CONVEX_URL) {
  throw new Error("CONVEX_URL is not set. Ensure .env.local is present.");
}

const DEFAULT_INPUT = "data/questions";

const slugify = (input) =>
  input
    .trim()
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

const assertFourOptions = (options, index) => {
  if (!Array.isArray(options) || options.length !== 4) {
    throw new Error(`Item ${index}: options must be an array of exactly 4 strings`);
  }
  for (const opt of options) {
    if (typeof opt !== "string" || opt.trim().length === 0) {
      throw new Error(`Item ${index}: options must contain non-empty strings`);
    }
  }
};

const assertAnswerIndex = (answerIndex, index) => {
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
    throw new Error(`Item ${index}: answerIndex must be an integer between 0 and 3`);
  }
};

const normalizeOptionalString = (value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolvePath = (inputPath) =>
  path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath);

const readJsonFile = (absolutePath) => {
  const raw = fs.readFileSync(absolutePath, "utf-8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error(`Input JSON must be an array: ${absolutePath}`);
  }
  return data;
};

const getInputFiles = (inputPath) => {
  const absolute = resolvePath(inputPath);
  const stat = fs.statSync(absolute);

  if (stat.isDirectory()) {
    return fs
      .readdirSync(absolute)
      .filter((name) => name.toLowerCase().endsWith(".json"))
      .map((name) => path.join(absolute, name))
      .sort();
  }

  return [absolute];
};

const normalizeSubcategory = (value) => {
  if (typeof value !== "string") return value;
  return value.replace(/_/g, " ");
};

const main = async () => {
  const inputPath = process.argv[2] || DEFAULT_INPUT;
  const inputFiles = getInputFiles(inputPath);
  if (inputFiles.length === 0) {
    console.log("No JSON files found.");
    return;
  }

  const client = new ConvexHttpClient(CONVEX_URL);
  const tree = await client.query(api.categories.listTree, { enabledOnly: false });

  const categoryBySlug = new Map();
  const subcategoryByCategorySlug = new Map();

  for (const entry of tree) {
    const categorySlug = entry.category.slug || slugify(entry.category.name);
    categoryBySlug.set(categorySlug, entry.category);

    const subMap = new Map();
    for (const sub of entry.subcategories) {
      const subSlug = sub.slug || slugify(sub.name);
      subMap.set(subSlug, sub);
    }
    subcategoryByCategorySlug.set(categorySlug, subMap);
  }

  const groupKeyToItems = new Map();

  inputFiles.forEach((filePath) => {
    const data = readJsonFile(filePath);

    if (data.length === 0) {
      console.log(`Skipping empty file: ${filePath}`);
      return;
    }

    data.forEach((q, index) => {
      if (!q || typeof q !== "object") {
        throw new Error(`Item ${index} in ${filePath}: must be an object`);
      }

      const categoryName = q.category;
      const subcategoryName = normalizeSubcategory(q.subcategory);

      if (typeof categoryName !== "string" || categoryName.trim().length === 0) {
        throw new Error(`Item ${index} in ${filePath}: category is required`);
      }
      if (typeof subcategoryName !== "string" || subcategoryName.trim().length === 0) {
        throw new Error(`Item ${index} in ${filePath}: subcategory is required`);
      }

      const categorySlug = slugify(categoryName);
      const subcategorySlug = slugify(subcategoryName);

      const category = categoryBySlug.get(categorySlug);
      if (!category) {
        throw new Error(`Item ${index} in ${filePath}: category not found: ${categoryName}`);
      }

      const subMap = subcategoryByCategorySlug.get(categorySlug);
      const subcategory = subMap ? subMap.get(subcategorySlug) : null;
      if (!subcategory) {
        throw new Error(
          `Item ${index} in ${filePath}: subcategory not found: ${subcategoryName} (category: ${categoryName})`
        );
      }

      if (typeof q.question !== "string" || q.question.trim().length < 5) {
        throw new Error(`Item ${index} in ${filePath}: question is too short`);
      }

      assertFourOptions(q.options, index);
      assertAnswerIndex(q.answerIndex, index);

      if (typeof q.imageName !== "undefined" && typeof q.imageName !== "string") {
        throw new Error(`Item ${index} in ${filePath}: imageName must be a string when provided`);
      }

      const item = {
        categoryId: category._id,
        subcategoryId: subcategory._id,
        difficulty: q.difficulty,
        general: Boolean(q.general),
        question: q.question.trim(),
        options: q.options.map((o) => o.trim()),
        answerIndex: q.answerIndex,
        imageName: normalizeOptionalString(q.imageName),
        explanation: typeof q.explanation === "string" ? q.explanation.trim() : undefined,
        tags: Array.isArray(q.tags)
          ? q.tags.map((t) => String(t).trim()).filter(Boolean)
          : undefined
      };

      const groupKey = `${category._id}:${subcategory._id}`;
      if (!groupKeyToItems.has(groupKey)) {
        groupKeyToItems.set(groupKey, []);
      }
      groupKeyToItems.get(groupKey).push(item);
    });
  });

  const finalItems = [];
  for (const groupItems of groupKeyToItems.values()) {
    finalItems.push(...groupItems);
  }

  if (finalItems.length === 0) {
    console.log("No new questions to insert.");
    return;
  }

  const result = await client.mutation(api.questions.bulkCreate, { items: finalItems });

  console.log(`Inserted ${result.insertedCount} questions.`);
  console.log(result.insertedIds);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
