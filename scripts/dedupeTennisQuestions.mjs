import fs from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

const url = process.env.CONVEX_URL;
if (!url) throw new Error("Missing CONVEX_URL");

const client = new ConvexHttpClient(url);

const slugify = (s) =>
  s
    .trim()
    .toLowerCase()
    .replace(/["'’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

const tree = await client.query(api.categories.listTree, { enabledOnly: false });
const sports = tree.find((e) => slugify(e.category.name) === "sports" || e.category.slug === "sports");
if (!sports) throw new Error("Sports category not found");

const tennis = sports.subcategories.find(
  (sub) => slugify(sub.name) === "tennis" || (sub.slug || "") === "tennis"
);
if (!tennis) throw new Error("Tennis subcategory not found");

const rows = await client.query(api.questions.listByFilter, {
  categoryId: sports.category._id,
  subcategoryId: tennis._id,
  enabledOnly: false,
  limit: 200
});

const groups = new Map();
for (const row of rows) {
  const key = (row.question || "").trim().toLowerCase();
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

let disabled = 0;
for (const [, dupes] of groups.entries()) {
  if (dupes.length <= 1) continue;
  dupes.sort((a, b) => a._creationTime - b._creationTime);
  const toDisable = dupes.slice(1);
  for (const q of toDisable) {
    if (q.enabled === false) continue;
    await client.mutation(api.questions.setEnabled, {
      questionId: q._id,
      enabled: false
    });
    disabled += 1;
  }
}

console.log(`Tennis duplicates disabled: ${disabled}`);
