const form = document.querySelector("#bulkForm");
const modeField = document.querySelector("#mode");
const scopeField = document.querySelector("#scope");
const categoryField = document.querySelector("#categorySlug");
const difficultyField = document.querySelector("#difficulty");
const voiceField = document.querySelector("#voiceName");
const previewButton = document.querySelector("#previewButton");
const runButton = document.querySelector("#runButton");
const previewStatus = document.querySelector("#previewStatus");
const previewCount = document.querySelector("#previewCount");
const previewSelection = document.querySelector("#previewSelection");
const previewSample = document.querySelector("#previewSample");
const recentJobs = document.querySelector("#recentJobs");
const jobHeadline = document.querySelector("#jobHeadline");
const metricTotal = document.querySelector("#metricTotal");
const metricProcessed = document.querySelector("#metricProcessed");
const metricSuccess = document.querySelector("#metricSuccess");
const metricFailed = document.querySelector("#metricFailed");
const jobItems = document.querySelector("#jobItems");
const jobErrors = document.querySelector("#jobErrors");

let activeJobId = null;
let pollTimer = null;

const setPreviewStatus = (message, className) => {
  previewStatus.textContent = message;
  previewStatus.className = `tts-bulk-status ${className}`;
};

const pillClassForStatus = (status) => {
  if (["completed"].includes(status)) {
    return "tts-bulk-pill tts-bulk-pill-success";
  }

  if (["completed_with_errors", "failed"].includes(status)) {
    return "tts-bulk-pill tts-bulk-pill-error";
  }

  if (["running", "queued"].includes(status)) {
    return "tts-bulk-pill tts-bulk-pill-running";
  }

  return "tts-bulk-pill tts-bulk-pill-idle";
};

const scopeIsCategory = () => scopeField.value === "category";

const syncScopeControls = () => {
  const categoryMode = scopeIsCategory();
  categoryField.disabled = !categoryMode;
  difficultyField.disabled = !categoryMode;

  if (!categoryMode) {
    categoryField.value = "";
    difficultyField.value = "";
  }
};

const setFieldValue = (name, value) => {
  const field = form.elements.namedItem(name);
  if (!field) {
    return;
  }

  if (field instanceof HTMLInputElement && field.type === "checkbox") {
    field.checked = Boolean(value);
    return;
  }

  field.value = value ?? "";
};

const restoreSettingsFromJob = (job) => {
  if (!job) {
    return;
  }

  setFieldValue("mode", job.mode || "direct");
  setFieldValue("profileName", job.profileName || job.profile?.profileName || "");
  setFieldValue("voiceName", job.voiceName || job.profile?.voiceName || "Charon");
  setFieldValue("scope", job.scope || job.selection?.scope || "all");
  setFieldValue("categorySlug", job.categorySlug || job.selection?.categorySlug || "");
  setFieldValue("difficulty", job.difficulty || job.selection?.difficulty || "");
  setFieldValue("onlyMissingAudio", job.onlyMissingAudio ?? job.selection?.onlyMissingAudio ?? true);
  setFieldValue("limit", job.limit ?? job.selection?.limit ?? "");
  setFieldValue("audioProfile", job.profile?.audioProfile || "");
  setFieldValue("style", job.profile?.style || "");
  setFieldValue("pace", job.profile?.pace || "");
  setFieldValue("accent", job.profile?.accent || "");
  setFieldValue("scene", job.profile?.scene || "");
  setFieldValue("sampleContext", job.profile?.sampleContext || "");

  syncScopeControls();
  setPreviewStatus("Restored settings from the latest saved bulk job.", "tts-bulk-status-idle");
};

const getPayload = () => {
  const formData = new FormData(form);

  return {
    mode: String(formData.get("mode") || ""),
    profileName: String(formData.get("profileName") || ""),
    voiceName: String(formData.get("voiceName") || ""),
    scope: String(formData.get("scope") || ""),
    categorySlug: String(formData.get("categorySlug") || ""),
    difficulty: String(formData.get("difficulty") || ""),
    limit: String(formData.get("limit") || ""),
    onlyMissingAudio: Boolean(formData.get("onlyMissingAudio")),
    audioProfile: String(formData.get("audioProfile") || ""),
    style: String(formData.get("style") || ""),
    pace: String(formData.get("pace") || ""),
    accent: String(formData.get("accent") || ""),
    scene: String(formData.get("scene") || ""),
    sampleContext: String(formData.get("sampleContext") || "")
  };
};

const parseJson = async (response) => {
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
};

const renderPreview = (payload) => {
  previewCount.textContent = String(payload.count);
  previewSelection.textContent = payload.category
    ? `${payload.category.name} / ${difficultyField.value || "all"}`
    : "All questions";

  previewSample.replaceChildren(
    ...payload.sample.map((item) => {
      const element = document.createElement("div");
      element.className = "tts-bulk-sample-item";
      element.innerHTML = `
        <strong>${item.question}</strong>
        <div>${item.difficulty}</div>
        <div>${item.hasAudio ? "Already has audio" : "Missing audio"}</div>
      `;
      return element;
    })
  );
};

