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

// Channels storage: default channel definitions
const defaultChannels = [
  { id: 'general', name: 'general', icon: '🌐', description: 'General community discussion' },
  { id: 'gaming', name: 'gaming', icon: '🎮', description: 'Gaming, anime & banter' },
  { id: 'music', name: 'music', icon: '🎵', description: 'Music recommendations & jams' },
  { id: 'memes', name: 'memes', icon: '🔥', description: 'Memes, clips & media' }
];
const channels = new Map(defaultChannels.map(c => [c.id, c]));

// Pinned messages storage: chatKey -> message
const pinnedMessages = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Send current users, channels, and pinned messages to new connection immediately
  socket.emit('users-update', Array.from(users.values()));
  socket.emit('channels-update', Array.from(channels.values()));
  socket.emit('pinned-messages-sync', Object.fromEntries(pinnedMessages));

  // Channel Creation
  socket.on('create-channel', ({ name, icon, description }) => {
    const rawName = (name || '').toLowerCase().trim();
    const cleanId = rawName.replace(/[^a-z0-9_-]/g, '-').slice(0, 24);
    if (!cleanId || cleanId.length < 2) {
      socket.emit('channel-error', 'Channel name must be at least 2 characters.');
      return;
    }
    if (channels.has(cleanId)) {
      socket.emit('channel-error', 'A channel with this name already exists.');
      return;
    }
    const user = users.get(socket.id);
    const creatorName = user ? user.nickname : 'Someone';

    const newChannel = {
      id: cleanId,
      name: cleanId,
      icon: icon || '💬',
      description: description || `Welcome to #${cleanId}!`,
      createdBy: creatorName,
      createdAt: new Date().toISOString()
    };
    channels.set(cleanId, newChannel);
    io.emit('channels-update', Array.from(channels.values()));

    // Broadcast system message
    const sysMsg = {
      id: `sys-${Date.now()}-${Math.random()}`,
      sender: 'System',
      isSystem: true,
      channelId: cleanId,
      text: `#${cleanId} channel was created by ${creatorName}!`,
      timestamp: new Date().toISOString()
    };
    messages.set(sysMsg.id, sysMsg);
    io.emit('message', sysMsg);
  });

  // Pin Message
  socket.on('pin-message', ({ chatKey, messageId }) => {
    const user = users.get(socket.id);
    if (!user) return;
    const msg = messages.get(messageId);
    if (!msg) {
      socket.emit('pin-error', 'Message not found');
      return;
    }
    pinnedMessages.set(chatKey, msg);
    io.emit('pinned-message-updated', { chatKey, pinnedMessage: msg });
  });

  // Unpin Message
  socket.on('unpin-message', ({ chatKey }) => {
    const user = users.get(socket.id);
    if (!user) return;
    pinnedMessages.delete(chatKey);
    io.emit('pinned-message-updated', { chatKey, pinnedMessage: null });
  });

  // DM Read Receipts: mark messages from senderId as read by current socket
  socket.on('mark-read', ({ senderId }) => {
    const user = users.get(socket.id);
    if (!user || !senderId) return;

    let hasUnread = false;
    for (const [id, msg] of messages.entries()) {
      if (msg.recipientId === socket.id && msg.sender.id === senderId && !msg.read) {
        msg.read = true;
        msg.readAt = new Date().toISOString();
        hasUnread = true;
      }
    }

    if (hasUnread) {
      io.to(senderId).emit('messages-read', {
        readerId: socket.id
      });
    }
  });

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
    socket.emit('channels-update', Array.from(channels.values()));
    socket.emit('pinned-messages-sync', Object.fromEntries(pinnedMessages));

    // Send system message about user joining
    io.emit('message', {
      id: `sys-${Date.now()}-${Math.random()}`,
      sender: 'System',
      isSystem: true,
      channelId: 'general',
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
    const channelId = recipientId ? null : (msgData.channelId || 'general');

    const fullMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      sender: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        color: user.color
      },
      channelId,
      recipientId: recipientId || null,
      text: rawText,
      type: msgData.type || 'text', // 'text', 'image', 'voice', 'file'
      fileData: msgData.fileData || null, // Base64 content for images/audio/files
      fileName: msgData.fileName || null,
      fileSize: msgData.fileSize || null,
      replyTo: msgData.replyTo || null, // Quoted message snippet
      read: false,
      readAt: null,
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
              channelId,
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

  // ==========================================================================
  // PHASE 2: IN-CHAT POLLS & REAL-TIME VOTING
  // ==========================================================================
  socket.on('create-poll', (pollData) => {
    const user = users.get(socket.id);
    if (!user) return;

    const question = (pollData.question || '').trim();
    const rawOptions = Array.isArray(pollData.options) ? pollData.options : [];
    const validOptions = rawOptions
      .map(opt => (typeof opt === 'string' ? opt.trim() : ''))
      .filter(opt => opt.length > 0)
      .slice(0, 6);

    if (!question || validOptions.length < 2) {
      socket.emit('poll-error', 'Poll must have a question and at least 2 options.');
      return;
    }

    const recipientId = pollData.recipientId;
    const channelId = recipientId ? null : (pollData.channelId || 'general');

    const pollMessage = {
      id: `poll-${Date.now()}-${Math.random()}`,
      type: 'poll',
      sender: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        color: user.color
      },
      channelId,
      recipientId: recipientId || null,
      question,
      options: validOptions.map(text => ({ text, votes: [] })),
      totalVotes: 0,
      timestamp: new Date().toISOString()
    };

    messages.set(pollMessage.id, pollMessage);

    if (recipientId) {
      socket.emit('message', pollMessage);
      io.to(recipientId).emit('message', pollMessage);
    } else {
      io.emit('message', pollMessage);
    }
  });

  socket.on('vote-poll', ({ messageId, optionIndex }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = messages.get(messageId);
    if (!message || message.type !== 'poll' || !Array.isArray(message.options)) {
      socket.emit('poll-error', 'Poll message not found.');
      return;
    }

    const options = message.options;
    if (optionIndex < 0 || optionIndex >= options.length) return;

    const targetOption = options[optionIndex];
    const alreadyVotedIndex = options.findIndex(opt => opt.votes.includes(user.id));

    if (alreadyVotedIndex === optionIndex) {
      // Toggle off vote
      targetOption.votes = targetOption.votes.filter(id => id !== user.id);
    } else {
      // Remove from previous option if any
      if (alreadyVotedIndex !== -1) {
        options[alreadyVotedIndex].votes = options[alreadyVotedIndex].votes.filter(id => id !== user.id);
      }
      // Add to selected option
      targetOption.votes.push(user.id);
    }

    // Recalculate total unique voters
    const uniqueVoters = new Set();
    options.forEach(opt => opt.votes.forEach(id => uniqueVoters.add(id)));
    message.totalVotes = uniqueVoters.size;

    const updatePayload = {
      messageId,
      options: message.options,
      totalVotes: message.totalVotes
    };

    if (message.recipientId) {
      io.to(message.sender.id).emit('poll-updated', updatePayload);
      io.to(message.recipientId).emit('poll-updated', updatePayload);
    } else {
      io.emit('poll-updated', updatePayload);
    }
  });

  // ==========================================================================
  // PHASE 2: MINI-GAMES (TIC-TAC-TOE & WORD SCRAMBLE)
  // ==========================================================================

  // TIC-TAC-TOE: Win condition validator
  function checkTicTacToeWin(board) {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
      [0, 4, 8], [2, 4, 6]             // diagonals
    ];
    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], winningLine: [a, b, c] };
      }
    }
    if (board.every(cell => cell !== null)) {
      return { winner: 'draw', winningLine: null };
    }
    return null;
  }

  // Create Tic-Tac-Toe Game
  socket.on('create-tictactoe', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const recipientId = data.recipientId;
    const channelId = recipientId ? null : (data.channelId || 'general');

    const gameMessage = {
      id: `ttt-${Date.now()}-${Math.random()}`,
      type: 'game-tictactoe',
      sender: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        color: user.color
      },
      channelId,
      recipientId: recipientId || null,
      gameState: {
        playerX: { id: user.id, nickname: user.nickname, avatar: user.avatar, color: user.color },
        playerO: null,
        board: Array(9).fill(null),
        currentTurn: 'X',
        status: 'waiting', // 'waiting', 'playing', 'won', 'draw'
        winner: null,
        winningLine: null
      },
      timestamp: new Date().toISOString()
    };

    messages.set(gameMessage.id, gameMessage);

    if (recipientId) {
      socket.emit('message', gameMessage);
      io.to(recipientId).emit('message', gameMessage);
    } else {
      io.emit('message', gameMessage);
    }
  });

  // Join Tic-Tac-Toe as Player O
  socket.on('tictactoe-join', ({ messageId }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = messages.get(messageId);
    if (!message || message.type !== 'game-tictactoe') return;

    const gs = message.gameState;
    if (gs.status !== 'waiting' || gs.playerO || gs.playerX.id === user.id) return;

    gs.playerO = { id: user.id, nickname: user.nickname, avatar: user.avatar, color: user.color };
    gs.status = 'playing';

    const updatePayload = { messageId, gameState: gs };
    if (message.recipientId) {
      io.to(message.sender.id).emit('tictactoe-updated', updatePayload);
      io.to(message.recipientId).emit('tictactoe-updated', updatePayload);
    } else {
      io.emit('tictactoe-updated', updatePayload);
    }
  });

  // Tic-Tac-Toe Move
  socket.on('tictactoe-move', ({ messageId, cellIndex }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = messages.get(messageId);
    if (!message || message.type !== 'game-tictactoe') return;

    const gs = message.gameState;
    if (gs.status !== 'playing' || cellIndex < 0 || cellIndex > 8 || gs.board[cellIndex] !== null) return;

    const isPlayerX = gs.playerX?.id === user.id;
    const isPlayerO = gs.playerO?.id === user.id;

    if (gs.currentTurn === 'X' && !isPlayerX) return;
    if (gs.currentTurn === 'O' && !isPlayerO) return;

    gs.board[cellIndex] = gs.currentTurn;

    const result = checkTicTacToeWin(gs.board);
    if (result) {
      if (result.winner === 'draw') {
        gs.status = 'draw';
        gs.winner = 'draw';
      } else {
        gs.status = 'won';
        gs.winner = result.winner;
        gs.winningLine = result.winningLine;
      }
    } else {
      gs.currentTurn = gs.currentTurn === 'X' ? 'O' : 'X';
    }

    const updatePayload = { messageId, gameState: gs };
    if (message.recipientId) {
      io.to(message.sender.id).emit('tictactoe-updated', updatePayload);
      io.to(message.recipientId).emit('tictactoe-updated', updatePayload);
    } else {
      io.emit('tictactoe-updated', updatePayload);
    }
  });

  // Tic-Tac-Toe Rematch / Reset
  socket.on('tictactoe-reset', ({ messageId }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = messages.get(messageId);
    if (!message || message.type !== 'game-tictactoe') return;

    const gs = message.gameState;
    if (!gs.playerX || !gs.playerO) return;
    if (user.id !== gs.playerX.id && user.id !== gs.playerO.id) return;

    gs.board = Array(9).fill(null);
    gs.currentTurn = 'X';
    gs.status = 'playing';
    gs.winner = null;
    gs.winningLine = null;

    const updatePayload = { messageId, gameState: gs };
    if (message.recipientId) {
      io.to(message.sender.id).emit('tictactoe-updated', updatePayload);
      io.to(message.recipientId).emit('tictactoe-updated', updatePayload);
    } else {
      io.emit('tictactoe-updated', updatePayload);
    }
  });

  // WORD SCRAMBLE: Bank & Scrambler
  const SCRAMBLE_WORDS = [
    { word: 'SHINOBI', category: 'Anime', hint: 'Stealth ninja warrior' },
    { word: 'SAIYAN', category: 'Dragon Ball', hint: 'Super warrior race with gold aura' },
    { word: 'TITAN', category: 'Attack on Titan', hint: 'Colossal and armored humanoids' },
    { word: 'BANKAI', category: 'Bleach', hint: 'Ultimate Zanpakuto sword release' },
    { word: 'RASENGAN', category: 'Naruto', hint: 'Spinning spherical vortex of chakra' },
    { word: 'PIKACHU', category: 'Pokemon', hint: 'Electric mouse companion' },
    { word: 'CYBERPUNK', category: 'Sci-Fi', hint: 'Neon high tech, gritty low life' },
    { word: 'SHADOW', category: 'Gaming', hint: 'Darkness cast by brilliance' },
    { word: 'MATRIX', category: 'Tech', hint: 'Simulated digital cyber reality' },
    { word: 'FIREWALL', category: 'Network', hint: 'Shields ports from unauthorized packets' },
    { word: 'INFINITY', category: 'Jujutsu Kaisen', hint: 'Gojo Satoru boundless space technique' },
    { word: 'HOTSPOT', category: 'WiFi', hint: 'Wireless network broadcast station' }
  ];

  function scramble(str) {
    const arr = str.split('');
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const res = arr.join('');
    return res === str && str.length > 3 ? scramble(str) : res;
  }

  // Create Word Scramble Game
  socket.on('create-wordscramble', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const item = SCRAMBLE_WORDS[Math.floor(Math.random() * SCRAMBLE_WORDS.length)];
    const scrambled = scramble(item.word);
    const recipientId = data.recipientId;
    const channelId = recipientId ? null : (data.channelId || 'general');

    const scrambleMessage = {
      id: `scramble-${Date.now()}-${Math.random()}`,
      type: 'game-wordscramble',
      sender: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        color: user.color
      },
      channelId,
      recipientId: recipientId || null,
      _secretWord: item.word, // hidden on server until solved
      gameState: {
        scrambled,
        category: item.category,
        hint: item.hint,
        status: 'active', // 'active' or 'solved'
        solvedBy: null,
        revealedWord: null,
        attempts: 0
      },
      timestamp: new Date().toISOString()
    };

    messages.set(scrambleMessage.id, scrambleMessage);

    // Send to clients (omitting _secretWord)
    const clientSafe = { ...scrambleMessage };
    delete clientSafe._secretWord;

    if (recipientId) {
      socket.emit('message', clientSafe);
      io.to(recipientId).emit('message', clientSafe);
    } else {
      io.emit('message', clientSafe);
    }
  });

  // Guess Word Scramble
  socket.on('wordscramble-guess', ({ messageId, guess }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = messages.get(messageId);
    if (!message || message.type !== 'game-wordscramble' || message.gameState.status !== 'active') return;

    const cleanGuess = (guess || '').trim().toUpperCase();
    const correct = cleanGuess === message._secretWord;

    if (correct) {
      message.gameState.status = 'solved';
      message.gameState.solvedBy = { id: user.id, nickname: user.nickname, avatar: user.avatar, color: user.color };
      message.gameState.revealedWord = message._secretWord;

      const updatePayload = { messageId, gameState: message.gameState };
      if (message.recipientId) {
        io.to(message.sender.id).emit('wordscramble-updated', updatePayload);
        io.to(message.recipientId).emit('wordscramble-updated', updatePayload);
      } else {
        io.emit('wordscramble-updated', updatePayload);
      }

      // Broadcast celebration system message
      const sysMsg = {
        id: `sys-${Date.now()}-${Math.random()}`,
        sender: 'System',
        isSystem: true,
        channelId: message.channelId,
        recipientId: message.recipientId,
        text: `🏆 ${user.nickname} cracked the word scramble: "${message._secretWord}"!`,
        timestamp: new Date().toISOString()
      };
      messages.set(sysMsg.id, sysMsg);
      if (message.recipientId) {
        io.to(message.sender.id).emit('message', sysMsg);
        io.to(message.recipientId).emit('message', sysMsg);
      } else {
        io.emit('message', sysMsg);
      }
    } else {
      message.gameState.attempts += 1;
      socket.emit('wordscramble-wrong', { messageId, attempts: message.gameState.attempts });
    }
  });

  // Typing Indicators
  socket.on('typing', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    let isTyping = false;
    let recipientId = null;
    let channelId = 'general';

    if (data && typeof data === 'object') {
      isTyping = !!data.isTyping;
      recipientId = data.recipientId || null;
      channelId = data.channelId || 'general';
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
        recipientId,
        channelId: null
      });
    } else {
      // Broadcast typing status to everyone else with channelId
      socket.broadcast.emit('user-typing', {
        id: socket.id,
        nickname: user.nickname,
        avatar: user.avatar,
        color: user.color,
        isTyping,
        recipientId: null,
        channelId
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
