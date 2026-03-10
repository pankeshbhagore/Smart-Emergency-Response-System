import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const socket = io(BACKEND_URL, {
  transports:         ["websocket", "polling"],
  withCredentials:    true,
  autoConnect:        true,
  reconnection:       true,
  reconnectionDelay:  1000,
  reconnectionAttempts: 10,
});

export default socket;
