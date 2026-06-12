import { io } from "socket.io-client";

// Empty/undefined => connect to the same origin, which Vite proxies to the backend.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});
