import dotenv from "dotenv";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

dotenv.config({ path: ".env.local" });

const CONVEX_URL = process.env.CONVEX_URL;
if (!CONVEX_URL) {
  throw new Error("CONVEX_URL is not set. Ensure .env.local is present.");
}

const DIFFICULTIES = ["easy", "medium", "hard"];

const main = async () => {
  const client = new ConvexHttpClient(CONVEX_URL);
  const tree = await client.query(api.categories.listTree, { enabledOnly: true });
  for (const categoryEntry of tree) {
    const { category, subcategories } = categoryEntry;
    console.log(`Category: ${category.name}`);

    if (!subcategories.length) {
      console.log("  (No subcategories)");
      continue;
    }

    for (const sub of subcategories) {
      const counts = {};

      for (const difficulty of DIFFICULTIES) {
        const rows = await client.query(api.questions.listByFilter, {
          categoryId: category._id,
          subcategoryId: sub._id,
          difficulty,
          enabledOnly: true,
          limit: 200
        });
        counts[difficulty] = rows.length;
      }

      console.log(
        `  ${sub.name}: easy=${counts.easy} medium=${counts.medium} hard=${counts.hard}`
      );
    }
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
