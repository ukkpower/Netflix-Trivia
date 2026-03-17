export const initializePlayer = (playerName) => ({
  name: playerName,
  currentRoundScore: 0,
  totalScore: 0,
  currentRoundAnswers: {},
  endOfRoundRank: null,
  overallRank: null
});

export const hasAnsweredQuestion = (player, questionId) =>
  Object.prototype.hasOwnProperty.call(player.currentRoundAnswers, questionId);

export function calculateRankings(room) {
  const players = Object.entries(room.players);

  const roundRankings = players
    .map(([playerId, player]) => ({
      playerId,
      score: player.currentRoundScore
    }))
    .sort((first, second) => second.score - first.score);

  let currentRank = 1;
  for (let index = 0; index < roundRankings.length; index += 1) {
    if (index > 0 && roundRankings[index].score !== roundRankings[index - 1].score) {
      currentRank = index + 1;
    }
    room.players[roundRankings[index].playerId].endOfRoundRank = currentRank;
  }

  const overallRankings = players
    .map(([playerId, player]) => ({
      playerId,
      score: player.totalScore
    }))
    .sort((first, second) => second.score - first.score);

  currentRank = 1;
  for (let index = 0; index < overallRankings.length; index += 1) {
    if (index > 0 && overallRankings[index].score !== overallRankings[index - 1].score) {
      currentRank = index + 1;
    }
    room.players[overallRankings[index].playerId].overallRank = currentRank;
  }
}

export function isPlayerNameTaken(room, playerName) {
  return Object.values(room.players).some(
    (player) => player.name.toLowerCase().trim() === playerName.toLowerCase().trim()
  );
}

export function addPlayerToRoom(room, playerId, playerName) {
  room.players[playerId] = initializePlayer(playerName);
  return room.players[playerId];
}

export function findPlayerByName(room, playerName) {
  return Object.entries(room.players).find(([, player]) => player.name === playerName);
}

export function reassignPlayerSocket(room, oldSocketId, newSocketId) {
  room.players[newSocketId] = room.players[oldSocketId];
  delete room.players[oldSocketId];
  return room.players[newSocketId];
}

export function resetPlayersForNextRound(room) {
  Object.keys(room.players).forEach((playerId) => {
    room.players[playerId].currentRoundScore = 0;
    room.players[playerId].currentRoundAnswers = {};
    room.players[playerId].endOfRoundRank = null;
  });
}

export function submitPlayerAnswer(room, playerId, submittedQuestionId, submittedAnswer) {
  const player = room.players[playerId];
  if (!player) {
    const error = new Error("Player not found in the room.");
    error.code = "PLAYER_NOT_FOUND";
    throw error;
  }

  const currentQuestionId = room.currentProgress.currentQuestion;
  const currentQuestion = room.currentProgress.roundQuestions[currentQuestionId];
  if (!currentQuestion) {
    const error = new Error("No active question found.");
    error.code = "MISSING_QUESTION";
    throw error;
  }

  if (
    submittedQuestionId !== currentQuestionId ||
    submittedQuestionId !== room.currentProgress.questionId
  ) {
    const error = new Error("Question is no longer active.");
    error.code = "STALE_QUESTION";
    throw error;
  }

  if (!room.currentProgress.questionOpen) {
    const error = new Error("Question is already closed.");
    error.code = "QUESTION_CLOSED";
    throw error;
  }

  if (hasAnsweredQuestion(player, currentQuestionId)) {
    const error = new Error("Answer already submitted for this question.");
    error.code = "ALREADY_ANSWERED";
    throw error;
  }

  const selectedAnswer = currentQuestion.allAnswers[submittedAnswer - 1];
  if (!selectedAnswer) {
    const error = new Error("Invalid answer choice.");
    error.code = "INVALID_ANSWER";
    throw error;
  }

  const isCorrect = selectedAnswer === currentQuestion.correct_answer;
  player.currentRoundAnswers[currentQuestionId] = isCorrect;

  if (isCorrect) {
    player.currentRoundScore += 1;
    player.totalScore += 1;
  }

  return {
    player,
    selectedAnswer,
    isCorrect
  };
}
