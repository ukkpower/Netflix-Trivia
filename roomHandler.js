import {
  closeCurrentQuestion,
  generateRound,
  setCurrentQuestion,
  startQuizProgress
} from "./helpers/game.js";
import {
  addPlayerToRoom,
  calculateRankings,
  findPlayerByName,
  isPlayerNameTaken,
  reassignPlayerSocket,
  resetPlayersForNextRound,
  submitPlayerAnswer
} from "./helpers/player.js";
import { createRoom, deleteRoom } from "./helpers/room.js";

const roomHandler = (io, socket, rooms) => {
  const create = async (payload, callback) => {
    try {
      const newRoom = await createRoom(
        socket,
        rooms,
        payload.answerTimerEnabled,
        payload.answerTimerSeconds,
        payload.questionPerRound,
        payload.rounds,
        payload.mode,
        payload.questionImageBasePath,
        payload.questionTimeLimit
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

    deleteRoom(io, rooms, roomId);
    return callback(null, { roomId });
  };

  const startQuiz = (payload, callback) => {
    const room = rooms.get(payload.roomId);
    if (room) {
      const playerCount = Object.keys(room.players).length;
      if (playerCount === 0) {
        return callback({ error: "Cannot start quiz: No players in the room" });
      }

      startQuizProgress(room);
      io.to(room.roomId).emit("quiz:started", { message: "The quiz has started!" });

      console.log("Quiz started");
      return callback(null, "Quiz started successfully");
    }

    return callback("error: room not found");
  };

  const playerJoin = (payload, callback) => {
    const room = rooms.get(payload.roomId);
    if (room) {
      if (room.quizStarted) {
        return callback({
          error: true,
          message: "Quiz has already started. No new players can join."
        });
      }

      if (room.players[socket.id]) {
        return callback(null, room);
      }

      if (isPlayerNameTaken(room, payload.name)) {
        return callback({
          error: true,
          message: "Name already taken. Please choose a different name."
        });
      }

      addPlayerToRoom(room, socket.id, payload.name);
      socket.join(room.roomId);

      io.to(room.gameMaster).emit("player:joined", {
        name: payload.name,
        room
      });

      console.log(`Player joined room: ${room.roomId}`);
      return callback(null, room);
    }

    console.error(`Room not found or not joinable: ${payload.roomId}`);
    return callback({ error: true, message: "Room not found or not joinable" });
  };

  const playerRejoin = (payload, callback) => {
    const room = rooms.get(payload.roomId);
    if (!room) {
      console.error(`Room not found for rejoin: ${payload.roomId}`);
      return callback({ error: true, message: "Room not found" });
    }

    const oldSocketId = payload.oldSocketId;
    const playerName = payload.name;

    if (oldSocketId && room.players[oldSocketId]) {
      console.log(`Reassigning player ${playerName} from ${oldSocketId} to ${socket.id}`);

      reassignPlayerSocket(room, oldSocketId, socket.id);
      socket.join(room.roomId);

      if (io.sockets.sockets.has(oldSocketId)) {
        io.sockets.sockets.get(oldSocketId).leave(room.roomId);
      }

      io.to(room.gameMaster).emit("player:reconnected", {
        oldSocketId,
        newSocketId: socket.id,
        playerName,
        room
      });

      console.log(
        `Player ${playerName} reconnected and reassigned from ${oldSocketId} to ${socket.id}`
      );
      return callback(null, room);
    }

    const existingPlayer = findPlayerByName(room, playerName);

    if (existingPlayer) {
      const [existingSocketId] = existingPlayer;
      console.log(
        `Found player ${playerName} by name, reassigning from ${existingSocketId} to ${socket.id}`
      );

      reassignPlayerSocket(room, existingSocketId, socket.id);
      socket.join(room.roomId);

      if (io.sockets.sockets.has(existingSocketId)) {
        io.sockets.sockets.get(existingSocketId).leave(room.roomId);
      }

      io.to(room.gameMaster).emit("player:reconnected", {
        oldSocketId: existingSocketId,
        newSocketId: socket.id,
        playerName,
        room
      });

      console.log(
        `Player ${playerName} reconnected and reassigned from ${existingSocketId} to ${socket.id}`
      );
      return callback(null, room);
    }

    if (!room.quizStarted) {
      if (isPlayerNameTaken(room, playerName)) {
        return callback({
          error: true,
          message: "Name already taken. Please choose a different name."
        });
      }

      console.log(`Player ${playerName} not found, joining as new player`);
      return playerJoin(payload, callback);
    }

    console.error(`Player ${playerName} not found in room ${payload.roomId} and quiz has started`);
    return callback({
      error: true,
      message: "Player not found in room. Quiz has already started."
    });
  };

  const nextQuestion = (payload, callback) => {
    const room = rooms.get(payload.roomId);
    if (room) {
      const nextQuestionId = Number(payload.questionId);
      if (!Number.isInteger(nextQuestionId) || nextQuestionId < 1) {
        return callback({ error: true, message: "Invalid question ID" });
      }

      setCurrentQuestion(room, nextQuestionId);

      io.to(room.roomId).emit("quiz:nextQuestion", {
        questionId: nextQuestionId
      });

      console.log(`Question updated to: ${nextQuestionId} in room: ${room.roomId}`);
      return callback(null, room);
    }

    console.error(`Room not found nextQuestion: ${payload.roomId}`);
    return callback({ error: true, message: "Room not found" });
  };

  const endOfRound = (payload, callback) => {
    const room = rooms.get(payload.roomId);
    if (room) {
      room.currentProgress.questionOpen = false;
      calculateRankings(room);

      Object.keys(room.players).forEach((playerId) => {
        io.to(playerId).emit("quiz:endOfRound", {
          message: "The round has ended.",
          roomId: room.roomId,
          playerData: room.players[playerId]
        });
      });

      console.log(`End of round broadcasted in room: ${room.roomId}`);
      return callback(null, room);
    }

    console.error(`Room not found endOfRound: ${payload.roomId}`);
    return callback({ error: true, message: "Room not found" });
  };

  const nextRound = async (payload, callback) => {
    const room = rooms.get(payload.roomId);
    if (room) {
      try {
        console.log("Next Round");

        const roundQuestions = await generateRound(
          room.currentProgress.currentRoundIndex,
          room.rounds,
          room.mode,
          room.questionPerRound,
          room
        );

        room.currentProgress.roundQuestions = roundQuestions;
        setCurrentQuestion(room, 1);
        resetPlayersForNextRound(room);

        io.to(room.roomId).emit("quiz:roundStart", { message: "New round started!" });

        return callback(null, room);
      } catch (error) {
        console.error("Error generating next round:", error);
        return callback({ error: "Failed to generate next round" });
      }
    }

    console.error(`Room not found nextRound: ${payload.roomId}`);
    return callback({ error: true, message: "Room not found" });
  };

  const closeQuestion = (payload, callback) => {
    const room = rooms.get(payload.roomId);
    if (!room) {
      console.error(`Room not found closeQuestion: ${payload.roomId}`);
      return callback({ error: true, message: "Room not found" });
    }

    if (room.gameMaster !== socket.id) {
      return callback({ error: true, message: "Only the game master can close questions" });
    }

    try {
      const closeResult = closeCurrentQuestion(
        room,
        Number(payload.questionId),
        payload.reason
      );

      if (closeResult.alreadyClosed) {
        return callback(null, {
          room,
          questionId: closeResult.questionId,
          reason: closeResult.reason,
          alreadyClosed: true
        });
      }

      closeResult.autoLockedPlayers.forEach(({ playerId, playerName }) => {
        io.to(room.gameMaster).emit("playerAnswered", {
          playerId,
          playerName,
          answer: null,
          isCorrect: false,
          autoLocked: true
        });
      });

      Object.keys(room.players).forEach((playerId) => {
        io.to(playerId).emit("quiz:questionClosed", {
          questionId: closeResult.questionId,
          reason: closeResult.reason
        });
      });

      return callback(null, {
        room,
        questionId: closeResult.questionId,
        reason: closeResult.reason,
        alreadyClosed: false
      });
    } catch (error) {
      return callback({ error: true, message: error.message });
    }
  };

  const submitAnswer = (payload, callback) => {
    const room = rooms.get(payload.roomId);
    if (room) {
      try {
        const submission = submitPlayerAnswer(
          room,
          socket.id,
          Number(payload.questionId),
          payload.answer
        );

        io.to(room.gameMaster).emit("playerAnswered", {
          playerId: socket.id,
          playerName: submission.player.name,
          answer: submission.selectedAnswer,
          isCorrect: submission.isCorrect
        });

        console.log(
          `Player ${submission.player.name} answered: ${submission.selectedAnswer} (Correct: ${submission.isCorrect})`
        );
        return callback(null, { message: "Answer submitted successfully." });
      } catch (error) {
        if (error.code === "PLAYER_NOT_FOUND") {
          console.log("Player not found in the room.");
        }
        return callback({ error: true, message: error.message });
      }
    }

    console.error(`Room not found submitAnswer: ${payload.roomId}`);
    return callback({ error: true, message: "Room not found" });
  };

  const endOfGame = (payload, callback) => {
    const room = rooms.get(payload.roomId);
    if (room) {
      room.currentProgress.questionOpen = false;
      calculateRankings(room);

      Object.keys(room.players).forEach((playerId) => {
        io.to(playerId).emit("quiz:endOfGame", {
          message: "The game has ended.",
          roomId: room.roomId,
          playerData: room.players[playerId]
        });
      });

      console.log(`End-of-game broadcasted in room: ${room.roomId}`);
      callback(null, room);
      deleteRoom(io, rooms, room.roomId);
      return;
    }

    console.error(`Room not found endOfGame: ${payload.roomId}`);
    return callback({ error: true, message: "Room not found" });
  };

  socket.on("room:create", create);
  socket.on("room:delete", removeRoom);
  socket.on("quiz:start", startQuiz);
  socket.on("player:join", playerJoin);
  socket.on("player:rejoin", playerRejoin);
  socket.on("quiz:nextQuestion", nextQuestion);
  socket.on("quiz:closeQuestion", closeQuestion);
  socket.on("quiz:endOfRound", endOfRound);
  socket.on("quiz:nextRound", nextRound);
  socket.on("submitAnswer", submitAnswer);
  socket.on("quiz:endOfGame", endOfGame);

  socket.on("disconnect", () => {
    for (const [roomId, room] of rooms.entries()) {
      if (room.players[socket.id]) {
        console.log(
          `Player ${room.players[socket.id].name} disconnected from room ${roomId}, keeping player data for reconnection`
        );
      }
    }
  });
};

export default roomHandler;
