import { buildRoundPlan, generateRound } from "./game.js";

const TIMER_OPTION_SECONDS = new Set([30, 60, 120]);
const DEFAULT_QUESTION_IMAGE_BASE_PATH = "imgs/questions";

export const generateUniqueRoomId = (rooms) => {
  let roomId;
  let exists = true;

  while (exists) {
    roomId = Math.floor(100000 + Math.random() * 900000).toString();
    exists = rooms.has(roomId);
  }

  return roomId;
};

export const normalizeTimerSettings = (
  answerTimerEnabled,
  answerTimerSeconds,
  legacyQuestionTimeLimit
) => {
  const fallbackSeconds = TIMER_OPTION_SECONDS.has(Number(answerTimerSeconds))
    ? Number(answerTimerSeconds)
    : TIMER_OPTION_SECONDS.has(Number(legacyQuestionTimeLimit))
      ? Number(legacyQuestionTimeLimit)
      : 30;

  const enabled =
    typeof answerTimerEnabled === "boolean"
      ? answerTimerEnabled
      : Number(legacyQuestionTimeLimit) > 0;

  return {
    answerTimerEnabled: enabled,
    answerTimerSeconds: fallbackSeconds
  };
};

export async function createRoom(
  socket,
  rooms,
  answerTimerEnabled,
  answerTimerSeconds,
  questionsPerRound,
  rounds,
  mode,
  questionImageBasePath,
  legacyQuestionTimeLimit
) {
  const normalizedQuestionsPerRound =
    questionsPerRound !== undefined ? questionsPerRound : 5;
  const normalizedQuestionImageBasePath =
    typeof questionImageBasePath === "string" && questionImageBasePath.trim().length > 0
      ? questionImageBasePath.trim()
      : DEFAULT_QUESTION_IMAGE_BASE_PATH;
  const timerSettings = normalizeTimerSettings(
    answerTimerEnabled,
    answerTimerSeconds,
    legacyQuestionTimeLimit
  );

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
    questionTimeLimit: timerSettings.answerTimerEnabled ? timerSettings.answerTimerSeconds : 0,
    questionPerRound: normalizedQuestionsPerRound,
    mode,
    settings: {
      questionImageBasePath: normalizedQuestionImageBasePath,
      answerTimerEnabled: timerSettings.answerTimerEnabled,
      answerTimerSeconds: timerSettings.answerTimerSeconds
    },
    rounds: roundPlan,
    players: {},
    quizStarted: false,
    currentProgress: {
      currentRoundIndex: null,
      currentRound: null,
      currentQuestion: 1,
      questionId: 1,
      questionOpen: false,
      roundQuestions: null
    }
  };

  try {
    const roundQuestions = await generateRound(
      room.currentProgress.currentRoundIndex,
      room.rounds,
      mode,
      normalizedQuestionsPerRound,
      room
    );
    room.currentProgress.roundQuestions = roundQuestions;
  } catch (error) {
    console.error("Error generating round questions:", error);
    throw new Error("Failed to create room due to question generation error");
  }

  rooms.set(roomId, room);
  socket.join(roomId);

  console.log(`Room created: ${roomId} (Total rooms: ${rooms.size})`);

  return room;
}

export function deleteRoom(io, rooms, roomId) {
  const room = rooms.get(roomId);

  if (!room) {
    return null;
  }

  io.to(roomId).emit("room:deleted", { roomId });
  io.in(roomId).socketsLeave(roomId);
  rooms.delete(roomId);

  console.log(`Room deleted: ${roomId} (Total rooms: ${rooms.size})`);

  return room;
}
