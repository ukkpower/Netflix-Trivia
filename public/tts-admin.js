const VOICES = [
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

const form = document.querySelector("#ttsForm");
const voiceSelect = document.querySelector("#voiceName");
const runButton = document.querySelector("#runButton");
const playButton = document.querySelector("#playButton");
const audioPlayer = document.querySelector("#audioPlayer");
const statusMessage = document.querySelector("#statusMessage");
const savedFile = document.querySelector("#savedFile");
const selectedVoice = document.querySelector("#selectedVoice");
const audioLink = document.querySelector("#audioLink");
const promptPreview = document.querySelector("#promptPreview");

const setStatus = (message, statusClass) => {
  statusMessage.textContent = message;
  statusMessage.className = `tts-status ${statusClass}`;
};

const fillVoiceOptions = () => {
  const options = VOICES.map((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} - ${voice.description}`;
    return option;
  });

  voiceSelect.replaceChildren(...options);
  voiceSelect.value = "Charon";
};

const setAudioResult = ({ audioUrl, fileName, voiceName, prompt }) => {
  savedFile.textContent = fileName;
  selectedVoice.textContent = voiceName;
  audioLink.href = audioUrl;
  audioLink.textContent = audioUrl;
  promptPreview.textContent = prompt;
  audioPlayer.src = audioUrl;
  playButton.disabled = false;
};

const clearAudioResult = () => {
  savedFile.textContent = "Not generated yet";
  selectedVoice.textContent = voiceSelect.value || "Charon";
  audioLink.removeAttribute("href");
  audioLink.textContent = "Unavailable";
  promptPreview.textContent = "### TRANSCRIPT\n\nYour generated prompt will appear here.";
  audioPlayer.removeAttribute("src");
  audioPlayer.load();
  playButton.disabled = true;
};

const getPayload = () => {
  const formData = new FormData(form);

  return {
    voiceName: String(formData.get("voiceName") || ""),
    audioProfile: String(formData.get("audioProfile") || ""),
    style: String(formData.get("style") || ""),
    pace: String(formData.get("pace") || ""),
    accent: String(formData.get("accent") || ""),
    scene: String(formData.get("scene") || ""),
    sampleContext: String(formData.get("sampleContext") || ""),
    transcript: String(formData.get("transcript") || "")
  };
};

const updateSelectedVoice = () => {
  selectedVoice.textContent = voiceSelect.value || "Charon";
};

const parseApiResponse = async (response) => {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const rawBody = await response.text();
  const compactBody = rawBody.replace(/\s+/g, " ").trim();
  const preview = compactBody.slice(0, 140);

  throw new Error(
    response.status === 404
      ? "The TTS API route is not available on the current server. Restart the app so /api/admin/tts/generate is loaded."
      : `Unexpected non-JSON response from server (${response.status}). ${preview}`
  );
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  runButton.disabled = true;
  playButton.disabled = true;
  setStatus("Generating audio with Gemini TTS...", "tts-status-loading");

  try {
    const response = await fetch("/api/admin/tts/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(getPayload())
    });
    const payload = await parseApiResponse(response);

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Audio generation failed.");
    }

    setAudioResult(payload);
    setStatus("Audio generated and saved successfully.", "tts-status-success");
  } catch (error) {
    clearAudioResult();
    updateSelectedVoice();
    setStatus(
      error instanceof Error ? error.message : "Audio generation failed.",
      "tts-status-error"
    );
  } finally {
    runButton.disabled = false;
  }
});

playButton.addEventListener("click", async () => {
  if (!audioPlayer.src) {
    return;
  }

  try {
    await audioPlayer.play();
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "Audio playback failed.",
      "tts-status-error"
    );
  }
});

voiceSelect.addEventListener("change", updateSelectedVoice);

fillVoiceOptions();
clearAudioResult();
