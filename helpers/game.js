import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const LEGACY_CATEGORY_ID_TO_NAME = {
  9: "General",
  10: "Entertainment",
  17: "Science",
  20: "Mythology",
  21: "Sports",
  22: "Geography",
  23: "History",
  24: "Politics",
  32: "Decades"
};

const SPECIAL_CATEGORY_RULES = {
  general: { type: "general" },
  general_knowledge: { type: "general" }
};

let convexClient = null;

const getConvexClient = () => {
  if (convexClient) {
    return convexClient;
  }

  const url = process.env.CONVEX_URL;
  if (!url) {
    throw new Error("CONVEX_URL is not set. Add it to your environment variables.");
  }

  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available. Use Node 18+ or add a fetch polyfill.");
  }

  convexClient = new ConvexHttpClient(url);
  return convexClient;
};

export function slugify(input) {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return slug.length > 0 ? slug : "untitled";
}

function normalizeCategoryValue(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (/^\d+$/.test(trimmed)) {
      return LEGACY_CATEGORY_ID_TO_NAME[Number(trimmed)] || null;
    }
    return trimmed;
  }

  if (typeof value === "number") {
    return LEGACY_CATEGORY_ID_TO_NAME[value] || null;
  }

  if (value && typeof value === "object") {
    if (typeof value.category === "string") {
      return value.category.trim();
    }
    if (typeof value.categoryName === "string") {
      return value.categoryName.trim();
    }
    if (typeof value.slug === "string") {
      return value.slug.trim();
    }
  }

  return null;
}

export function shuffleArray(array) {
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }
}

const createPool = (items) => {
  const pool = items.slice();
  shuffleArray(pool);
  return { pool, index: 0 };
};

const pickFromPool = (poolState) => {
  if (!poolState || poolState.pool.length === 0) {
    return null;
  }

  if (poolState.index >= poolState.pool.length) {
    shuffleArray(poolState.pool);
    poolState.index = 0;
  }

  const item = poolState.pool[poolState.index];
  poolState.index += 1;
  return item;
};

