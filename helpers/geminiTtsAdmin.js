import fs from "fs/promises";
import path from "path";

export const GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_CHANNELS = 1;
const DEFAULT_BITS_PER_SAMPLE = 16;

export const GEMINI_VOICES = [
  { name: "Zephyr", description: "Bright" },
  { name: "Puck", description: "Upbeat" },
  { name: "Charon", description: "Informative" },
  { name: "Kore", description: "Firm" },
  { name: "Fenrir", description: "Excitable" },
  { name: "Leda", description: "Youthful" },
  { name: "Orus", description: "Firm" },
  { name: "Aoede", description: "Breezy" },
  { name: "Callirrhoe", description: "Easy-going" },
  { name: "Autonoe", description: "Bright" },
  { name: "Enceladus", description: "Breathy" },
  { name: "Iapetus", description: "Clear" },
  { name: "Umbriel", description: "Easy-going" },
  { name: "Algieba", description: "Smooth" },
  { name: "Despina", description: "Smooth" },
  { name: "Erinome", description: "Clear" },
  { name: "Algenib", description: "Gravelly" },
  { name: "Rasalgethi", description: "Informative" },
  { name: "Laomedeia", description: "Upbeat" },
  { name: "Achernar", description: "Soft" },
  { name: "Alnilam", description: "Firm" },
  { name: "Schedar", description: "Even" },
  { name: "Gacrux", description: "Mature" },
  { name: "Pulcherrima", description: "Forward" },
  { name: "Achird", description: "Friendly" },
  { name: "Zubenelgenubi", description: "Casual" },
  { name: "Vindemiatrix", description: "Gentle" },
  { name: "Sadachbia", description: "Lively" },
  { name: "Sadaltager", description: "Knowledgeable" },
  { name: "Sulafat", description: "Warm" }
];

const GEMINI_VOICE_NAMES = new Set(GEMINI_VOICES.map((voice) => voice.name));

const normalizeField = (value) => (typeof value === "string" ? value.trim() : "");

export const buildTtsPrompt = ({
  audioProfile,
  style,
  pace,
  accent,
  scene,
  sampleContext,
  transcript
}) => {
  const sections = [];
  const normalizedAudioProfile = normalizeField(audioProfile);
  const normalizedStyle = normalizeField(style);
  const normalizedPace = normalizeField(pace);
  const normalizedAccent = normalizeField(accent);
  const normalizedScene = normalizeField(scene);
  const normalizedSampleContext = normalizeField(sampleContext);
  const normalizedTranscript = normalizeField(transcript);

  if (normalizedAudioProfile) {
    sections.push(`### AUDIO PROFILE\n${normalizedAudioProfile}`);
  }

  const directorNotes = [
    normalizedStyle ? `Style: ${normalizedStyle}` : null,
    normalizedPace ? `Pace: ${normalizedPace}` : null,
    normalizedAccent ? `Accent: ${normalizedAccent}` : null
  ].filter(Boolean);

  if (directorNotes.length > 0) {
    sections.push(`### DIRECTOR'S NOTES\n${directorNotes.join("\n")}`);
  }

  if (normalizedScene) {
    sections.push(`### THE SCENE\n${normalizedScene}`);
  }

  if (normalizedSampleContext) {
    sections.push(`### SAMPLE CONTEXT\n${normalizedSampleContext}`);
  }

  sections.push(`### TRANSCRIPT\n${normalizedTranscript}`);

  return sections.join("\n\n");
};

const parseMimeType = (mimeType) => {
  const [type = "", ...rawParams] = String(mimeType || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  const params = rawParams.reduce((accumulator, part) => {
    const [key, value] = part.split("=").map((segment) => segment.trim());
    if (key && value) {
      accumulator[key.toLowerCase()] = value;
    }
    return accumulator;
  }, {});

  return { type: type.toLowerCase(), params };
};

const createWaveHeader = ({ dataLength, sampleRate, channels, bitsPerSample }) => {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
};

export const toWaveBuffer = (audioBuffer, mimeType) => {
  const { type, params } = parseMimeType(mimeType);

  if (type === "audio/wav" || type === "audio/x-wav") {
    return audioBuffer;
  }

  if (type === "audio/l16" || type === "audio/lpcm") {
    const sampleRate = Number(params.rate) || DEFAULT_SAMPLE_RATE;
    const channels = Number(params.channels) || DEFAULT_CHANNELS;
    const bitsPerSample = DEFAULT_BITS_PER_SAMPLE;
    const header = createWaveHeader({
      dataLength: audioBuffer.length,
      sampleRate,
      channels,
      bitsPerSample
    });

    return Buffer.concat([header, audioBuffer]);
  }

  throw new Error(`Unsupported audio format returned by Gemini: ${mimeType || "unknown"}`);
};

const getTimestampLabel = () => {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ];
  const timeParts = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ];

  return `${parts.join("")}-${timeParts.join("")}`;
};

