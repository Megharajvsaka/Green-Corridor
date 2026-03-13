import { io } from 'socket.io-client';

// Singleton socket connection — created once, imported everywhere
const socket = io('http://localhost:3001', {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export default socket;
