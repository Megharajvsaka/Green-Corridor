import { io } from "socket.io-client";

// backend URL on Render
const socket = io("https://green-corridor.onrender.com", {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export default socket;