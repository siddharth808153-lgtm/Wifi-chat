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

// Messages storage for edit/delete functionality
const messages = new Map();

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
    // Detect @mentions in text and map to user socket ids
    const rawText = msgData.text || '';
    const mentionRegex = /@([A-Za-z0-9_\-]+)/g;
    const mentions = [];
    let match;
    while ((match = mentionRegex.exec(rawText)) !== null) {
      const name = match[1];
      const target = Array.from(users.values()).find(u => u.nickname.toLowerCase() === name.toLowerCase());
      if (target && !mentions.includes(target.id)) {
        mentions.push(target.id);
      }
    }

    const recipientId = msgData.recipientId;

    const fullMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      sender: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        color: user.color
      },
      recipientId: recipientId || null,
      text: rawText,
      type: msgData.type || 'text', // 'text', 'image', 'voice', 'file'
      fileData: msgData.fileData || null, // Base64 content for images/audio/files
      fileName: msgData.fileName || null,
      fileSize: msgData.fileSize || null,
      timestamp: new Date().toISOString(),
      edited: false,
      mentions: recipientId ? [] : mentions // no mentions for DMs
    };

    // Store message for edit/delete operations
    messages.set(fullMessage.id, fullMessage);

    if (recipientId) {
      // Send only to sender and recipient
      socket.emit('message', fullMessage);
      io.to(recipientId).emit('message', fullMessage);
    } else {
      // Broadcast the message to everyone (including sender)
      io.emit('message', fullMessage);

      // Notify mentioned users directly (non-blocking)
      if (mentions.length > 0) {
        mentions.forEach((targetId) => {
          if (targetId !== socket.id) {
            io.to(targetId).emit('mentioned', {
              messageId: fullMessage.id,
              from: user.nickname,
              text: fullMessage.text,
              timestamp: fullMessage.timestamp
            });
          }
        });
      }
    }
  });

  // Edit Message
  socket.on('edit-message', (editData) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = messages.get(editData.messageId);
    if (!message) {
      socket.emit('edit-error', 'Message not found');
      return;
    }

    // Only the sender can edit their message
    if (message.sender.id !== user.id) {
      socket.emit('edit-error', 'You can only edit your own messages');
      return;
    }

    // Update the message
    message.text = editData.text;
    message.edited = true;
    message.editedAt = new Date().toISOString();

    if (message.recipientId) {
      io.to(message.sender.id).emit('message-edited', {
        messageId: editData.messageId,
        text: editData.text,
        editedAt: message.editedAt
      });
      io.to(message.recipientId).emit('message-edited', {
        messageId: editData.messageId,
        text: editData.text,
        editedAt: message.editedAt
      });
    } else {
      // Broadcast the edit to everyone
      io.emit('message-edited', {
        messageId: editData.messageId,
        text: editData.text,
        editedAt: message.editedAt
      });
    }
  });

  // Delete Message
  socket.on('delete-message', (deleteData) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = messages.get(deleteData.messageId);
    if (!message) {
      socket.emit('delete-error', 'Message not found');
      return;
    }

    // Only the sender can delete their message
    if (message.sender.id !== user.id) {
      socket.emit('delete-error', 'You can only delete your own messages');
      return;
    }

    const recipientId = message.recipientId;

    // Delete the message
    messages.delete(deleteData.messageId);

    if (recipientId) {
      io.to(message.sender.id).emit('message-deleted', {
        messageId: deleteData.messageId
      });
      io.to(recipientId).emit('message-deleted', {
        messageId: deleteData.messageId
      });
    } else {
      // Broadcast the deletion to everyone
      io.emit('message-deleted', {
        messageId: deleteData.messageId
      });
    }
  });

  // Add/Remove Reaction to Message
  socket.on('toggle-reaction', (reactionData) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = messages.get(reactionData.messageId);
    if (!message) {
      socket.emit('reaction-error', 'Message not found');
      return;
    }

    // Initialize reactions object if it doesn't exist
    if (!message.reactions) {
      message.reactions = {};
    }

    const emoji = reactionData.emoji;
    if (!message.reactions[emoji]) {
      message.reactions[emoji] = [];
    }

    // Check if user already reacted with this emoji
    const userReacted = message.reactions[emoji].includes(user.id);

    if (userReacted) {
      // Remove reaction
      message.reactions[emoji] = message.reactions[emoji].filter(id => id !== user.id);
      if (message.reactions[emoji].length === 0) {
        delete message.reactions[emoji];
      }
    } else {
      // Add reaction
      message.reactions[emoji].push(user.id);
    }

    if (message.recipientId) {
      io.to(message.sender.id).emit('message-reaction-updated', {
        messageId: reactionData.messageId,
        reactions: message.reactions
      });
      io.to(message.recipientId).emit('message-reaction-updated', {
        messageId: reactionData.messageId,
        reactions: message.reactions
      });
    } else {
      // Broadcast the reaction update to everyone
      io.emit('message-reaction-updated', {
        messageId: reactionData.messageId,
        reactions: message.reactions
      });
    }
  });

  // Typing Indicators
  socket.on('typing', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    let isTyping = false;
    let recipientId = null;

    if (data && typeof data === 'object') {
      isTyping = !!data.isTyping;
      recipientId = data.recipientId || null;
    } else {
      isTyping = !!data;
    }

    if (recipientId) {
      // Send typing status to private recipient only
      io.to(recipientId).emit('user-typing', {
        id: socket.id,
        nickname: user.nickname,
        avatar: user.avatar,
        color: user.color,
        isTyping,
        recipientId
      });
    } else {
      // Broadcast typing status to everyone else
      socket.broadcast.emit('user-typing', {
        id: socket.id,
        nickname: user.nickname,
        avatar: user.avatar,
        color: user.color,
        isTyping,
        recipientId: null
      });
    }
  });

  // Collaborative Sketchpad Sync
  socket.on('drawing-stroke', (drawData) => {
    const recipientId = drawData.recipientId;
    if (recipientId) {
      io.to(recipientId).emit('drawing-stroke', drawData);
    } else {
      socket.broadcast.emit('drawing-stroke', drawData);
    }
  });

  socket.on('drawing-clear', (clearData) => {
    const recipientId = clearData.recipientId;
    if (recipientId) {
      io.to(recipientId).emit('drawing-clear', clearData);
    } else {
      socket.broadcast.emit('drawing-clear', clearData);
    }
  });

  socket.on('drawing-activity', (activityData) => {
    const recipientId = activityData.recipientId;
    if (recipientId) {
      io.to(recipientId).emit('drawing-activity', activityData);
    } else {
      socket.broadcast.emit('drawing-activity', activityData);
    }
  });

  socket.on('request-canvas-state', (requestData) => {
    const recipientId = requestData.recipientId;
    if (recipientId) {
      io.to(recipientId).emit('request-canvas-state', requestData);
    } else {
      socket.broadcast.emit('request-canvas-state', requestData);
    }
  });

  socket.on('send-canvas-state', (stateData) => {
    const recipientId = stateData.recipientId;
    if (recipientId) {
      io.to(recipientId).emit('send-canvas-state', stateData);
    } else {
      socket.broadcast.emit('send-canvas-state', stateData);
    }
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
