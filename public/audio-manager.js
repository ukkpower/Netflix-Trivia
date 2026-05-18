/**
 * AudioManager - Handles background music and sound effects
 * Supports crossfaded music transitions and independent sound effect playback
 */
class AudioManager {
    constructor(baseSoundPath = "") {
        this.baseSoundPath = baseSoundPath;
        
        // Music channel
        this.musicTracks = new Map(); // Store pre-loaded music tracks
        this.currentMusic = null; // Currently playing music handle
        this.currentMusicName = null; // Name of currently playing track
        this.musicVolume = 100; // 0-100
        this.musicMuted = false;
        this.musicLoop = true; // Default to looping
        this.musicDuckMultiplier = 1;
        this.audioContext = null;
        this.webAudioSupported = typeof window !== "undefined"
            && (typeof window.AudioContext === "function" || typeof window.webkitAudioContext === "function");
        
        // Sound effects channel
        this.soundFX = new Map(); // Store pre-loaded sound effects
        this.soundFXVolume = 100; // 0-100
        this.soundFXMuted = false;

        // Speech channel
        this.currentSpeechAudio = null;
        this.speechVolume = 100; // 0-100
        this.currentSpeechVolume = 100; // 0-100
        this.speechMuted = false;
        this.speechPlaybackToken = 0;
        
        // Master controls
        this.masterVolume = 100; // 0-100
        this.masterMuted = false;
        
        // Settings
        this.settings = {
            fadeOutDuration: 1000, // milliseconds
            fadeInDelay: 0, // milliseconds before the incoming track joins the crossfade
            musicDuckDuration: 250 // milliseconds for speech ducking fades
        };
        
        // Music transition tracking
        this.musicFadeIntervals = new Map();
        this.musicDuckInterval = null;
        this.musicAudioState = new Map();
        this.musicStartTimeout = null;
        this.musicTransitionToken = 0;
    }
    
    /**
     * Convert volume from 0-100 scale to 0-1 scale for Audio API
     */
    _normalizeVolume(volume) {
        return Math.max(0, Math.min(100, volume)) / 100;
    }
    
    /**
     * Calculate effective volume (channel volume * master volume)
     */
    _getEffectiveVolume(channelVolume) {
        if (this.masterMuted) return 0;
        const normalizedChannel = this._normalizeVolume(channelVolume);
        const normalizedMaster = this._normalizeVolume(this.masterVolume);
        return normalizedChannel * normalizedMaster;
    }
    
    /**
     * Get or lazily create a shared AudioContext for gapless music playback.
     */
    _getAudioContext() {
        if (!this.webAudioSupported) {
            return null;
        }

        if (!this.audioContext) {
            const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContextCtor();
        }

        return this.audioContext;
    }

    /**
     * Resume the shared AudioContext before starting playback.
     */
    async _ensureAudioContextRunning() {
        const audioContext = this._getAudioContext();
        if (!audioContext) {
            return null;
        }

        if (audioContext.state === "suspended") {
            await audioContext.resume();
        }

        return audioContext;
    }

    /**
     * Decode a music file for gapless playback. Falls back silently if unsupported.
     */
    async _decodeMusicBuffer(src) {
        const audioContext = this._getAudioContext();
        if (!audioContext || typeof fetch !== "function") {
            return null;
        }

        try {
            const response = await fetch(src);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const audioData = await response.arrayBuffer();
            return await new Promise((resolve, reject) => {
                audioContext.decodeAudioData(audioData.slice(0), resolve, reject);
            });
        } catch (error) {
            console.warn(`Falling back to HTML audio for "${src}" because decoding failed.`, error);
            return null;
        }
    }

