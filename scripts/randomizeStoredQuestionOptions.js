import dotenv from "dotenv";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

dotenv.config({ path: ".env.local" });

const CONVEX_URL = process.env.CONVEX_URL;
if (!CONVEX_URL) {
  throw new Error("CONVEX_URL is not set. Ensure .env.local is present.");
}

const DIFFICULTIES = ["easy", "medium", "hard"];
const DEFAULT_BATCH_SIZE = 50;

function parseArgs(argv) {
  let apply = false;
  let seed = null;
  let batchSize = DEFAULT_BATCH_SIZE;

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg.startsWith("--seed=")) {
      const value = Number(arg.slice("--seed=".length));
      if (!Number.isInteger(value)) {
        throw new Error("--seed must be an integer.");
      }
      seed = value;
      continue;
    }

    if (arg.startsWith("--batch-size=")) {
      const value = Number(arg.slice("--batch-size=".length));
      if (!Number.isInteger(value) || value < 1 || value > 100) {
        throw new Error("--batch-size must be an integer between 1 and 100.");
      }
      batchSize = value;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    apply,
    seed: seed ?? Date.now(),
    batchSize
  };
}

function printHelp() {
  console.log(`Usage: node scripts/randomizeStoredQuestionOptions.js [--apply] [--seed=123] [--batch-size=50]

Preview a one-time reshuffle of stored question options while preserving the correct answer.

Options:
  --apply           Write the reshuffled options back to Convex.
  --seed=<number>   Use a deterministic seed so preview and apply match.
  --batch-size=<n>  Number of question updates per mutation call (default: 50, max: 100).`);
}

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRng(items, random) {
  const shuffled = items.slice();

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function formatDistribution(counts, total) {
  return counts
    .map((count, index) => {
      const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
      return `${index}:${count} (${percentage}%)`;
    })
    .join(" | ");
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchAllQuestions(client) {
  const tree = await client.query(api.categories.listTree, { enabledOnly: false });
  const byId = new Map();
  const limitHits = [];

  for (const entry of tree) {
    const { category, subcategories } = entry;

    for (const sub of subcategories) {
      for (const difficulty of DIFFICULTIES) {
        const rows = await client.query(api.questions.listByFilter, {
          categoryId: category._id,
          subcategoryId: sub._id,
          difficulty,
          enabledOnly: false,
          limit: 200
        });

        if (rows.length === 200) {
          limitHits.push(`${category.name} > ${sub.name} > ${difficulty}`);
        }

        for (const row of rows) {
          byId.set(String(row._id), row);
        }
      }
    }
  }

  return {
    questions: Array.from(byId.values()),
    limitHits
  };
}

function buildMigrationPlan(questions, seed) {
  const random = createRng(seed);
  const beforeCounts = [0, 0, 0, 0];
  const afterCounts = [0, 0, 0, 0];
  const updates = [];
  const samples = [];
  let changedOrderCount = 0;
  let changedAnswerIndexCount = 0;

  for (const question of questions) {
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      throw new Error(`Question ${question._id} does not have exactly 4 options.`);
    }

    if (!Number.isInteger(question.answerIndex) || question.answerIndex < 0 || question.answerIndex > 3) {
      throw new Error(`Question ${question._id} has an invalid answerIndex.`);
    }

    beforeCounts[question.answerIndex] += 1;

    const decoratedOptions = question.options.map((value, index) => ({
      value,
      originalIndex: index
    }));
    const shuffled = shuffleWithRng(decoratedOptions, random);
    const nextOptions = shuffled.map((item) => item.value);
    const nextAnswerIndex = shuffled.findIndex((item) => item.originalIndex === question.answerIndex);

    afterCounts[nextAnswerIndex] += 1;

    const orderChanged = nextOptions.some((value, index) => value !== question.options[index]);
    const answerIndexChanged = nextAnswerIndex !== question.answerIndex;

    if (orderChanged) {
      changedOrderCount += 1;
    }

    if (answerIndexChanged) {
      changedAnswerIndexCount += 1;
    }

    if (samples.length < 5 && (orderChanged || answerIndexChanged)) {
      samples.push({
        id: String(question._id),
        question: question.question,
        beforeAnswerIndex: question.answerIndex,
        afterAnswerIndex: nextAnswerIndex,
        beforeOptions: question.options,
        afterOptions: nextOptions
      });
    }

    updates.push({
      questionId: question._id,
      options: nextOptions,
      answerIndex: nextAnswerIndex
    });
  }

  return {
    totalQuestions: questions.length,
    beforeCounts,
    afterCounts,
    updates,
    samples,
    changedOrderCount,
    changedAnswerIndexCount
  };
}

async function applyPlan(client, plan, batchSize) {
  const batches = chunk(plan.updates, batchSize);
  let updatedCount = 0;

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const result = await client.mutation(api.questions.bulkReorderOptions, {
      items: batch
    });
    updatedCount += result.updatedCount ?? 0;
    console.log(`Applied batch ${index + 1}/${batches.length}: updated ${result.updatedCount ?? 0} questions`);
  }

  return {
    updatedCount,
    batchCount: batches.length
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = new ConvexHttpClient(CONVEX_URL);

  const { questions, limitHits } = await fetchAllQuestions(client);
  const plan = buildMigrationPlan(questions, options.seed);

  console.log(`Seed: ${options.seed}`);
  console.log(`Questions fetched: ${plan.totalQuestions}`);
  console.log(`Current answerIndex distribution: ${formatDistribution(plan.beforeCounts, plan.totalQuestions)}`);
  console.log(`Planned answerIndex distribution: ${formatDistribution(plan.afterCounts, plan.totalQuestions)}`);
  console.log(`Questions with option order changes: ${plan.changedOrderCount}`);
  console.log(`Questions with answerIndex changes: ${plan.changedAnswerIndexCount}`);

  if (limitHits.length > 0) {
    console.log("Warning: some queries hit the 200-row limit:");
    for (const hit of limitHits) {
      console.log(`- ${hit}`);
    }
  }

  if (plan.samples.length > 0) {
    console.log("Sample changes:");
    for (const sample of plan.samples) {
      console.log(`- ${sample.id} | ${sample.question}`);
      console.log(`  answerIndex ${sample.beforeAnswerIndex} -> ${sample.afterAnswerIndex}`);
      console.log(`  before: ${sample.beforeOptions.join(" | ")}`);
      console.log(`  after:  ${sample.afterOptions.join(" | ")}`);
    }
  }

  if (!options.apply) {
    console.log("Preview only. Re-run with --apply to write these changes to Convex.");
    return;
  }

  const result = await applyPlan(client, plan, options.batchSize);
  console.log(`Finished. Updated ${result.updatedCount} questions in ${result.batchCount} batches.`);
}

main().catch((error) => {
  if (String(error?.message || "").includes("Could not find public function for 'questions:bulkReorderOptions'")) {
    console.error("Convex does not know about questions.bulkReorderOptions yet.");
    console.error("Deploy the updated Convex functions first with `npx convex dev` or `npx convex deploy`, then rerun the script with the same --seed.");
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});
