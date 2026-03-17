# Netflix Trivia

Real-time, multiplayer trivia game with a Game Master view and player clients.
Built with Express + Socket.IO and powered by Open Trivia Database questions.

## Features
- Create rooms with unique 6-digit codes
- Multiple rounds and categories
- Difficulty modes (easy/medium/hard/kids)
- Live scoring and end-of-round/end-of-game rankings

## Tech Stack
- Node.js, Express
- Socket.IO (server and client)
- Axios
- Open Trivia Database API

## Getting Started
### Prerequisites
- Node.js (LTS recommended)

### Install
```bash
npm install
```

### Run
```bash
# development (auto-reload)
npm run dev

# production
npm start
```

Open in your browser:
- Game Master: `http://localhost:8080/game-master.html`
- Player: `http://localhost:8080/player.html`

## Configuration
Create a `.env` file if you want to override the default port:
```bash
PORT=8080
```

## Audio Manager
The frontend includes an `AudioManager` class in `public/audio-manager.js` for music playback, music crossfades, and one-shot sound effects.

### Setup
```html
<script src="audio-manager.js"></script>
```

```js
const audioManager = new AudioManager("audio/");
```

### Available Settings
The manager exposes a `settings` object:

- `audioManager.settings.fadeOutDuration`
  Duration in milliseconds used for both the outgoing music fade-out and the incoming music fade-in during a crossfade.
  Default: `1000`
- `audioManager.settings.fadeInDelay`
  Delay in milliseconds before the new track starts during a crossfade.
  Default: `0`
  With `0`, the new track starts immediately while the previous track fades out.

### Music Functions
- `await audioManager.loadMusic(name, file, volume = 100)`
  Preloads a music track and stores it under `name`.
- `await audioManager.playMusic(name)`
  Plays a preloaded track. If another music track is already playing, the manager crossfades from the old track to the new one.
- `await audioManager.swapMusic(name)`
  Alias for `playMusic(name)`.
- `audioManager.stopMusic()`
  Stops all active music immediately and cancels any in-progress crossfade.
- `audioManager.muteMusic()`
  Mutes currently active music playback.
- `audioManager.unmuteMusic()`
  Restores music playback after `muteMusic()`.
- `audioManager.setMusicVolume(volume)`
  Sets the `musicVolume` property.
  Current implementation note: this value is stored, but active track output is still based on each track's own loaded volume plus master mute/master volume behavior.
- `audioManager.setMusicLoop(loop)`
  Enables or disables looping for current and future music instances.

### Sound Effect Functions
- `await audioManager.loadSoundFX(name, file, volume = 100)`
  Preloads a sound effect and stores it under `name`.
- `audioManager.playSoundFX(name)`
  Plays a preloaded sound effect as a new `Audio` instance so multiple effects can overlap.
- `audioManager.muteSoundFX()`
  Mutes future sound effect playback.
- `audioManager.unmuteSoundFX()`
  Re-enables future sound effect playback.
- `audioManager.setSoundFXVolume(volume)`
  Sets the `soundFXVolume` property.
  Current implementation note: this value is stored, but playback volume is currently taken from the per-sound volume passed to `loadSoundFX()` plus master mute/master volume behavior.

### Master Controls
- `audioManager.setMasterVolume(volume)`
  Sets the `masterVolume` property and updates active music playback.
- `audioManager.muteAll()`
  Mutes all music playback through the master channel.
- `audioManager.unmuteAll()`
  Restores playback after `muteAll()`.

### Dynamic Sound Effect Helpers
When a sound effect is loaded, the manager also creates a camelCase helper method automatically if that method name does not already exist.

Examples:

- `await audioManager.loadSoundFX("buttonClick", "buttonClick.mp3", 80)` creates `audioManager.buttonClick()`
- `await audioManager.loadSoundFX("buttonConfirm", "buttonConfirm.mp3", 80)` creates `audioManager.buttonConfirm()`

### Example
```js
const audioManager = new AudioManager("audio/");

audioManager.settings.fadeOutDuration = 1000;
audioManager.settings.fadeInDelay = 0;

await audioManager.loadMusic("menuTheme", "menu_loop.mp3", 70);
await audioManager.loadMusic("gameTheme", "game_loop.mp3", 70);
await audioManager.loadSoundFX("buttonClick", "buttonClick.mp3", 80);

await audioManager.playMusic("menuTheme");
audioManager.playSoundFX("buttonClick");

// Crossfade to the next track
await audioManager.swapMusic("gameTheme");
```

## Project Structure
- `index.js` - Express server + Socket.IO setup
- `roomHandler.js` - Game/room lifecycle and socket events
- `public/` - Frontend HTML/CSS/assets

## Scripts
- `npm run dev` - Start server with nodemon
- `npm start` - Start server with Node

## Credits
Questions are fetched from the [Open Trivia Database](https://opentdb.com/).

## License
ISC