const getUniqueOutputPath = async (outputDir, voiceName) => {
  const safeVoiceName = voiceName.replace(/[^a-z0-9_-]/gi, "");
  const baseName = `${getTimestampLabel()}-${safeVoiceName}`;
  let candidateName = `${baseName}.wav`;
  let counter = 2;

  while (true) {
    try {
      await fs.access(path.join(outputDir, candidateName));
      candidateName = `${baseName}-${counter}.wav`;
      counter += 1;
    } catch {
      return candidateName;
    }
  }
};

const parseGeminiError = async (response) => {
  const fallbackMessage = `Gemini request failed with status ${response.status}.`;

  try {
    const payload = await response.json();
    return payload?.error?.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
};

export const extractInlineAudioPart = (responsePayload) =>
  responsePayload?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData;

export const generateGeminiAudio = async ({ apiKey, prompt, voiceName }) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName
              }
            }
          }
        }
      }),
      signal: AbortSignal.timeout(90000)
    }
  );

  if (!response.ok) {
    throw new Error(await parseGeminiError(response));
  }

  const payload = await response.json();
  const inlineData = extractInlineAudioPart(payload);

  if (!inlineData?.data) {
    const finishReason = payload?.candidates?.[0]?.finishReason;
    throw new Error(
      finishReason
        ? `Gemini did not return audio. Finish reason: ${finishReason}.`
        : "Gemini did not return audio data."
    );
  }

  return {
    audioBuffer: Buffer.from(inlineData.data, "base64"),
    mimeType: inlineData.mimeType || "audio/L16;rate=24000"
  };
};

export const registerGeminiTtsAdminRoutes = (app, { publicDir }) => {
  const ttsOutputDir = path.join(publicDir, "audio", "tts-tests");

  app.post("/api/admin/tts/generate", async (req, res) => {
    const audioProfile = normalizeField(req.body?.audioProfile);
    const style = normalizeField(req.body?.style);
    const pace = normalizeField(req.body?.pace);
    const accent = normalizeField(req.body?.accent);
    const scene = normalizeField(req.body?.scene);
    const sampleContext = normalizeField(req.body?.sampleContext);
    const transcript = normalizeField(req.body?.transcript);
    const voiceName = normalizeField(req.body?.voiceName) || "Charon";

    if (!transcript) {
      return res.status(400).json({ ok: false, error: "Transcript is required." });
    }

    if (!GEMINI_VOICE_NAMES.has(voiceName)) {
      return res.status(400).json({ ok: false, error: "Voice name is invalid." });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY is not configured on the server."
      });
    }

    const prompt = buildTtsPrompt({
      audioProfile,
      style,
      pace,
      accent,
      scene,
      sampleContext,
      transcript
    });

    try {
      const { audioBuffer, mimeType } = await generateGeminiAudio({
        apiKey: process.env.GEMINI_API_KEY,
        prompt,
        voiceName
      });
      const waveBuffer = toWaveBuffer(audioBuffer, mimeType);

      await fs.mkdir(ttsOutputDir, { recursive: true });

      const fileName = await getUniqueOutputPath(ttsOutputDir, voiceName);
      await fs.writeFile(path.join(ttsOutputDir, fileName), waveBuffer);

      return res.json({
        ok: true,
        fileName,
        audioUrl: `/audio/tts-tests/${fileName}`,
        voiceName,
        prompt
      });
    } catch (error) {
      console.error("Gemini TTS generation failed:", error);
      return res.status(500).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate audio."
      });
    }
  });
};