const renderRecentJobs = (jobs) => {
  if (!jobs.length) {
    recentJobs.innerHTML = '<div class="tts-bulk-job-item">No jobs yet.</div>';
    return;
  }

  recentJobs.replaceChildren(
    ...jobs.map((job) => {
      const wrapper = document.createElement("div");
      wrapper.className = "tts-bulk-job-item";
      wrapper.innerHTML = `
        <div><strong>${job.profileName}</strong></div>
        <div>${job.mode} / ${job.scope}${job.categorySlug ? ` / ${job.categorySlug}` : ""}${job.difficulty ? ` / ${job.difficulty}` : ""}</div>
        <div class="${pillClassForStatus(job.status)}">${job.status.replaceAll("_", " ")}</div>
        <div>${job.successCount}/${job.totalCount} completed</div>
      `;

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "View Job";
      button.addEventListener("click", () => {
        activeJobId = job.id;
        void loadJob(job.id);
      });
      wrapper.append(button);
      return wrapper;
    })
  );
};

const renderJob = (job) => {
  jobHeadline.textContent = `${job.profileName} / ${job.voiceName} / ${job.status.replaceAll("_", " ")}`;
  metricTotal.textContent = String(job.totalCount);
  metricProcessed.textContent = String(job.processedCount);
  metricSuccess.textContent = String(job.successCount);
  metricFailed.textContent = String(job.failureCount);

  jobItems.replaceChildren(
    ...(job.items.length
      ? job.items.map((item) => {
          const card = document.createElement("div");
          card.className = "tts-bulk-item-card";
          const audioLink = item.audioUrl && item.status === "completed"
            ? `<div><a href="${item.audioUrl}" target="_blank" rel="noreferrer">Open audio</a></div>`
            : "";

          card.innerHTML = `
            <div><strong>${item.question}</strong></div>
            <div>${item.difficulty}</div>
            <div class="${pillClassForStatus(item.status)}">${item.status.replaceAll("_", " ")}</div>
            ${item.error ? `<div>${item.error}</div>` : ""}
            ${audioLink}
          `;
          return card;
        })
      : [Object.assign(document.createElement("div"), {
          className: "tts-bulk-item-card",
          textContent: "No items available."
        })])
  );

  jobErrors.replaceChildren(
    ...(job.errors.length
      ? job.errors.map((error) => {
          const card = document.createElement("div");
          card.className = "tts-bulk-error-card";
          card.innerHTML = `
            <strong>${error.question || error.questionId || "General error"}</strong>
            <div>${error.message}</div>
          `;
          return card;
        })
      : [Object.assign(document.createElement("div"), {
          className: "tts-bulk-error-card",
          textContent: "No errors recorded."
        })])
  );
};

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

const startPolling = () => {
  stopPolling();
  pollTimer = setInterval(() => {
    if (!activeJobId) {
      stopPolling();
      return;
    }

    void loadJob(activeJobId, { silent: true });
  }, 5000);
};

const loadJob = async (jobId, { silent = false } = {}) => {
  const response = await fetch(`/api/admin/tts-bulk/jobs/${jobId}`);
  const payload = await parseJson(response);
  renderJob(payload.job);

  if (!silent) {
    setPreviewStatus(`Loaded job ${payload.job.id}.`, "tts-bulk-status-idle");
  }

  if (["queued", "running"].includes(payload.job.status)) {
    startPolling();
  } else {
    stopPolling();
  }

  const jobsResponse = await fetch("/api/admin/tts-bulk/jobs");
  const jobsPayload = await parseJson(jobsResponse);
  renderRecentJobs(jobsPayload.jobs);
};

const loadOptions = async () => {
  const response = await fetch("/api/admin/tts-bulk/options");
  const payload = await parseJson(response);

  voiceField.replaceChildren(
    ...payload.voices.map((voice) => {
      const option = document.createElement("option");
      option.value = voice.name;
      option.textContent = `${voice.name} - ${voice.description}`;
      return option;
    })
  );
  voiceField.value = "Charon";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Select category";
  categoryField.replaceChildren(
    emptyOption,
    ...payload.categories.map((category) => {
      const option = document.createElement("option");
      option.value = category.slug;
      option.textContent = category.name;
      return option;
    })
  );

  renderRecentJobs(payload.jobs);
  restoreSettingsFromJob(payload.jobs[0]);
};

previewButton.addEventListener("click", async () => {
  setPreviewStatus("Loading matching questions...", "tts-bulk-status-loading");
  previewButton.disabled = true;

  try {
    const response = await fetch("/api/admin/tts-bulk/preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(getPayload())
    });
    const payload = await parseJson(response);
    renderPreview(payload);
    setPreviewStatus(`Found ${payload.count} matching question(s).`, "tts-bulk-status-success");
  } catch (error) {
    setPreviewStatus(
      error instanceof Error ? error.message : "Failed to preview matching questions.",
      "tts-bulk-status-error"
    );
  } finally {
    previewButton.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  runButton.disabled = true;
  setPreviewStatus("Starting bulk TTS job...", "tts-bulk-status-loading");

  try {
    const response = await fetch("/api/admin/tts-bulk/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(getPayload())
    });
    const payload = await parseJson(response);
    activeJobId = payload.job.id;
    renderJob({
      ...payload.job,
      items: [],
      errors: payload.job.errors || []
    });
    setPreviewStatus(`Started ${payload.job.mode} job with ${payload.job.totalCount} question(s).`, "tts-bulk-status-success");
    await loadJob(payload.job.id, { silent: true });
  } catch (error) {
    setPreviewStatus(
      error instanceof Error ? error.message : "Failed to start bulk TTS job.",
      "tts-bulk-status-error"
    );
  } finally {
    runButton.disabled = false;
  }
});

scopeField.addEventListener("change", syncScopeControls);

await loadOptions();
syncScopeControls();
