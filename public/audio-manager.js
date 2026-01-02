/**
 * AudioManager - Handles background music and sound effects
 * Supports fade transitions for music and independent sound effect playback
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
            fadeInDelay: 500 // milliseconds
        };
        
        // Fade interval tracking
        this.fadeInterval = null;
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
     * Fade out current music
     */
    _fadeOutMusic() {
        if (!this.currentMusic) return Promise.resolve();
        
        return new Promise((resolve) => {
            const startVolume = this.currentMusic.volume;
            const startTime = Date.now();
            const duration = this.settings.fadeOutDuration;
            
            // Clear any existing fade interval
            if (this.fadeInterval) {
                clearInterval(this.fadeInterval);
            }
            
            this.fadeInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                if (progress >= 1) {
                    clearInterval(this.fadeInterval);
                    this.fadeInterval = null;
                    this.currentMusic.pause();
                    this.currentMusic.currentTime = 0;
                    this.currentMusic = null;
                    this.currentMusicName = null;
                    resolve();
                } else {
                    const newVolume = startVolume * (1 - progress);
                    this.currentMusic.volume = newVolume;
                }
            }, 16); // ~60fps updates
        });
    }
    
    /**
     * Fade in music
     */
    _fadeInMusic(audio, targetVolume) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const duration = this.settings.fadeOutDuration; // Use same duration for fade in
            const startVolume = 0;
            
            audio.volume = startVolume;
            audio.play().catch(err => {
                console.error("Error playing music:", err);
                resolve();
            });
            
            const fadeInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                if (progress >= 1) {
                    clearInterval(fadeInterval);
                    audio.volume = targetVolume;
                    resolve();
                } else {
                    const newVolume = startVolume + (targetVolume - startVolume) * progress;
                    audio.volume = newVolume;
                }
            }, 16); // ~60fps updates
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
        
        // Fade out current music
        await this._fadeOutMusic();
        
        // Wait for fade in delay
        await new Promise(resolve => setTimeout(resolve, this.settings.fadeInDelay));
        
        // Create new Audio instance from the pre-loaded track
        const newAudio = new Audio(track.audio.src);
        newAudio.loop = this.musicLoop;
        
        // Calculate target volume
        const effectiveVolume = this._getEffectiveVolume(track.volume);
        const targetVolume = this.musicMuted ? 0 : effectiveVolume;
        
        // Set current music
        this.currentMusic = newAudio;
        this.currentMusicName = name;
        
        // Fade in new music
        await this._fadeInMusic(newAudio, targetVolume);
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
        if (this.fadeInterval) {
            clearInterval(this.fadeInterval);
            this.fadeInterval = null;
        }
        
        if (this.currentMusic) {
            this.currentMusic.pause();
            this.currentMusic.currentTime = 0;
            this.currentMusic = null;
            this.currentMusicName = null;
        }
    }
    
    /**
     * Mute/unmute music channel
     */
    muteMusic() {
        this.musicMuted = true;
        if (this.currentMusic) {
            this.currentMusic.volume = 0;
        }
    }
    
    unmuteMusic() {
        this.musicMuted = false;
        if (this.currentMusic && this.currentMusicName) {
            const track = this.musicTracks.get(this.currentMusicName);
            if (track) {
                const effectiveVolume = this._getEffectiveVolume(track.volume);
                this.currentMusic.volume = effectiveVolume;
            }
        }
    }
    
    /**
     * Set music channel volume (0-100)
     * @param {number} volume - Volume level 0-100
     */
    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(100, volume));
        if (this.currentMusic && this.currentMusicName) {
            const track = this.musicTracks.get(this.currentMusicName);
            if (track) {
                const effectiveVolume = this._getEffectiveVolume(track.volume);
                this.currentMusic.volume = this.musicMuted ? 0 : effectiveVolume;
            }
        }
    }
    
    /**
     * Enable/disable music looping
     * @param {boolean} loop - Whether to loop music
     */
    setMusicLoop(loop) {
        this.musicLoop = loop;
        if (this.currentMusic) {
            this.currentMusic.loop = loop;
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
        
        // Update currently playing music volume
        if (this.currentMusic && this.currentMusicName) {
            const track = this.musicTracks.get(this.currentMusicName);
            if (track) {
                const effectiveVolume = this._getEffectiveVolume(track.volume);
                this.currentMusic.volume = this.musicMuted ? 0 : effectiveVolume;
            }
        }
    }
    
    /**
     * Mute all audio (master mute)
     */
    muteAll() {
        this.masterMuted = true;
        if (this.currentMusic) {
            this.currentMusic.volume = 0;
        }
    }
    
    /**
     * Unmute all audio (master unmute)
     */
    unmuteAll() {
        this.masterMuted = false;
        if (this.currentMusic && this.currentMusicName) {
            const track = this.musicTracks.get(this.currentMusicName);
            if (track) {
                const effectiveVolume = this._getEffectiveVolume(track.volume);
                this.currentMusic.volume = this.musicMuted ? 0 : effectiveVolume;
            }
        }
    }
}

