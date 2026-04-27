import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

interface ConversationEvent {
  id: number;
  phoneNumber: string;
  contactName: string | null;
  message: string;
  response: string;
  source: "template" | "ai" | "agent" | "after_hours";
  language?: string;
  sentiment?: string;
  createdAt: Date;
}

interface AppointmentEvent {
  appointmentId: number;
  tenantId: number;
  contactName: string | null;
  phoneNumber: string;
}

export function useWhatsAppSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<ConversationEvent | null>(null);
  const [lastAppointment, setLastAppointment] = useState<AppointmentEvent | null>(null);

  useEffect(() => {
    const socket = io("/", { withCredentials: true, transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => { setIsConnected(true); socket.emit("join:dashboard"); });
    socket.on("disconnect", () => setIsConnected(false));
    socket.on("conversation:new", (data: ConversationEvent) => setLastMessage(data));
    socket.on("appointment:new", (data: AppointmentEvent) => setLastAppointment(data));

    return () => { socket.disconnect(); };
  }, []);

  return { socket: socketRef.current, isConnected, lastMessage, lastAppointment };
}