export async function buildRoundPlan(rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) {
    throw new Error("rounds must be a non-empty array");
  }

  if (
    rounds.every(
      (round) => round && typeof round === "object" && round.subcategoryId && round.categoryId
    )
  ) {
    return rounds;
  }

  const normalizedSelections = rounds.map(normalizeCategoryValue);
  if (normalizedSelections.some((value) => !value)) {
    throw new Error("Invalid category selection in rounds");
  }

  const convex = getConvexClient();
  const categoryCache = new Map();
  const subsetPoolCache = new Map();
  let generalCategoryPoolState = null;

  const getCategoryData = async (categorySlug) => {
    if (categoryCache.has(categorySlug)) {
      return categoryCache.get(categorySlug);
    }

    const tree = await convex.query(api.categories.getCategoryTreeBySlug, {
      slug: categorySlug,
      enabledOnly: true
    });

    if (!tree) {
      throw new Error(`Category not found: ${categorySlug}`);
    }

    if (!tree.subcategories || tree.subcategories.length === 0) {
      throw new Error(`No subcategories found for category: ${tree.category.name}`);
    }

    const entry = {
      category: tree.category,
      subcategories: tree.subcategories,
      poolState: createPool(tree.subcategories)
    };

    categoryCache.set(categorySlug, entry);
    return entry;
  };

  const getGeneralCategoryPool = async () => {
    if (generalCategoryPoolState) {
      return generalCategoryPoolState;
    }

    const tree = await convex.query(api.categories.listTree, { enabledOnly: true });
    const categories = tree.map((entry) => entry.category);

    if (categories.length === 0) {
      throw new Error("No categories available for General rounds");
    }

    generalCategoryPoolState = createPool(categories);
    return generalCategoryPoolState;
  };

  const getSubsetPool = async (ruleKey, rule) => {
    if (subsetPoolCache.has(ruleKey)) {
      return subsetPoolCache.get(ruleKey);
    }

    const parent = await getCategoryData(rule.categorySlug);
    const allowed = new Set(rule.subcategorySlugs || []);

    const filtered = parent.subcategories.filter((subcategory) => {
      const slug = subcategory.slug || slugify(subcategory.name);
      return allowed.has(slug);
    });

    if (filtered.length === 0) {
      throw new Error(`No subcategories matched for ${ruleKey}`);
    }

    const entry = {
      category: parent.category,
      subcategories: filtered,
      poolState: createPool(filtered)
    };

    subsetPoolCache.set(ruleKey, entry);
    return entry;
  };

  const makeRound = (category, subcategory, generalOnly = false) => ({
    categoryId: category._id,
    categoryName: category.name,
    categorySlug: category.slug || slugify(category.name),
    subcategoryId: subcategory ? subcategory._id : undefined,
    subcategoryName: subcategory ? subcategory.name : undefined,
    subcategorySlug: subcategory ? subcategory.slug || slugify(subcategory.name) : undefined,
    generalOnly
  });

  const plan = [];

  for (const selection of normalizedSelections) {
    const selectionSlug = slugify(selection);
    const rule = SPECIAL_CATEGORY_RULES[selectionSlug];

    if (rule && rule.type === "general") {
      const categoryPool = await getGeneralCategoryPool();
      const category = pickFromPool(categoryPool);
      if (!category) {
        throw new Error("No categories available for General rounds");
      }
      plan.push(makeRound(category, null, true));
      continue;
    }

    if (rule && rule.type === "subset") {
      const subset = await getSubsetPool(selectionSlug, rule);
      const subcategory = pickFromPool(subset.poolState);
      if (!subcategory) {
        throw new Error(`No subcategories available for ${selection}`);
      }
      plan.push(makeRound(subset.category, subcategory));
      continue;
    }

    const categoryData = await getCategoryData(selectionSlug);
    const subcategory = pickFromPool(categoryData.poolState);
    if (!subcategory) {
      throw new Error(`No subcategories available for ${categoryData.category.name}`);
    }
    plan.push(makeRound(categoryData.category, subcategory));
  }

  return plan;
}

