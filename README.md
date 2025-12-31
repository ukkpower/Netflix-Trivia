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
- Alternate player UI: `http://localhost:8080/player-netflix-redesign.html`

## Configuration
Create a `.env` file if you want to override the default port:
```bash
PORT=8080
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
