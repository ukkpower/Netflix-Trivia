import axios from "axios"; // Use axios for making HTTP requests

const categories = {
  "9": "General Knowledge",
  "10": "Entertainment: Books",
  "11": "Entertainment: Film",
  "12": "Entertainment: Music",
  "13": "Entertainment: Musicals & Theatres",
  "14": "Entertainment: Television",
  "15": "Entertainment: Video Games",
  "16": "Entertainment: Board Games",
  "17": "Science & Nature",
  "18": "Science: Computers",
  "19": "Science: Mathematics",
  "20": "Mythology",
  "21": "Sports",
  "22": "Geography",
  "23": "History",
  "24": "Politics",
  "25": "Art",
  "26": "Celebrities",
  "27": "Animals",
  "28": "Vehicles",
  "29": "Entertainment: Comics",
  "30": "Science: Gadgets",
  "31": "Entertainment: Japanese Anime & Manga",
  "32": "Entertainment: Cartoon & Animations"
};

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

// Gets a list of questions from Open Trivia Database
// First it must determine what the next category id is from the rounds array
// Mode parameter is difficulty level
// All question types are multiple choice
// If currentRound is null then use the first entry in the array
// Else if currentRound is a value then find its position in the array and get the next
// If currentRound is alreay at the end of the array the return "end of round"
// When the Open Trivia json is returned simply its format starting at 1 for the first question eg 1: {question":"In the server hosting industry IaaS stands for...","correct_answer":"Infrastructure as a Service","incorrect_answers":["Internet as a Service","Internet and a Server","Infrastructure as a Server"}
// Return the quesions for easy access latter in the currentProgress
const generateRound = async (currentRound, rounds, mode, questionsPerRound, room) => {
  // Map mode to difficulty levels
  const difficultyMap = {
    1: "easy",
    2: "medium",
    3: "hard",
    4: "easy" // Assuming 'kids' translates to 'easy'
  };

  // Determine the difficulty level
  const difficulty = difficultyMap[mode] || "easy";

  // Determine the next category ID
  let nextCategoryId;
  if (currentRound === null) {
    nextCategoryId = rounds[0]; // Use the first entry if currentRound is null
  } else {
    const currentIndex = rounds.indexOf(currentRound);
    if (currentIndex >= 0 && currentIndex < rounds.length - 1) {
      nextCategoryId = rounds[currentIndex + 1]; // Get the next category
    } else {
      return "end of round"; // Reached the end of the array
    }
  }

  // Fetch questions from the Open Trivia API
  try {
    const response = await axios.get(
      `https://opentdb.com/api.php?amount=${questionsPerRound}&category=${nextCategoryId}&difficulty=${difficulty}&type=multiple`
    );

    const { results } = response.data;

    // Format the questions and shuffle the answers
    const formattedQuestions = {};
    results.forEach((questionData, index) => {
      const allAnswers = [
        questionData.correct_answer,
        ...questionData.incorrect_answers
      ];
      shuffleArray(allAnswers); // Shuffle the answers

      formattedQuestions[index + 1] = {
        question: questionData.question,
        correct_answer: questionData.correct_answer,
        allAnswers: allAnswers // Store the shuffled answers
      };
    });

    room.currentProgress.currentRound = nextCategoryId;

    // Return the formatted questions
    return formattedQuestions;

  } catch (error) {
    console.error("Error fetching questions from Open Trivia API:", error);
    throw new Error("Failed to generate round questions");
  }
};

// Called by the Game Master App
// Creates a new game room for the quiz session and add to Rooms
// rounds is passed as an array representing the category id of the round eg. [10, 10, 12, 30, 9, 12]
// mode is the level of difficulty of the quiz. (1 = Easy, 2 = Medium, 3 = Hard, 4 = Kids)
const createRoom = async (socket, rooms, questionTimeLimit, questionsPerRound, rounds, mode) => {
  questionTimeLimit = questionTimeLimit !== undefined ? questionTimeLimit : 0;
  questionsPerRound = questionsPerRound !== undefined ? questionsPerRound : 5;

  const roomId = generateUniqueRoomId(rooms);

  const room = {
    roomId,
    gameMaster: socket.id,
    questionTimeLimit : questionTimeLimit,
    questionPerRound: questionsPerRound,
    mode: mode,
    rounds: rounds,
    players: {
 
    },
    quizStarted: false,
    currentProgress: {
      currentRound: null,
      currentQuestion: 1,
      roundQuestions: null
    }
  };

  // Generate the first round of questions and update the room object
  try {
    const roundQuestions = await generateRound(null, rounds, mode, questionsPerRound, room);
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
  const create = async (payload, callback) => {

    try {
      const newRoom = await createRoom(
        socket,
        rooms,
        payload.questionTimeLimit,
        payload.questionPerRound,
        payload.rounds,
        payload.mode
      );
      callback(null, newRoom);
    } catch (error) {
      console.error("Error creating room:", error);
      callback({ error: "Failed to create room" });
    }
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
          room.currentProgress.currentRound,
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
      return callback(null, room); // Return the updated room object
    } else {
      console.error(`Room not found endOfGame: ${payload.roomId}`);
      return callback({ error: true, message: "Room not found" });
    }
  };  

  socket.on("room:create", create);
  socket.on("quiz:start", startQuiz);
  socket.on("player:join", playerJoin);
  socket.on("quiz:nextQuestion", nextQuestion);
  socket.on("quiz:endOfRound", endOfRound);
  socket.on("quiz:nextRound", nextRound);
  socket.on("submitAnswer", submitAnswer);
  socket.on("quiz:endOfGame", endOfGame);

};

export default roomHandler;