export async function generateRound(currentRoundIndex, rounds, mode, questionsPerRound, room) {
  const difficultyMap = {
    1: "easy",
    2: "medium",
    3: "hard",
    4: "easy"
  };

  const difficulty = difficultyMap[mode] || "easy";

  const nextRoundIndex =
    currentRoundIndex === null || currentRoundIndex === undefined
      ? 0
      : currentRoundIndex + 1;

  if (nextRoundIndex < 0 || nextRoundIndex >= rounds.length) {
    return "end of round";
  }

  const plannedRound = rounds[nextRoundIndex];
  if (!plannedRound) {
    throw new Error(`Round not found at index ${nextRoundIndex}`);
  }

  const round = { ...plannedRound };
  const convex = getConvexClient();

  try {
    const fetchLimit = Math.min(Math.max(questionsPerRound * 4, questionsPerRound), 200);
    const queryArgs = {
      categoryId: round.categoryId,
      difficulty,
      enabledOnly: true,
      limit: fetchLimit
    };

    if (!round.generalOnly && round.subcategoryId) {
      queryArgs.subcategoryId = round.subcategoryId;
    }

    if (round.generalOnly) {
      queryArgs.generalOnly = true;
    }

    let rows = await convex.query(api.questions.listByFilter, queryArgs);

    if (rows.length < questionsPerRound && !round.generalOnly && round.subcategoryId) {
      const categorySlug = round.categorySlug || slugify(round.categoryName || "");
      const tree = await convex.query(api.categories.getCategoryTreeBySlug, {
        slug: categorySlug,
        enabledOnly: true
      });

      if (tree && Array.isArray(tree.subcategories)) {
        if (rows.length === 0 && round.subcategoryName) {
          const targetSlug = slugify(round.subcategoryName);
          const match = tree.subcategories.find(
            (subcategory) => (subcategory.slug || slugify(subcategory.name)) === targetSlug
          );

          if (match && match._id !== round.subcategoryId) {
            const candidateRows = await convex.query(api.questions.listByFilter, {
              categoryId: round.categoryId,
              subcategoryId: match._id,
              difficulty,
              enabledOnly: true,
              limit: fetchLimit
            });

            if (candidateRows.length > 0) {
              round.subcategoryId = match._id;
              round.subcategoryName = match.name;
              round.subcategorySlug = match.slug || slugify(match.name);
              rows = candidateRows;
            }
          }
        }

        if (rows.length < questionsPerRound) {
          const candidates = tree.subcategories.filter(
            (subcategory) => subcategory._id !== round.subcategoryId
          );
          shuffleArray(candidates);

          for (const candidate of candidates) {
            const candidateRows = await convex.query(api.questions.listByFilter, {
              categoryId: round.categoryId,
              subcategoryId: candidate._id,
              difficulty,
              enabledOnly: true,
              limit: fetchLimit
            });

            if (candidateRows.length >= questionsPerRound) {
              round.subcategoryId = candidate._id;
              round.subcategoryName = candidate.name;
              round.subcategorySlug = candidate.slug || slugify(candidate.name);
              rows = candidateRows;
              break;
            }
          }
        }
      }
    }

    if (rows.length < questionsPerRound) {
      const roundLabel = round.subcategoryName || round.categoryName;
      throw new Error(`Not enough questions for ${roundLabel} (${rows.length}/${questionsPerRound})`);
    }

    shuffleArray(rows);
    const selectedQuestions = rows.slice(0, questionsPerRound);
    const formattedQuestions = {};

    selectedQuestions.forEach((questionData, index) => {
      const options = Array.isArray(questionData.options) ? questionData.options.slice() : [];

      if (options.length !== 4) {
        throw new Error(`Invalid options count for question: ${questionData._id}`);
      }

      const correctAnswer = options[questionData.answerIndex];
      if (typeof correctAnswer !== "string") {
        throw new Error(`Invalid answerIndex for question: ${questionData._id}`);
      }

      shuffleArray(options);

      formattedQuestions[index + 1] = {
        question: questionData.question,
        correct_answer: correctAnswer,
        allAnswers: options,
        imageName: questionData.imageName ?? null
      };
    });

    room.currentProgress.currentRoundIndex = nextRoundIndex;
    room.currentProgress.currentRound = round;

    return formattedQuestions;
  } catch (error) {
    console.error("Error fetching questions from Convex:", error);
    throw new Error("Failed to generate round questions");
  }
}

export function startQuizProgress(room) {
  room.quizStarted = true;
  room.currentProgress.currentQuestion = 1;
  room.currentProgress.questionId = 1;
  room.currentProgress.questionOpen = true;
}

export function setCurrentQuestion(room, questionId) {
  room.currentProgress.currentQuestion = questionId;
  room.currentProgress.questionId = questionId;
  room.currentProgress.questionOpen = true;
}

export function closeCurrentQuestion(room, requestedQuestionId, reason) {
  const activeQuestionId = room.currentProgress.currentQuestion;

  if (requestedQuestionId !== activeQuestionId) {
    const error = new Error("Question is no longer active");
    error.code = "INVALID_QUESTION";
    throw error;
  }

  if (!["all_answered", "timeout"].includes(reason)) {
    const error = new Error("Invalid close reason");
    error.code = "INVALID_REASON";
    throw error;
  }

  if (!room.currentProgress.questionOpen) {
    return {
      questionId: activeQuestionId,
      reason,
      alreadyClosed: true,
      autoLockedPlayers: []
    };
  }

  room.currentProgress.questionOpen = false;

  const autoLockedPlayers = [];

  if (reason === "timeout") {
    Object.entries(room.players).forEach(([playerId, player]) => {
      if (Object.prototype.hasOwnProperty.call(player.currentRoundAnswers, activeQuestionId)) {
        return;
      }

      player.currentRoundAnswers[activeQuestionId] = false;
      autoLockedPlayers.push({
        playerId,
        playerName: player.name
      });
    });
  }

  return {
    questionId: activeQuestionId,
    reason,
    alreadyClosed: false,
    autoLockedPlayers
  };
}
