/**
 * AudioManager - Handles background music and sound effects
 * Supports crossfaded music transitions and independent sound effect playback
 */
class AudioManager {
    constructor(baseSoundPath = "") {
        this.baseSoundPath = baseSoundPath;
        
        // Music channel
        this.musicTracks = new Map(); // Store pre-loaded music tracks
        this.currentMusic = null; // Currently playing Audio object
        this.currentMusicName = null; // Name of currently playing track
        this.musicVolume = 100; // 0-100
        this.musicMuted = false;
        this.musicLoop = true; // Default to looping
        
        // Sound effects channel
        this.soundFX = new Map(); // Store pre-loaded sound effects
        this.soundFXVolume = 100; // 0-100
        this.soundFXMuted = false;
        
        // Master controls
        this.masterVolume = 100; // 0-100
        this.masterMuted = false;
        
        // Settings
        this.settings = {
            fadeOutDuration: 1000, // milliseconds
            fadeInDelay: 0 // milliseconds before the incoming track joins the crossfade
        };
        
        // Music transition tracking
        this.musicFadeIntervals = new Map();
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
     * Pre-load a music track
     * @param {string} name - Name identifier for the music track
     * @param {string} file - Filename relative to baseSoundPath
     * @param {number} volume - Volume level (0-100), defaults to 100
     * @returns {Promise} Resolves when music is loaded
     */
    async loadMusic(name, file, volume = 100) {
        return new Promise((resolve, reject) => {
            const audio = new Audio(this.baseSoundPath + file);
            audio.loop = this.musicLoop;
            audio.volume = 0; // Start at 0, will be set when playing
            
            audio.addEventListener('canplaythrough', () => {
                this.musicTracks.set(name, {
                    audio: audio,
                    volume: Math.max(0, Math.min(100, volume)),
                    file: file
                });
                resolve();
            }, { once: true });
            
            audio.addEventListener('error', (e) => {
                reject(new Error(`Failed to load music "${name}" from "${file}": ${e.message}`));
            }, { once: true });
            
            // Start loading
            audio.load();
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
     * Track a music audio instance so its volume can be updated during crossfades
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
        audio.volume = targetVolume * state.fadeMultiplier;
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
     * Stop a music audio instance and remove all tracking for it
     */
    _stopAndCleanupMusicAudio(audio) {
        if (!audio) return;

        this._clearMusicFade(audio);
        audio.pause();
        audio.currentTime = 0;
        this.musicAudioState.delete(audio);

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
            audio.play().then(() => {
                this._fadeMusicAudio(
                    audio,
                    this._getMusicFadeMultiplier(audio),
                    targetMultiplier,
                    this.settings.fadeOutDuration
                ).then(resolve);
            }).catch(err => {
                console.error("Error playing music:", err);
                resolve();
            });
        });
    }
    
    /**
     * Play a pre-loaded music track with fade transition
     * @param {string} name - Name of pre-loaded music track
     */
    async playMusic(name) {
        if (!this.musicTracks.has(name)) {
            console.error(`Music track "${name}" not found. Make sure to load it first with loadMusic().`);
            return;
        }
        
        const track = this.musicTracks.get(name);
        
        // If same track is already playing, do nothing
        if (this.currentMusicName === name && this.currentMusic && !this.currentMusic.paused) {
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

        // Create new Audio instance from the pre-loaded track
        const newAudio = new Audio(track.audio.src);
        newAudio.loop = this.musicLoop;
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
    async swapMusic(name) {
        await this.playMusic(name);
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
            audio.loop = loop;
        }
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
    }
    
    /**
     * Mute all audio (master mute)
     */
    muteAll() {
        this.masterMuted = true;
        this._updateAllMusicVolumes();
    }
    
    /**
     * Unmute all audio (master unmute)
     */
    unmuteAll() {
        this.masterMuted = false;
        this._updateAllMusicVolumes();
    }
}
