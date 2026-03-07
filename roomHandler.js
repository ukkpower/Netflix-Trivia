import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";

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

function slugify(input) {
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

//Generate 6 digit room code
const generateUniqueRoomId = (rooms) => {
  let roomId;
  let exists = true;

  while (exists) {
    roomId = Math.floor(100000 + Math.random() * 900000).toString();
    exists = rooms.has(roomId); // Check if ID exists in the Map
  }

  return roomId;
};

const initializePlayer = (playerName) => ({
  name: playerName,
  currentRoundScore: 0,
  totalScore: 0,
  currentRoundAnswers: {},
  endOfRoundRank: null,
  overallRank: null
});

// Helper function to shuffle an array
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
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

const buildRoundPlan = async (rounds) => {
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

  const normalized = rounds.map(normalizeCategoryValue);
  if (normalized.some((value) => !value)) {
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
  for (const selection of normalized) {
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
};

// Helper function to calculate player rankings
// Calculates both endOfRoundRank (based on currentRoundScore) and overallRank (based on totalScore)
// Handles ties: players with same score get same rank, next rank skips
const calculateRankings = (room) => {
  const players = Object.entries(room.players);
  
  // Calculate End of Round Rankings (based on currentRoundScore)
  const roundRankings = players
    .map(([playerId, player]) => ({
      playerId,
      score: player.currentRoundScore
    }))
    .sort((a, b) => b.score - a.score); // Sort descending by score
  
  let currentRank = 1;
  for (let i = 0; i < roundRankings.length; i++) {
    if (i > 0 && roundRankings[i].score !== roundRankings[i - 1].score) {
      // If score is different from previous, update rank
      currentRank = i + 1;
    }
    room.players[roundRankings[i].playerId].endOfRoundRank = currentRank;
  }
  
  // Calculate Overall Rankings (based on totalScore)
  const overallRankings = players
    .map(([playerId, player]) => ({
      playerId,
      score: player.totalScore
    }))
    .sort((a, b) => b.score - a.score); // Sort descending by score
  
  currentRank = 1;
  for (let i = 0; i < overallRankings.length; i++) {
    if (i > 0 && overallRankings[i].score !== overallRankings[i - 1].score) {
      // If score is different from previous, update rank
      currentRank = i + 1;
    }
    room.players[overallRankings[i].playerId].overallRank = currentRank;
  }
};

// Gets a list of questions from Convex for the next round.
// - Picks the next round from the planned subcategory list
// - Randomizes question order + answer order
// - Stores the current round metadata on the room
const generateRound = async (currentRoundIndex, rounds, mode, questionsPerRound, room) => {
  const difficultyMap = {
    1: "easy",
    2: "medium",
    3: "hard",
    4: "easy" // Assuming 'kids' translates to 'easy'
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

  // Work on a copy so fallback adjustments don't mutate room.rounds.
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
            (sub) => (sub.slug || slugify(sub.name)) === targetSlug
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
          const candidates = tree.subcategories.filter((sub) => sub._id !== round.subcategoryId);
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
      throw new Error(
        `Not enough questions for ${roundLabel} (${rows.length}/${questionsPerRound})`
      );
    }

    shuffleArray(rows);
    const selected = rows.slice(0, questionsPerRound);

    const formattedQuestions = {};
    selected.forEach((questionData, index) => {
      const options = Array.isArray(questionData.options)
        ? questionData.options.slice()
        : [];

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
};

// Called by the Game Master App
// Creates a new game room for the quiz session and add to Rooms
// rounds is passed as an array representing the category selection per round (name or legacy id)
// mode is the level of difficulty of the quiz. (1 = Easy, 2 = Medium, 3 = Hard, 4 = Kids)
const createRoom = async (
  socket,
  rooms,
  questionTimeLimit,
  questionsPerRound,
  rounds,
  mode,
  questionImageBasePath
) => {
  questionTimeLimit = questionTimeLimit !== undefined ? questionTimeLimit : 0;
  questionsPerRound = questionsPerRound !== undefined ? questionsPerRound : 5;
  const DEFAULT_QUESTION_IMAGE_BASE_PATH = "imgs/questions";
  const normalizedQuestionImageBasePath =
    typeof questionImageBasePath === "string" && questionImageBasePath.trim().length > 0
      ? questionImageBasePath.trim()
      : DEFAULT_QUESTION_IMAGE_BASE_PATH;

  const roomId = generateUniqueRoomId(rooms);
  let roundPlan;

  try {
    roundPlan = await buildRoundPlan(rounds);
  } catch (error) {
    console.error("Error building round plan:", error);
    throw new Error("Failed to create room due to round planning error");
  }

  const room = {
    roomId,
    gameMaster: socket.id,
    questionTimeLimit : questionTimeLimit,
    questionPerRound: questionsPerRound,
    mode: mode,
    settings: {
      questionImageBasePath: normalizedQuestionImageBasePath
    },
    rounds: roundPlan,
    players: {
 
    },
    quizStarted: false,
    currentProgress: {
      currentRoundIndex: null,
      currentRound: null,
      currentQuestion: 1,
      roundQuestions: null
    }
  };

  // Generate the first round of questions and update the room object
  try {
    const roundQuestions = await generateRound(
      room.currentProgress.currentRoundIndex,
      room.rounds,
      mode,
      questionsPerRound,
      room
    );
    room.currentProgress.roundQuestions = roundQuestions; // Update roundQuestions in the room object
  } catch (error) {
    console.error("Error generating round questions:", error);
    throw new Error("Failed to create room due to question generation error");
  }

  rooms.set(roomId, room); // Add the room to the Map
  socket.join(roomId); // Join the socket to the room

  console.log(`Room created: ${roomId} (Total rooms: ${rooms.size})`); // Log room creation

  return room;
};

const roomHandler = (io, socket, rooms) => {
  const deleteRoom = (roomId) => {
    const room = rooms.get(roomId);

    if (!room) {
      return null;
    }

    io.to(roomId).emit("room:deleted", { roomId });
    io.in(roomId).socketsLeave(roomId);
    rooms.delete(roomId);

    console.log(`Room deleted: ${roomId} (Total rooms: ${rooms.size})`);

    return room;
  };

  const create = async (payload, callback) => {

    try {
      const newRoom = await createRoom(
        socket,
        rooms,
        payload.questionTimeLimit,
        payload.questionPerRound,
        payload.rounds,
        payload.mode,
        payload.questionImageBasePath
      );
      callback(null, newRoom);
    } catch (error) {
      console.error("Error creating room:", error);
      callback({ error: "Failed to create room" });
    }
  };

  const removeRoom = (payload, callback) => {
    const roomId = payload?.roomId;

    if (!roomId) {
      return callback({ error: true, message: "Room ID is required" });
    }

    const room = rooms.get(roomId);
    if (!room) {
      return callback({ error: true, message: "Room not found" });
    }

    if (room.gameMaster !== socket.id) {
      return callback({ error: true, message: "Only the game master can delete this room" });
    }

    deleteRoom(roomId);
    return callback(null, { roomId });
  };

  const startQuiz = (payload, callback) => {
    const room = rooms.get(payload.roomId); // Get the room from the Map
    if (room) {

      // Check if there is at least one player in the room
      const playerCount = Object.keys(room.players).length;
      if (playerCount === 0) {
        return callback({ error: "Cannot start quiz: No players in the room" });
      }

      room.quizStarted = true; // Mark Quiz as started

      // Notify all players in the room that the quiz has started
      io.to(room.roomId).emit("quiz:started", { message: "The quiz has started!" });

      console.log ("Quiz started");
      return callback(null, "Quiz started successfully");

    }
    
    return callback("error: room not found"); // Return error message if room is not found
  }

  const playerJoin = (payload, callback) => {
    const room = rooms.get(payload.roomId); // Get the room from the Map
    if (room) {

      // Check if the quiz has already started
      if (room.quizStarted) {
        return callback({ error: true, message: "Quiz has already started. No new players can join." });
      }

      if (room.players[socket.id]) {
        return callback(null, room); // Player is already in the room
      }
      
      // Check if player name already exists in room (case-insensitive)
      const nameExists = Object.values(room.players).some(
        player => player.name.toLowerCase().trim() === payload.name.toLowerCase().trim()
      );
      if (nameExists) {
        return callback({ error: true, message: "Name already taken. Please choose a different name." });
      }
      
      // Add the new player to the room
      room.players[socket.id] = initializePlayer(payload.name);
      socket.join(room.roomId);

      // Notify the Game Master specifically of the new player's name
      io.to(room.gameMaster).emit("player:joined", { 
        name: payload.name,
        room: room // Send the updated room object to the game master
      });

      console.log(`Player joined room: ${room.roomId}`);
      return callback(null, room);

    }

    // Handle the case where the room does not exist
    console.error(`Room not found or not joinable: ${payload.roomId}`);
    return callback({ error: true, message: "Room not found or not joinable" });
  };

  // Handle player reconnection - reassigns old player data to new socket.id
  const playerRejoin = (payload, callback) => {
    const room = rooms.get(payload.roomId);
    if (!room) {
      console.error(`Room not found for rejoin: ${payload.roomId}`);
      return callback({ error: true, message: "Room not found" });
    }

    const oldSocketId = payload.oldSocketId;
    const playerName = payload.name;

    // Check if old player data exists
    if (oldSocketId && room.players[oldSocketId]) {
      // Found old player data - reassign to new socket.id
      console.log(`Reassigning player ${playerName} from ${oldSocketId} to ${socket.id}`);
      
      // Copy player data to new socket.id
      room.players[socket.id] = room.players[oldSocketId];
      
      // Remove old socket.id entry
      delete room.players[oldSocketId];
      
      // Join the room with new socket
      socket.join(room.roomId);
      
      // Leave the old room (if socket still exists)
      if (io.sockets.sockets.has(oldSocketId)) {
        io.sockets.sockets.get(oldSocketId).leave(room.roomId);
      }

      // Notify the Game Master that player reconnected with new socket.id
      io.to(room.gameMaster).emit("player:reconnected", {
        oldSocketId: oldSocketId,
        newSocketId: socket.id,
        playerName: playerName,
        room: room
      });

      console.log(`Player ${playerName} reconnected and reassigned from ${oldSocketId} to ${socket.id}`);
      return callback(null, room);
    }

    // If old socket.id not found, try to find by name (fallback)
    const existingPlayer = Object.entries(room.players).find(
      ([id, player]) => player.name === playerName
    );

    if (existingPlayer) {
      const [oldId, playerData] = existingPlayer;
      console.log(`Found player ${playerName} by name, reassigning from ${oldId} to ${socket.id}`);
      
      // Copy player data to new socket.id
      room.players[socket.id] = playerData;
      
      // Remove old socket.id entry
      delete room.players[oldId];
      
      // Join the room with new socket
      socket.join(room.roomId);
      
      // Leave the old room (if socket still exists)
      if (io.sockets.sockets.has(oldId)) {
        io.sockets.sockets.get(oldId).leave(room.roomId);
      }

      // Notify the Game Master that player reconnected with new socket.id
      io.to(room.gameMaster).emit("player:reconnected", {
        oldSocketId: oldId,
        newSocketId: socket.id,
        playerName: playerName,
        room: room
      });

      console.log(`Player ${playerName} reconnected and reassigned from ${oldId} to ${socket.id}`);
      return callback(null, room);
    }

    // If quiz hasn't started, allow them to join as new player (but check name uniqueness)
    if (!room.quizStarted) {
      // Check if player name already exists in room (case-insensitive)
      const nameExists = Object.values(room.players).some(
        player => player.name.toLowerCase().trim() === playerName.toLowerCase().trim()
      );
      if (nameExists) {
        return callback({ error: true, message: "Name already taken. Please choose a different name." });
      }
      
      console.log(`Player ${playerName} not found, joining as new player`);
      return playerJoin(payload, callback);
    }

    // Quiz has started and player not found - can't rejoin
    console.error(`Player ${playerName} not found in room ${payload.roomId} and quiz has started`);
    return callback({ error: true, message: "Player not found in room. Quiz has already started." });
  };

  // Game master will call this function
  // room id will be passed as a paramater
  // question id will be passed as a paramater
  // the currentQuestion: 1, in currentProgress of the room object will be updated by the new question id
  // notify all players of the new question id
  const nextQuestion = (payload, callback) => {
    const room = rooms.get(payload.roomId); // Get the room from the Map
    if (room) {
      // Update the currentQuestion in the room object
      room.currentProgress.currentQuestion = payload.questionId;
  
      // Notify all players in the room about the new question ID
      io.to(room.roomId).emit("quiz:nextQuestion", { 
        questionId: payload.questionId 
      });
  
      console.log(`Question updated to: ${payload.questionId} in room: ${room.roomId}`);
      return callback(null, room);
    }
  
    // Handle the case where the room does not exist
    console.error(`Room not found nextQuestion: ${payload.roomId}`);
    return callback({ error: true, message: "Room not found" });
  }

  const endOfRound = (payload, callback) => {
    const room = rooms.get(payload.roomId); // Retrieve the room from the Map
    if (room) {
      // Calculate rankings before returning room object
      calculateRankings(room);
      
      // Send each player their own player data
      Object.keys(room.players).forEach((playerId) => {
        io.to(playerId).emit("quiz:endOfRound", {
          message: "The round has ended.",
          roomId: room.roomId,
          playerData: room.players[playerId]
        });
      });
      console.log(`End of round broadcasted in room: ${room.roomId}`);
      return callback(null, room); // Return the updated room object
    } else {
      console.error(`Room not found endOfRound: ${payload.roomId}`);
      return callback({ error: true, message: "Room not found" });
    }
  };  

  const nextRound = async (payload, callback) => {
    const room = rooms.get(payload.roomId); // Get the room from the Map
    if (room) {
      try {
        console.log("Next Round")
        // Generate the next round of questions
        const roundQuestions = await generateRound(
          room.currentProgress.currentRoundIndex,
          room.rounds,
          room.mode,
          room.questionPerRound,
          room
        );
  
        // Update the room object with the new round data
        room.currentProgress.roundQuestions = roundQuestions;
        room.currentProgress.currentQuestion = 1; // Reset the question index

        // Reset each player's current round score and per-question tracking
        Object.keys(room.players).forEach((playerId) => {
          room.players[playerId].currentRoundScore = 0;
          room.players[playerId].currentRoundAnswers = {};
          room.players[playerId].endOfRoundRank = null; // Reset round rank for new round
          // overallRank is kept as is (carries over between rounds)
        });

        // Notify all players in the room that the quiz has started
        io.to(room.roomId).emit("quiz:roundStart", { message: "New round started!" });
  
        // Return the updated room object
        return callback(null, room);
      } catch (error) {
        console.error("Error generating next round:", error);
        return callback({ error: "Failed to generate next round" });
      }
    }
  
    // Handle the case where the room does not exist
    console.error(`Room not found nextRound: ${payload.roomId}`);
    return callback({ error: true, message: "Room not found" });
  };

  const submitAnswer = (payload, callback) => {
    const room = rooms.get(payload.roomId); // Get the room from the Map
    if (room) {
      const player = room.players[socket.id]; // Get the player's data
      if (!player) {
        console.log("Player not found in the room.");
        return callback({ error: true, message: "Player not found in the room." });
      }
  
      const currentQid = room.currentProgress.currentQuestion;
      const currentQuestion = room.currentProgress.roundQuestions[currentQid];
      if (!currentQuestion) {
        return callback({ error: true, message: "No active question found." });
      }
  
      // Check if the answer is correct
      const correctAnswer = currentQuestion.correct_answer;
      const playerAnswer = payload.answer; // Assuming payload.answer is 1-4 (A-D)
  
      // Map the player's answer to the actual answer text
      const selectedAnswer = currentQuestion.allAnswers[playerAnswer - 1]; // Adjust for 0-based index

      const isCorrect = selectedAnswer === correctAnswer;
      // Record the answer for the current question:
      player.currentRoundAnswers[currentQid] = isCorrect;
  
      if (selectedAnswer === correctAnswer) {
        // Update the player's scores
        player.currentRoundScore += 1;
        player.totalScore += 1;
      }
  
      // Notify the game master that the player has answered
      io.to(room.gameMaster).emit("playerAnswered", {
        playerId: socket.id,
        playerName: player.name,
        answer: selectedAnswer,
        isCorrect: selectedAnswer === correctAnswer
      });
  
      console.log(`Player ${player.name} answered: ${selectedAnswer} (Correct: ${selectedAnswer === correctAnswer})`);
      return callback(null, { message: "Answer submitted successfully." });
    }
  
    // Handle the case where the room does not exist
    console.error(`Room not found submitAnswer: ${payload.roomId}`);
    return callback({ error: true, message: "Room not found" });
  };

  const endOfGame = (payload, callback) => {
    const room = rooms.get(payload.roomId); // Retrieve the room from the Map
    if (room) {
      // Calculate rankings before returning room object
      calculateRankings(room);
      
      // Send each player their own player data
      Object.keys(room.players).forEach((playerId) => {
        io.to(playerId).emit("quiz:endOfGame", {
          message: "The game has ended.",
          roomId: room.roomId,
          playerData: room.players[playerId]
        });
      });
      console.log(`End-of-game broadcasted in room: ${room.roomId}`);
      callback(null, room); // Return the updated room object
      deleteRoom(room.roomId);
      return;
    } else {
      console.error(`Room not found endOfGame: ${payload.roomId}`);
      return callback({ error: true, message: "Room not found" });
    }
  };  

  socket.on("room:create", create);
  socket.on("room:delete", removeRoom);
  socket.on("quiz:start", startQuiz);
  socket.on("player:join", playerJoin);
  socket.on("player:rejoin", playerRejoin);
  socket.on("quiz:nextQuestion", nextQuestion);
  socket.on("quiz:endOfRound", endOfRound);
  socket.on("quiz:nextRound", nextRound);
  socket.on("submitAnswer", submitAnswer);
  socket.on("quiz:endOfGame", endOfGame);

  // Handle player disconnection - keep player data but mark as disconnected
  socket.on("disconnect", () => {
    // Find all rooms this socket was in and keep player data
    // Player data is kept so they can reconnect with their old socket.id
    for (const [roomId, room] of rooms.entries()) {
      if (room.players[socket.id]) {
        console.log(`Player ${room.players[socket.id].name} disconnected from room ${roomId}, keeping player data for reconnection`);
        // Player data stays in room.players[socket.id] for potential reconnection
        // The socket will leave the room automatically
      }
    }
  });

};

export default roomHandler;
