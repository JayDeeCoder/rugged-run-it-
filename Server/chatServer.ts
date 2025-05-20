// Server/chatServer.ts
import WebSocket from 'ws';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';

// Define types for our chat messages
interface User {
  id: string;
  username: string;
  avatar?: string;
  level?: number;
  badge?: string;
}

interface ChatMessage {
  id: string;
  user: User;
  text: string;
  timestamp: string;
  isVerified?: boolean;
}

interface Client {
  socket: WebSocket;
  user: User | null;
}

// Define specific data types for each message type
interface MessageData {
  text: string;
  user: User;
  id?: string;
  timestamp?: string;
  isVerified?: boolean;
}

interface UserJoinedData {
  user: User;
}

interface UserLeftData {
  user: User;
}

interface ErrorData {
  message: string;
  code?: number;
}

interface UserCountData {
  count: number;
}

interface ConnectionSuccessData {
  clientId: string;
}

// Define the socket message with a union type for data
type SocketMessage = 
  | { type: 'message'; data: MessageData }
  | { type: 'user_joined'; data: UserJoinedData }
  | { type: 'user_left'; data: UserLeftData }
  | { type: 'error'; data: ErrorData }
  | { type: 'history'; data: ChatMessage[] }
  | { type: 'user_count'; data: UserCountData }
  | { type: 'connection_success'; data: ConnectionSuccessData };

// Create an HTTP server
const server = http.createServer();

// Create a WebSocket server instance
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Map<string, Client>();

// Store recent messages (limited history)
const messageHistory: ChatMessage[] = [];
const MAX_HISTORY = 50;

// Broadcast message to all connected clients
function broadcast(message: SocketMessage): void {
  const data = JSON.stringify(message);
  
  clients.forEach((client) => {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(data);
    }
  });
}

// Send user count to all clients
function broadcastUserCount(): void {
  broadcast({
    type: 'user_count',
    data: { count: clients.size }
  });
}

// Handle new WebSocket connections
wss.on('connection', (socket: WebSocket) => {
  const clientId = uuidv4();
  
  // Store new client
  clients.set(clientId, {
    socket,
    user: null, // Will be populated when they send a message
  });
  
  console.log(`Client connected: ${clientId}. Total clients: ${clients.size}`);
  
  // Send connection confirmation
  socket.send(JSON.stringify({
    type: 'connection_success',
    data: { clientId }
  }));
  
  // Send message history to new client
  socket.send(JSON.stringify({
    type: 'history',
    data: messageHistory
  }));
  
  // Update user count for all clients
  broadcastUserCount();
  
  // Handle incoming messages
  socket.on('message', (data: WebSocket.Data) => {
    try {
      // We need to parse JSON and do type checking
      const parsed = JSON.parse(data.toString());
      
      // Basic validation that it's a SocketMessage
      if (typeof parsed === 'object' && parsed !== null && 'type' in parsed && 'data' in parsed) {
        const message = parsed as SocketMessage;
        
        if (message.type === 'message') {
          // Add an ID to the message
          const id = uuidv4();
          const timestamp = new Date().toISOString();
          
          // Create the chat message
          const chatMessage: ChatMessage = {
            ...message.data,
            id,
            timestamp
          };
          
          // Save to history
          messageHistory.push(chatMessage);
          if (messageHistory.length > MAX_HISTORY) {
            messageHistory.shift(); // Remove oldest message when limit reached
          }
          
          // Update client info if needed
          if (message.data.user && message.data.user.id) {
            const client = clients.get(clientId);
            if (client) {
              client.user = message.data.user;
            }
          }
          
          // Broadcast to all clients
          broadcast({
            type: 'message',
            data: chatMessage
          });
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  // Handle disconnection
  socket.on('close', () => {
    const client = clients.get(clientId);
    
    if (client && client.user) {
      // Notify others that a user has left
      broadcast({
        type: 'user_left',
        data: { user: client.user }
      });
    }
    
    // Remove client
    clients.delete(clientId);
    console.log(`Client disconnected: ${clientId}. Total clients: ${clients.size}`);
    
    // Update user count
    broadcastUserCount();
  });
});

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});