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

## Game Master Internationalization
The Game Master UI in [public/game-master.html](/Users/keithpower/Documents/Websites/Netflix-Trivia/public/game-master.html) supports dependency-free translations loaded in the browser.

### How It Works
- Locale selection is driven by the `lang` query parameter.
- English is the default fallback locale.
- Game Master locale files live in [public/lang/game-master/](/Users/keithpower/Documents/Websites/Netflix-Trivia/public/lang/game-master/).
- Game Master uses its own loader at [public/lang/game-master/lang.js](/Users/keithpower/Documents/Websites/Netflix-Trivia/public/lang/game-master/lang.js).
- Player uses a separate loader and separate locale files in [public/lang/player/](/Users/keithpower/Documents/Websites/Netflix-Trivia/public/lang/player/).

Examples:

- `http://localhost:8080/game-master.html`
- `http://localhost:8080/game-master.html?lang=en`
- `http://localhost:8080/game-master.html?lang=de`

### Files
- [public/lang/game-master/lang.js](/Users/keithpower/Documents/Websites/Netflix-Trivia/public/lang/game-master/lang.js) - Game Master browser-side i18n loader
- [public/lang/game-master/en.json](/Users/keithpower/Documents/Websites/Netflix-Trivia/public/lang/game-master/en.json) - Game Master source/default locale
- [public/lang/game-master/de.json](/Users/keithpower/Documents/Websites/Netflix-Trivia/public/lang/game-master/de.json) - Game Master German locale
- [public/lang/player/lang.js](/Users/keithpower/Documents/Websites/Netflix-Trivia/public/lang/player/lang.js) - Player browser-side i18n loader
- [public/lang/player/en.json](/Users/keithpower/Documents/Websites/Netflix-Trivia/public/lang/player/en.json) - Player source/default locale
- [public/lang/player/de.json](/Users/keithpower/Documents/Websites/Netflix-Trivia/public/lang/player/de.json) - Player German locale

### Markup and Script Conventions
- Use `data-i18n` for plain text nodes.
- Use `data-i18n-html` only when translated markup is required.
- Use `data-i18n-aria-label`, `data-i18n-alt`, and `data-i18n-data-description` for translated attributes.
- For runtime-generated text in JavaScript, use `window.i18n.t("some.key")`.
- For known fixed category names returned from the backend, use `window.i18n.translateCategory(value)` for display only.
- Keep internal category identifiers such as `data-category="Sports"` in English. These are part of the game logic and should not be localized.

### `window.i18n` API
Both page-specific loaders expose the same API:

- `init({ defaultLang, supportedLangs })`
- `t(key, vars = {})`
- `apply(root = document)`
- `translateCategory(value)`
- `getLocale()`

### Adding a New Language
1. Decide which page you are translating:
   - Game Master: [public/lang/game-master/](/Users/keithpower/Documents/Websites/Netflix-Trivia/public/lang/game-master/)
   - Player: [public/lang/player/](/Users/keithpower/Documents/Websites/Netflix-Trivia/public/lang/player/)
2. Copy that page's `en.json` to a new file such as `fr.json`.
3. Translate the values but keep the JSON structure and keys identical to that page's English file.
4. Add the new locale code to the `supportedLangs` list in the page entrypoint:
   - [public/game-master.html](/Users/keithpower/Documents/Websites/Netflix-Trivia/public/game-master.html)
   - [public/player.html](/Users/keithpower/Documents/Websites/Netflix-Trivia/public/player.html)
5. Load the page with the new query param, for example `game-master.html?lang=fr` or `player.html?lang=fr`.
6. For Game Master, click through and verify:
   - welcome/setup copy
   - category modal copy
   - custom quiz modal copy
   - timer labels and toggle state
   - room-code ARIA labels
   - alert/modal messages
   - round/category labels for known categories
7. For Player, verify:
   - splash/welcome/join screens
   - placeholders and connection status
   - join/rejoin error messages
   - answer toast text
   - end-of-round and end-of-game panels

### Why It Is Split
- Game Master may be packaged into Electron later.
- Player remains a web page served independently.
- The two pages follow the same translation standards, but keep separate loaders and JSON files so their release and packaging paths stay decoupled.

### Important Scope Rule
- Only the Game Master UI is translated right now.
- Questions, answers, and other backend-provided trivia content are not translated.
- Unknown backend category/subcategory names are shown as-is unless they match a known fixed category handled by `translateCategory()`.

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
- `await audioManager.loadMusic(name, file, volume = 100, config = {})`
  Preloads a music track and stores it under `name`.
  Optional `config.loop` sets that track's default loop behavior.
- `await audioManager.playMusic(name, config = {})`
  Plays a preloaded track. If another music track is already playing, the manager crossfades from the old track to the new one.
  Optional `config.loop` overrides loop behavior for that playback request.
- `await audioManager.swapMusic(name, config = {})`
  Alias for `playMusic(name, config)`.
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
  This is the global default when no per-track or per-playback `loop` override is supplied.

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

await audioManager.playMusic("menuTheme", { loop: true });
audioManager.playSoundFX("buttonClick");

// Crossfade to the next track
await audioManager.swapMusic("gameTheme", { loop: false });
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
