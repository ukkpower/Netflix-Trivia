import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import roomHandler from "./roomHandler.js";

dotenv.config();
const app = express();
 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://rps-x3cb.onrender.com",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Use a Map for rooms to enable efficient lookups and modifications
const rooms = new Map();

io.on("connection", (socket) => {
  console.log("connected", socket.id);
  console.log(`Total connections: ${io.sockets.sockets.size}`); // Get total connections

  // Pass the Map instead of an array
  roomHandler(io, socket, rooms);

  socket.on("disconnect", () => {
    console.log("disconnected", socket.id);
    console.log(`Total connections: ${io.sockets.sockets.size}`); // Get updated total
  });
});

const port = process.env.PORT || 8080;
httpServer.listen(port, () => console.log(`Listening on port ${port}`));
