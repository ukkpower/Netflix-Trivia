import dotenv from "dotenv";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

dotenv.config({ path: ".env.local" });

const CONVEX_URL = process.env.CONVEX_URL;
if (!CONVEX_URL) {
  throw new Error("CONVEX_URL is not set. Ensure .env.local is present.");
}

const QUESTIONS = [
  {
    id: "soccer_club_001",
    category: "Sports",
    subcategory: "Soccer_Club",
    difficulty: "easy",
    general: true,
    question: "Which club is nicknamed 'The Red Devils'?",
    options: ["Liverpool", "Man United", "Arsenal", "Chelsea"],
    answerIndex: 1,
    explanation: "Manchester United are famously known as The Red Devils.",
    tags: ["nickname", "english football"]
  },
  {
    id: "soccer_club_002",
    category: "Sports",
    subcategory: "Soccer_Club",
    difficulty: "easy",
    general: true,
    question: "Which Spanish club plays at Camp Nou?",
    options: ["Real Madrid", "Barcelona", "Valencia", "Sevilla"],
    answerIndex: 1,
    explanation: "Camp Nou has been FC Barcelona's home stadium since 1957.",
    tags: ["stadium", "la liga"]
  },
  {
    id: "soccer_club_003",
    category: "Sports",
    subcategory: "Soccer_Club",
    difficulty: "easy",
    general: true,
    question: "Which club has won the most Premier League titles?",
    options: ["Chelsea", "Arsenal", "Man United", "Man City"],
    answerIndex: 2,
    explanation: "Manchester United dominate the Premier League era in titles won.",
    tags: ["premier league", "titles"]
  },
  {
    id: "soccer_club_004",
    category: "Sports",
    subcategory: "Soccer_Club",
    difficulty: "easy",
    general: true,
    question: "Which Italian club is known as Juventus?",
    options: ["AC Milan", "Inter", "Roma", "Juve"],
    answerIndex: 3,
    explanation: "Juventus are commonly referred to as Juve in Italy and abroad.",
    tags: ["serie a", "club names"]
  },
  {
    id: "soccer_club_005",
    category: "Sports",
    subcategory: "Soccer_Club",
    difficulty: "easy",
    general: true,
    question: "Which club is based at Anfield?",
    options: ["Everton", "Liverpool", "Leeds", "West Ham"],
    answerIndex: 1,
    explanation: "Anfield has been Liverpool FC's home since 1892.",
    tags: ["stadium", "english football"]
  },
  {
    id: "soccer_club_006",
    category: "Sports",
    subcategory: "Soccer_Club",
    difficulty: "medium",
    general: true,
    question: "Which club won the 2023 UEFA Champions League?",
    options: ["Inter", "PSG", "Man City", "Bayern"],
    answerIndex: 2,
    explanation: "Manchester City won their first Champions League in 2023.",
    tags: ["champions league", "europe"]
  },
  {
    id: "soccer_club_007",
    category: "Sports",
    subcategory: "Soccer_Club",
    difficulty: "medium",
    general: true,
    question: "Which club is nicknamed 'The Old Lady'?",
    options: ["AC Milan", "Juventus", "Inter", "Napoli"],
    answerIndex: 1,
    explanation: "Juventus are famously known as La Vecchia Signora.",
    tags: ["nickname", "italian football"]
  },
  {
    id: "soccer_club_008",
    category: "Sports",
    subcategory: "Soccer_Club",
    difficulty: "medium",
    general: false,
    question: "Which club did Cristiano Ronaldo join after leaving Man United in 2022?",
    options: ["PSG", "Al Nassr", "Sporting", "Chelsea"],
    answerIndex: 1,
    explanation: "Ronaldo moved to Saudi club Al Nassr in late 2022.",
    tags: ["transfers", "players"]
  },
  {
    id: "soccer_club_009",
    category: "Sports",
    subcategory: "Soccer_Club",
    difficulty: "medium",
    general: true,
    question: "Which German club is nicknamed 'FC Hollywood'?",
    options: ["Dortmund", "Leverkusen", "Bayern", "Schalke"],
    answerIndex: 2,
    explanation: "Bayern Munich earned the nickname due to media attention and drama.",
    tags: ["bundesliga", "nicknames"]
  },
  {
    id: "soccer_club_010",
    category: "Sports",
    subcategory: "Soccer_Club",
    difficulty: "medium",
    general: false,
    question: "Which club did Pep Guardiola manage before Man City?",
    options: ["Chelsea", "PSG", "Bayern", "Juventus"],
    answerIndex: 2,
    explanation: "Guardiola managed Bayern Munich from 2013 to 2016.",
    tags: ["managers", "careers"]
  },
  {
    id: "soccer_club_011",
    category: "Sports",
    subcategory: "Soccer_Club",
    difficulty: "hard",
    general: false,
    question: "Which club won the first European Cup in 1956?",
    options: ["Benfica", "Milan", "Real Madrid", "Reims"],
    answerIndex: 2,
    explanation: "Real Madrid won the inaugural European Cup in 1956.",
    tags: ["history", "european cup"]
  },
  {
    id: "soccer_club_012",
    category: "Sports",
    subcategory: "Soccer_Club",
    difficulty: "hard",
    general: false,
    question: "Which club completed the first Premier League invincible season?",
    options: ["Chelsea", "Man United", "Arsenal", "Liverpool"],
    answerIndex: 2,
    explanation: "Arsenal went unbeaten in the 2003-04 Premier League season.",
    tags: ["records", "premier league"]
  },
  {
    id: "soccer_club_013",
    category: "Sports",
    subcategory: "Soccer_Club",
    difficulty: "hard",
    general: false,
    question: "Which club won the 2004 Champions League final?",
    options: ["Porto", "Monaco", "Milan", "Chelsea"],
    answerIndex: 0,
    explanation: "Jose Mourinho's Porto won the 2004 final against Monaco.",
    tags: ["champions league", "finals"]
  },
  {
    id: "soccer_club_014",
    category: "Sports",
    subcategory: "Soccer_Club",
    difficulty: "hard",
    general: false,
    question: "Which club is known as 'Los Colchoneros'?",
    options: ["Valencia", "Sevilla", "Atletico", "Villarreal"],
    answerIndex: 2,
    explanation: "Atletico Madrid are nicknamed Los Colchoneros.",
    tags: ["nicknames", "la liga"]
  },
  {
    id: "soccer_club_015",
    category: "Sports",
    subcategory: "Soccer_Club",
    difficulty: "hard",
    general: false,
    question: "Which club did Lionel Messi join in 2023?",
    options: ["PSG", "Barca", "Inter Miami", "Al Hilal"],
    answerIndex: 2,
    explanation: "Messi joined Inter Miami after leaving PSG.",
    tags: ["transfers", "modern football"]
  }
];