    /**
     * Pre-load a music track
     * @param {string} name - Name identifier for the music track
     * @param {string} file - Filename relative to baseSoundPath
     * @param {number} volume - Volume level (0-100), defaults to 100
     * @returns {Promise} Resolves when music is loaded
     */
    async loadMusic(name, file, volume = 100, config = {}) {
        const options = this._normalizeMusicConfig(config);
        const loop = options.loop ?? this.musicLoop;
        const src = this.baseSoundPath + file;

        const preloadAudioPromise = new Promise((resolve, reject) => {
            const audio = new Audio(src);
            audio.loop = Boolean(loop);
            audio.volume = 0;
            audio.preload = "auto";

            audio.addEventListener("canplaythrough", () => resolve(audio), { once: true });
            audio.addEventListener("error", () => {
                reject(new Error(`Failed to load music "${name}" from "${file}".`));
            }, { once: true });

            audio.load();
        });

        const [audio, buffer] = await Promise.all([
            preloadAudioPromise,
            this._decodeMusicBuffer(src)
        ]);

        this.musicTracks.set(name, {
            audio,
            buffer,
            volume: Math.max(0, Math.min(100, volume)),
            file,
            loop: Boolean(loop),
            playbackStart: this._normalizeLoopBoundary(options.playbackStart ?? options.loopStart ?? options.trimStart),
            loopStart: this._normalizeLoopBoundary(options.loopStart ?? options.trimStart),
            loopEnd: this._normalizeLoopBoundary(options.loopEnd),
            trimEnd: this._normalizeLoopBoundary(options.trimEnd)
        });
    }
    
    /**
     * Pre-load a sound effect
     * @param {string} name - Name identifier for the sound effect
     * @param {string} file - Filename relative to baseSoundPath
     * @param {number} volume - Volume level (0-100), defaults to 100
     * @returns {Promise} Resolves when sound is loaded
     */
    async loadSoundFX(name, file, volume = 100) {
        return new Promise((resolve, reject) => {
            const audio = new Audio(this.baseSoundPath + file);
            audio.volume = 0; // Will be set when playing
            
            audio.addEventListener('canplaythrough', () => {
                this.soundFX.set(name, {
                    audio: audio,
                    volume: Math.max(0, Math.min(100, volume)),
                    file: file
                });
                
                // Create dynamic method for easy access
                // Convert name to camelCase method name
                const methodName = this._toCamelCase(name);
                if (!this[methodName]) {
                    this[methodName] = () => this.playSoundFX(name);
                }
                
                resolve();
            }, { once: true });
            
            audio.addEventListener('error', (e) => {
                reject(new Error(`Failed to load sound effect "${name}" from "${file}": ${e.message}`));
            }, { once: true });
            
            // Start loading
            audio.load();
        });
    }
    
