// ./Server/chatServer.ts
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws'; // Import both WebSocketServer and WebSocket
import { createClient } from '@supabase/supabase-js';

// Types
interface Client {
  id: string;
  username: string;
  walletAddress?: string;
  ws: WebSocket; // Now WebSocket type is properly imported
  joinedAt: Date;
  lastActivity: Date;
}

interface ChatMessage {
  id: string;
  type: 'message' | 'user_joined' | 'user_left' | 'system';
  user: {
    id: string;
    username: string;
    avatar?: string;
    level?: number;
    badge?: string;
  };
  text: string;
  timestamp: string;
  isVerified: boolean;
}

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing required environment variables: SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Create HTTP server
const server = http.createServer((req, res) => {
  // Basic health check endpoint
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      activeClients: clients.size 
    }));
    return;
  }
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Chat Server - WebSocket endpoint available at ws://localhost:3002');
});

// Create a WebSocket server instance
const wss = new WebSocketServer({ server });

// Store connected clients
const clients = new Map<string, Client>();

// Message history (in production, this should be persisted)
const messageHistory: ChatMessage[] = [];
const MAX_HISTORY = 100;

// Utility functions
function generateClientId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function broadcastToAll(message: any, excludeClient?: string): void {
  const messageStr = JSON.stringify(message);
  clients.forEach((client, clientId) => {
    if (clientId !== excludeClient && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(messageStr);
      } catch (error) {
        console.error(`Error sending message to client ${clientId}:`, error);
        // Remove dead connection
        clients.delete(clientId);
      }
    }
  });
}

function saveMessageToHistory(message: ChatMessage): void {
  messageHistory.push(message);
  if (messageHistory.length > MAX_HISTORY) {
    messageHistory.shift();
  }
}

async function saveMessageToDatabase(message: ChatMessage): Promise<void> {
  try {
    const { error } = await supabase
      .from('chat_messages')
      .insert({
        user_id: message.user.id,
        username: message.user.username,
        message: message.text,
        message_type: message.type,
        created_at: message.timestamp,
        avatar: message.user.avatar,
        level: message.user.level,
        badge: message.user.badge
      });
    
    if (error) {
      console.error('Error saving message to database:', error);
    }
  } catch (error) {
    console.error('Error saving message to database:', error);
  }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  const clientId = generateClientId();
  
  console.log(`New client connected: ${clientId}`);
  
  // Initialize client
  const client: Client = {
    id: clientId,
    username: `Guest_${clientId.slice(-4)}`,
    ws: ws, // No need for type assertion now
    joinedAt: new Date(),
    lastActivity: new Date()
  };
  
  clients.set(clientId, client);
  
  // Send connection success message
  ws.send(JSON.stringify({
    type: 'connection_success',
    data: { clientId, timestamp: new Date().toISOString() }
  }));
  
  // Send current user count
  ws.send(JSON.stringify({
    type: 'user_count',
    data: { count: clients.size }
  }));
  
  // Send message history
  if (messageHistory.length > 0) {
    ws.send(JSON.stringify({
      type: 'history',
      data: messageHistory.slice(-50) // Send last 50 messages
    }));
  }
  
  // Broadcast user count to all clients
  broadcastToAll({
    type: 'user_count',
    data: { count: clients.size }
  });
  
  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      client.lastActivity = new Date();
      const parsedData = JSON.parse(data.toString());
      
      if (parsedData.type === 'message') {
        const messageData = parsedData.data;
        
        // Create message object
        const message: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'message',
          user: {
            id: messageData.user.id || clientId,
            username: messageData.user.username || client.username,
            avatar: messageData.user.avatar || '👤',
            level: messageData.user.level || 1,
            badge: messageData.user.badge || 'user'
          },
          text: messageData.text || '',
          timestamp: messageData.timestamp || new Date().toISOString(),
          isVerified: messageData.isVerified || false
        };
        
        // Basic message validation
        if (!message.text.trim() || message.text.length > 500) {
          ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'Invalid message content' }
          }));
          return;
        }
        
        // Update client info
        client.username = message.user.username;
        client.walletAddress = messageData.user.walletAddress;
        
        // Save to history and database
        saveMessageToHistory(message);
        await saveMessageToDatabase(message);
        
        // Broadcast to all clients
        broadcastToAll({
          type: 'message',
          data: message
        });
        
        console.log(`Message from ${client.username}: ${message.text}`);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Error processing message' }
      }));
    }
  });
  
  // Handle client disconnect
  ws.on('close', () => {
    console.log(`Client disconnected: ${clientId}`);
    clients.delete(clientId);
    
    // Broadcast updated user count
    broadcastToAll({
      type: 'user_count',
      data: { count: clients.size }
    });
    
    // Broadcast user left message
    broadcastToAll({
      type: 'user_left',
      data: { user: { id: clientId, username: client.username } }
    });
  });
  
  // Handle connection errors
  ws.on('error', (error) => {
    console.error(`WebSocket error for client ${clientId}:`, error);
    clients.delete(clientId);
  });
  
  // Send ping periodically to keep connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000); // 30 seconds
});

// Cleanup inactive connections
setInterval(() => {
  const now = new Date();
  clients.forEach((client, clientId) => {
    const inactiveTime = now.getTime() - client.lastActivity.getTime();
    if (inactiveTime > 300000) { // 5 minutes
      console.log(`Removing inactive client: ${clientId}`);
      try {
        client.ws.close();
      } catch (error) {
        console.error('Error closing inactive connection:', error);
      }
      clients.delete(clientId);
    }
  });
}, 60000); // Check every minute

// Start server
const PORT = process.env.CHAT_PORT || 3002;
server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Chat server shutting down...');
  wss.close(() => {
    server.close(() => {
      console.log('Chat server stopped');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('Chat server shutting down...');
  wss.close(() => {
    server.close(() => {
      console.log('Chat server stopped');
      process.exit(0);
    });
  });
});