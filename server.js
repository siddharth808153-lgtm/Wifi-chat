import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// Serve static assets from the React production build
const clientBuildPath = path.join(__dirname, 'client', 'dist');
app.use(express.static(clientBuildPath));

// Fallback for SPA routing: serve index.html for all non-file requests
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
    if (err) {
      // If client is not built yet, return a simple status message
      res.status(200).send(`
        <html>
          <head>
            <title>WiFi Chat Server</title>
            <style>
              body {
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: #0d1117;
                color: #e6edf3;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
              }
              .card {
                background: #161b22;
                border: 1px solid #30363d;
                border-radius: 12px;
                padding: 30px;
                max-width: 500px;
                text-align: center;
                box-shadow: 0 8px 24px rgba(0,0,0,0.5);
              }
              h1 { color: #58a6ff; margin-top: 0; }
              code { background: #21262d; padding: 4px 8px; border-radius: 6px; font-family: monospace; font-size: 1.1em; color: #ff7b72; }
              p { line-height: 1.6; color: #8b949e; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>WiFi Chat Server is Running! 🚀</h1>
              <p>The backend is active. To run the app, make sure to build the client frontend first by running:</p>
              <code>npm run build</code>
              <p>Or run in development mode with concurrently:</p>
              <code>npm run dev</code>
            </div>
          </body>
        </html>
      `);
    }
  });
});

const server = createServer(app);

// Initialize Socket.io with a 10MB payload size limit for images and voice notes
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e7
});

// Connected users cache: socket.id -> { id, nickname, avatar, color }
const users = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Send current users list to the new connection immediately (for their lobby)
  socket.emit('users-update', Array.from(users.values()));

  // User Joins
  socket.on('join', (userData) => {
    const requestedName = (userData.nickname || '').trim();
    if (!requestedName) {
      socket.emit('join-error', 'Nickname cannot be empty.');
      return;
    }

    // Check if nickname is already taken (case-insensitive)
    const nameTaken = Array.from(users.values()).some(
      u => u.nickname.toLowerCase() === requestedName.toLowerCase()
    );

    if (nameTaken) {
      socket.emit('join-error', 'This name is already in use, please change your name.');
      return;
    }

    const user = {
      id: socket.id,
      nickname: requestedName,
      avatar: userData.avatar || '🤖',
      color: userData.color || '#58a6ff'
    };

    users.set(socket.id, user);
    console.log(`👤 User joined: ${user.nickname} (${socket.id})`);

    // Acknowledge successful join
    socket.emit('join-success', {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      color: user.color
    });

    // Broadcast updated user list
    io.emit('users-update', Array.from(users.values()));

    // Send system message about user joining
    io.emit('message', {
      id: `sys-${Date.now()}-${Math.random()}`,
      sender: 'System',
      isSystem: true,
      text: `${user.nickname} has joined the chat!`,
      timestamp: new Date().toISOString()
    });
  });

  // Message Sent
  socket.on('send-message', (msgData) => {
    const user = users.get(socket.id);
    if (!user) return;

    const fullMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      sender: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        color: user.color
      },
      text: msgData.text || '',
      type: msgData.type || 'text', // 'text', 'image', 'voice', 'file'
      fileData: msgData.fileData || null, // Base64 content for images/audio/files
      fileName: msgData.fileName || null,
      fileSize: msgData.fileSize || null,
      timestamp: new Date().toISOString()
    };

    // Broadcast the message to everyone (including sender)
    io.emit('message', fullMessage);
  });

  // Typing Indicators
  socket.on('typing', (isTyping) => {
    const user = users.get(socket.id);
    if (!user) return;

    socket.broadcast.emit('user-typing', {
      id: socket.id,
      nickname: user.nickname,
      avatar: user.avatar,
      color: user.color,
      isTyping
    });
  });

  // Leave Chat Room (returns to lobby)
  socket.on('leave', () => {
    const user = users.get(socket.id);
    if (user) {
      console.log(`👤 User left chat: ${user.nickname} (${socket.id})`);
      users.delete(socket.id);

      // Broadcast updated user list
      io.emit('users-update', Array.from(users.values()));

      // Send system message about user leaving
      io.emit('message', {
        id: `sys-${Date.now()}-${Math.random()}`,
        sender: 'System',
        isSystem: true,
        text: `${user.nickname} has left the chat.`,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      console.log(`🔌 Client disconnected: ${user.nickname} (${socket.id})`);
      users.delete(socket.id);

      // Broadcast updated user list
      io.emit('users-update', Array.from(users.values()));

      // Send system message about user leaving
      io.emit('message', {
        id: `sys-${Date.now()}-${Math.random()}`,
        sender: 'System',
        isSystem: true,
        text: `${user.nickname} has left the chat.`,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log(`🔌 Client disconnected: ${socket.id} (unjoined)`);
    }
  });
});

// Function to scan local network interfaces to locate the WiFi IP
function getLocalWiFiIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Filter for IPv4 and non-internal addresses
      if (net.family === 'IPv4' && !net.internal) {
        // Exclude virtual/docker interfaces if any, but include common ones
        ips.push({ name, address: net.address });
      }
    }
  }
  return ips;
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  const wifiIPs = getLocalWiFiIPs();
  
  console.log('\n==================================================');
  console.log('🚀 WIFI CHAT SERVER IS LIVE!');
  console.log(`🏠 Local address: http://localhost:${PORT}`);
  
  if (wifiIPs.length > 0) {
    console.log('\n📱 Scan or open these addresses on devices on your WiFi:');
    wifiIPs.forEach(ip => {
      console.log(`   👉 http://${ip.address}:${PORT}  (${ip.name})`);
    });
  } else {
    console.log('\n⚠️ No external network interface found. Ensure you are connected to WiFi.');
  }
  console.log('==================================================\n');
});