    /**
     * Convert string to camelCase for method names
     */
    _toCamelCase(str) {
        return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
            return index === 0 ? word.toLowerCase() : word.toUpperCase();
        }).replace(/\s+/g, '');
    }

    /**
     * Normalize optional music config. Accepts a boolean loop flag for backward compatibility.
     */
    _normalizeMusicConfig(config = {}) {
        if (typeof config === "boolean") {
            return { loop: config };
        }

        if (config && typeof config === "object") {
            return config;
        }

        return {};
    }

    /**
     * Normalize a loop boundary in seconds.
     */
    _normalizeLoopBoundary(value) {
        const normalizedValue = Number(value);
        if (!Number.isFinite(normalizedValue) || normalizedValue < 0) {
            return null;
        }

        return normalizedValue;
    }

    /**
     * Resolve playback and loop points for a decoded music track.
     */
    _resolveMusicPlaybackWindow(track) {
        const duration = track.buffer?.duration ?? 0;
        const playbackStart = Math.min(
            track.playbackStart ?? track.loopStart ?? 0,
            duration || Number.MAX_SAFE_INTEGER
        );
        const loopStart = Math.min(track.loopStart ?? playbackStart, duration || Number.MAX_SAFE_INTEGER);

        let loopEnd = track.loopEnd;
        if (loopEnd == null && duration > 0 && track.trimEnd != null && track.trimEnd > 0) {
            loopEnd = Math.max(loopStart, duration - track.trimEnd);
        }

        if (loopEnd != null && duration > 0) {
            loopEnd = Math.min(loopEnd, duration);
        }

        if (loopEnd != null && loopEnd <= loopStart) {
            loopEnd = null;
        }

        return {
            playbackStart,
            loopStart,
            loopEnd
        };
    }

    /**
     * Create a music playback handle backed by an HTMLAudioElement.
     */
    _createHtmlMusicHandle(track, loop) {
        const audio = new Audio(track.audio.src);
        audio.loop = Boolean(loop);
        audio.volume = 0;
        audio.preload = "auto";

        const handle = {
            type: "html",
            audio,
            paused: true
        };

        audio.addEventListener("ended", () => {
            handle.paused = true;
            this._clearMusicFade(handle);
            this.musicAudioState.delete(handle);

            if (this.currentMusic === handle) {
                this.currentMusic = null;
                this.currentMusicName = null;
            }
        });

        return handle;
    }

    /**
     * Create a music playback handle backed by Web Audio for gapless looping.
     */
    _createBufferedMusicHandle(track, loop) {
        const audioContext = this._getAudioContext();
        if (!audioContext || !track.buffer) {
            return null;
        }

        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0;
        gainNode.connect(audioContext.destination);

        const source = audioContext.createBufferSource();
        source.buffer = track.buffer;
        source.loop = Boolean(loop);

        const playbackWindow = this._resolveMusicPlaybackWindow(track);
        if (source.loop) {
            source.loopStart = playbackWindow.loopStart;
            if (playbackWindow.loopEnd != null) {
                source.loopEnd = playbackWindow.loopEnd;
            }
        }

        source.connect(gainNode);

        const handle = {
            type: "buffer",
            source,
            gainNode,
            playbackStart: playbackWindow.playbackStart,
            paused: true,
            started: false,
            stopped: false
        };

        source.onended = () => {
            handle.paused = true;
            handle.stopped = true;
            this._clearMusicFade(handle);
            this.musicAudioState.delete(handle);

            try {
                source.disconnect();
            } catch (error) {
                // Ignore disconnect races during stop/cleanup.
            }

            try {
                gainNode.disconnect();
            } catch (error) {
                // Ignore disconnect races during stop/cleanup.
            }

            if (this.currentMusic === handle) {
                this.currentMusic = null;
                this.currentMusicName = null;
            }
        };

        return handle;
    }

    /**
     * Create the best music playback handle available for this track.
     */
    _createMusicHandle(track, loop) {
        return this._createBufferedMusicHandle(track, loop) ?? this._createHtmlMusicHandle(track, loop);
    }

    /**
     * Check whether a music handle is currently playing.
     */
    _isMusicHandlePlaying(handle) {
        if (!handle) {
            return false;
        }

        if (handle.type === "buffer") {
            return handle.started && !handle.stopped && !handle.paused;
        }

        return !handle.audio.paused;
    }

    /**
     * Update loop state for an active music handle.
     */
    _setMusicHandleLoop(handle, loop) {
        if (!handle) {
            return;
        }

        if (handle.type === "buffer") {
            handle.source.loop = Boolean(loop);
            return;
        }

        handle.audio.loop = Boolean(loop);
    }

    /**
     * Start an inactive music handle.
     */
    async _playMusicHandle(handle) {
        if (!handle) {
            return;
        }

        if (handle.type === "buffer") {
            await this._ensureAudioContextRunning();
            if (handle.started) {
                return;
            }

            handle.source.start(0, handle.playbackStart ?? 0);
            handle.started = true;
            handle.paused = false;
            return;
        }

        await handle.audio.play();
        handle.paused = false;
    }

    /**
     * Track a music playback handle so its volume can be updated during crossfades.
     */
    _registerMusicAudio(audio, trackVolume, fadeMultiplier = 1) {
        this.musicAudioState.set(audio, {
            trackVolume: Math.max(0, Math.min(100, trackVolume)),
            fadeMultiplier: Math.max(0, Math.min(1, fadeMultiplier))
        });
        this._applyMusicAudioVolume(audio);
    }

    /**
     * Apply the effective volume to a tracked music audio instance
     */
    _applyMusicAudioVolume(audio) {
        const state = this.musicAudioState.get(audio);
        if (!state) return;

        const effectiveVolume = this._getEffectiveVolume(state.trackVolume);
        const targetVolume = this.musicMuted ? 0 : effectiveVolume;

        if (audio.type === "buffer") {
            audio.gainNode.gain.value = targetVolume * state.fadeMultiplier * this.musicDuckMultiplier;
            return;
        }

        audio.audio.volume = targetVolume * state.fadeMultiplier * this.musicDuckMultiplier;
    }

    /**
     * Update all active music audio instances
     */
    _updateAllMusicVolumes() {
        for (const audio of this.musicAudioState.keys()) {
            this._applyMusicAudioVolume(audio);
        }
    }

    /**
     * Clear an active fade interval for a specific audio instance
     */
    _clearMusicFade(audio) {
        const fadeInterval = this.musicFadeIntervals.get(audio);
        if (fadeInterval) {
            clearInterval(fadeInterval);
            this.musicFadeIntervals.delete(audio);
        }
    }

    /**
     * Get the current fade multiplier for a tracked music instance
     */
    _getMusicFadeMultiplier(audio) {
        return this.musicAudioState.get(audio)?.fadeMultiplier ?? 0;
    }

    /**
     * Resolve an audio source. Absolute URLs and site-root paths are used as-is.
     */
    _resolveAudioSource(src) {
        if (typeof src !== "string") {
            return "";
        }

        const trimmedSrc = src.trim();
        if (/^(?:[a-z]+:)?\/\//i.test(trimmedSrc) || trimmedSrc.startsWith("/") || trimmedSrc.startsWith("data:") || trimmedSrc.startsWith("blob:")) {
            return trimmedSrc;
        }

        return this.baseSoundPath + trimmedSrc;
    }

    /**
     * Fade the music duck multiplier independently from music crossfades.
     */
    _fadeMusicDuckMultiplier(targetMultiplier = 1, duration = this.settings.musicDuckDuration) {
        if (this.musicDuckInterval) {
            clearInterval(this.musicDuckInterval);
            this.musicDuckInterval = null;
        }

        const clampedTarget = Math.max(0, Math.min(1, Number(targetMultiplier)));
        const fadeDuration = Math.max(0, Number(duration) || 0);
        const startMultiplier = this.musicDuckMultiplier;

        if (fadeDuration === 0 || startMultiplier === clampedTarget) {
            this.musicDuckMultiplier = clampedTarget;
            this._updateAllMusicVolumes();
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const startTime = Date.now();

            this.musicDuckInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / fadeDuration, 1);

                this.musicDuckMultiplier = startMultiplier + ((clampedTarget - startMultiplier) * progress);
                this._updateAllMusicVolumes();

                if (progress >= 1) {
                    clearInterval(this.musicDuckInterval);
                    this.musicDuckInterval = null;
                    resolve();
                }
            }, 16);
        });
    }

    /**
     * Apply the effective volume to the active speech audio.
     */
    _applySpeechVolume(audio = this.currentSpeechAudio) {
        if (!audio) return;

        const channelVolume = (this.speechVolume * this.currentSpeechVolume) / 100;
        const effectiveVolume = this._getEffectiveVolume(channelVolume);
        audio.volume = this.speechMuted ? 0 : effectiveVolume;
    }

    /**
     * Stop a music audio instance and remove all tracking for it
     */
    _stopAndCleanupMusicAudio(audio) {
        if (!audio) return;

        this._clearMusicFade(audio);
        this.musicAudioState.delete(audio);

        if (audio.type === "buffer") {
            audio.paused = true;
            if (audio.started && !audio.stopped) {
                audio.stopped = true;
                try {
                    audio.source.stop();
                } catch (error) {
                    // Ignore repeated stop attempts.
                }
            }

            try {
                audio.source.disconnect();
            } catch (error) {
                // Ignore disconnect races during stop/cleanup.
            }

            try {
                audio.gainNode.disconnect();
            } catch (error) {
                // Ignore disconnect races during stop/cleanup.
            }
        } else {
            audio.audio.pause();
            audio.audio.currentTime = 0;
            audio.paused = true;
        }

        if (this.currentMusic === audio) {
            this.currentMusic = null;
            this.currentMusicName = null;
        }
    }

    /**
     * Stop any non-current music instances left over from an interrupted crossfade
     */
    _stopInactiveMusicAudios() {
        for (const audio of Array.from(this.musicAudioState.keys())) {
            if (audio !== this.currentMusic) {
                this._stopAndCleanupMusicAudio(audio);
            }
        }
    }

    /**
     * Fade a tracked music instance between two multipliers
     */
    _fadeMusicAudio(audio, startMultiplier, endMultiplier, duration, onComplete = null) {
        const state = this.musicAudioState.get(audio);
        if (!state) return Promise.resolve();

        this._clearMusicFade(audio);

        const clampedStart = Math.max(0, Math.min(1, startMultiplier));
        const clampedEnd = Math.max(0, Math.min(1, endMultiplier));
        const fadeDuration = Math.max(0, duration);

        state.fadeMultiplier = clampedStart;
        this._applyMusicAudioVolume(audio);

        if (fadeDuration === 0) {
            state.fadeMultiplier = clampedEnd;
            this._applyMusicAudioVolume(audio);
            if (onComplete) onComplete();
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const startTime = Date.now();

            const fadeInterval = setInterval(() => {
                const currentState = this.musicAudioState.get(audio);
                if (!currentState) {
                    this.musicFadeIntervals.delete(audio);
                    clearInterval(fadeInterval);
                    resolve();
                    return;
                }

                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / fadeDuration, 1);

                currentState.fadeMultiplier = clampedStart + ((clampedEnd - clampedStart) * progress);
                this._applyMusicAudioVolume(audio);

                if (progress >= 1) {
                    this.musicFadeIntervals.delete(audio);
                    clearInterval(fadeInterval);
                    if (onComplete) onComplete();
                    resolve();
                }
            }, 16); // ~60fps updates

            this.musicFadeIntervals.set(audio, fadeInterval);
        });
    }
    
    /**
     * Fade out current music
     */
    _fadeOutMusic(audio = this.currentMusic) {
        if (!audio || !this.musicAudioState.has(audio)) return Promise.resolve();

        return this._fadeMusicAudio(
            audio,
            this._getMusicFadeMultiplier(audio),
            0,
            this.settings.fadeOutDuration,
            () => {
                if (this.currentMusic !== audio) {
                    this._stopAndCleanupMusicAudio(audio);
                }
            }
        );
    }
    
    /**
     * Fade in music
     */
    _fadeInMusic(audio, targetVolume) {
        const state = this.musicAudioState.get(audio);
        if (!state) return Promise.resolve();

        const effectiveTargetVolume = Math.max(0, Math.min(1, targetVolume));
        const effectiveVolume = this._getEffectiveVolume(state.trackVolume);
        const targetMultiplier = effectiveVolume === 0 ? 0 : Math.min(effectiveTargetVolume / effectiveVolume, 1);

        return new Promise((resolve) => {
            this._playMusicHandle(audio).then(() => {
                this._fadeMusicAudio(
                    audio,
                    this._getMusicFadeMultiplier(audio),
                    targetMultiplier,
                    this.settings.fadeOutDuration
                ).then(resolve);
            }).catch(err => {
                console.error("Error playing music:", err);
                this._stopAndCleanupMusicAudio(audio);
                resolve();
            });
        });
    }
    
    /**
     * Play a pre-loaded music track with fade transition
     * @param {string} name - Name of pre-loaded music track
     */
    async playMusic(name, config = {}) {
        if (!this.musicTracks.has(name)) {
            console.error(`Music track "${name}" not found. Make sure to load it first with loadMusic().`);
            return;
        }
        
        const track = this.musicTracks.get(name);
        const options = this._normalizeMusicConfig(config);
        const loop = options.loop ?? track.loop ?? this.musicLoop;
        
        // If same track is already playing, do nothing
        if (this.currentMusicName === name && this._isMusicHandlePlaying(this.currentMusic)) {
            this._setMusicHandleLoop(this.currentMusic, loop);
            return;
        }

        const outgoingMusic = this.currentMusic;
        const transitionToken = ++this.musicTransitionToken;

        if (this.musicStartTimeout) {
            clearTimeout(this.musicStartTimeout);
            this.musicStartTimeout = null;
        }

        this._stopInactiveMusicAudios();

        if (outgoingMusic) {
            this._clearMusicFade(outgoingMusic);
        }

        // Create a new playback handle from the pre-loaded track
        const newAudio = this._createMusicHandle(track, loop);
        this._registerMusicAudio(newAudio, track.volume, 0);

        // Calculate target volume
        const effectiveVolume = this._getEffectiveVolume(track.volume);
        const targetVolume = this.musicMuted ? 0 : effectiveVolume;

        // Set current music
        this.currentMusic = newAudio;
        this.currentMusicName = name;

        const fadeOutPromise = outgoingMusic
            ? this._fadeOutMusic(outgoingMusic)
            : Promise.resolve();

        const fadeInPromise = new Promise((resolve) => {
            const startFadeIn = async () => {
                this.musicStartTimeout = null;

                if (transitionToken !== this.musicTransitionToken) {
                    this._stopAndCleanupMusicAudio(newAudio);
                    resolve();
                    return;
                }

                await this._fadeInMusic(newAudio, targetVolume);
                resolve();
            };

            const fadeInDelay = Math.max(0, this.settings.fadeInDelay);
            if (fadeInDelay > 0) {
                this.musicStartTimeout = setTimeout(startFadeIn, fadeInDelay);
            } else {
                startFadeIn();
            }
        });

        await Promise.all([fadeOutPromise, fadeInPromise]);
    }
    
    /**
     * Alias for playMusic - swaps to a new music track
     * @param {string} name - Name of pre-loaded music track
     */
    async swapMusic(name, config = {}) {
        await this.playMusic(name, config);
    }
    
    /**
     * Stop current music immediately
     */
    stopMusic() {
        this.musicTransitionToken += 1;

        if (this.musicStartTimeout) {
            clearTimeout(this.musicStartTimeout);
            this.musicStartTimeout = null;
        }

        for (const audio of Array.from(this.musicAudioState.keys())) {
            this._stopAndCleanupMusicAudio(audio);
        }
    }
    
    /**
     * Mute/unmute music channel
     */
    muteMusic() {
        this.musicMuted = true;
        this._updateAllMusicVolumes();
    }
    
    unmuteMusic() {
        this.musicMuted = false;
        this._updateAllMusicVolumes();
    }
    
    /**
     * Set music channel volume (0-100)
     * @param {number} volume - Volume level 0-100
     */
    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(100, volume));
        this._updateAllMusicVolumes();
    }
    
    /**
     * Enable/disable music looping
     * @param {boolean} loop - Whether to loop music
     */
    setMusicLoop(loop) {
        this.musicLoop = loop;
        for (const audio of this.musicAudioState.keys()) {
            this._setMusicHandleLoop(audio, loop);
        }
    }

    /**
     * Play speech audio. Only one speech clip can be active at a time.
     * @param {string} src - Audio URL or path
     * @param {object} options - Speech playback and ducking options
     */
    async playSpeech(src, { volume = 100, duckMusic = true, duckMultiplier = 0.5 } = {}) {
        const resolvedSrc = this._resolveAudioSource(src);
        if (!resolvedSrc) {
            return false;
        }

        this.stopSpeech({ restoreMusic: !duckMusic });

        const playbackToken = ++this.speechPlaybackToken;
        const audio = new Audio(resolvedSrc);
        audio.preload = "auto";
        this.currentSpeechAudio = audio;
        this.currentSpeechVolume = Math.max(0, Math.min(100, volume));
        this._applySpeechVolume(audio);

        const cleanupSpeech = ({ restoreMusic = true } = {}) => {
            if (playbackToken !== this.speechPlaybackToken) {
                return;
            }

            this.currentSpeechAudio = null;

            if (restoreMusic && duckMusic) {
                this._fadeMusicDuckMultiplier(1);
            }
        };

        audio.addEventListener("ended", () => cleanupSpeech(), { once: true });
        audio.addEventListener("error", () => cleanupSpeech(), { once: true });

        try {
            await audio.play();
            if (playbackToken !== this.speechPlaybackToken || this.currentSpeechAudio !== audio) {
                audio.pause();
                return false;
            }

            if (duckMusic) {
                this._fadeMusicDuckMultiplier(duckMultiplier);
            }
            return true;
        } catch (error) {
            cleanupSpeech();
            throw error;
        }
    }

    /**
     * Stop active speech playback.
     */
    stopSpeech({ restoreMusic = true } = {}) {
        const audio = this.currentSpeechAudio;
        this.speechPlaybackToken += 1;
        this.currentSpeechAudio = null;

        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }

        if (restoreMusic) {
            this._fadeMusicDuckMultiplier(1);
        }
    }

    /**
     * Mute/unmute speech channel
     */
    muteSpeech() {
        this.speechMuted = true;
        this._applySpeechVolume();
    }

    unmuteSpeech() {
        this.speechMuted = false;
        this._applySpeechVolume();
    }

    /**
     * Set speech channel volume (0-100)
     * @param {number} volume - Volume level 0-100
     */
    setSpeechVolume(volume) {
        this.speechVolume = Math.max(0, Math.min(100, volume));
        this._applySpeechVolume();
    }
    
    /**
     * Play a pre-loaded sound effect
     * @param {string} name - Name of pre-loaded sound effect
     */
    playSoundFX(name) {
        if (!this.soundFX.has(name)) {
            console.error(`Sound effect "${name}" not found. Make sure to load it first with loadSoundFX().`);
            return;
        }
        
        const sound = this.soundFX.get(name);
        
        // Create new Audio instance for independent playback
        const audio = new Audio(sound.audio.src);
        
        // Calculate effective volume
        const effectiveVolume = this._getEffectiveVolume(sound.volume);
        audio.volume = this.soundFXMuted ? 0 : effectiveVolume;
        
        // Play the sound
        audio.play().catch(err => {
            console.error(`Error playing sound effect "${name}":`, err);
        });
    }
    
    /**
     * Mute/unmute sound effects channel
     */
    muteSoundFX() {
        this.soundFXMuted = true;
    }
    
    unmuteSoundFX() {
        this.soundFXMuted = false;
    }
    
    /**
     * Set sound effects channel volume (0-100)
     * @param {number} volume - Volume level 0-100
     */
    setSoundFXVolume(volume) {
        this.soundFXVolume = Math.max(0, Math.min(100, volume));
    }
    
    /**
     * Set master volume (0-100) - affects both channels
     * @param {number} volume - Volume level 0-100
     */
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(100, volume));
        this._updateAllMusicVolumes();
        this._applySpeechVolume();
    }
    
    /**
     * Mute all audio (master mute)
     */
    muteAll() {
        this.masterMuted = true;
        this._updateAllMusicVolumes();
        this._applySpeechVolume();
    }
    
    /**
     * Unmute all audio (master unmute)
     */
    unmuteAll() {
        this.masterMuted = false;
        this._updateAllMusicVolumes();
        this._applySpeechVolume();
    }
}