const slugify = (input) =>
  input
    .trim()
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

const main = async () => {
  const client = new ConvexHttpClient(CONVEX_URL);

  const categorySlug = slugify("Sports");
  const subcategorySlug = slugify("Soccer Club");

  const tree = await client.query(api.categories.getCategoryTreeBySlug, {
    slug: categorySlug,
    enabledOnly: false
  });

  if (!tree) {
    throw new Error(`Category not found for slug: ${categorySlug}`);
  }

  const subcategory = tree.subcategories.find((sub) =>
    (sub.slug || slugify(sub.name)) === subcategorySlug
  );

  if (!subcategory) {
    throw new Error(`Subcategory not found for slug: ${subcategorySlug}`);
  }

  const existing = await client.query(api.questions.listByFilter, {
    categoryId: tree.category._id,
    subcategoryId: subcategory._id,
    enabledOnly: false,
    limit: 200
  });

  const existingQuestions = new Set(
    existing.map((q) => q.question.trim().toLowerCase())
  );

  const items = QUESTIONS.filter(
    (q) => !existingQuestions.has(q.question.trim().toLowerCase())
  ).map((q) => ({
    categoryId: tree.category._id,
    subcategoryId: subcategory._id,
    difficulty: q.difficulty,
    general: q.general,
    question: q.question,
    options: q.options,
    answerIndex: q.answerIndex,
    explanation: q.explanation,
    tags: q.tags
  }));

  if (items.length === 0) {
    console.log("No new questions to insert.");
    return;
  }

  const result = await client.mutation(api.questions.bulkCreate, { items });

  console.log(`Inserted ${result.insertedCount} questions.`);
  console.log(result.insertedIds);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
