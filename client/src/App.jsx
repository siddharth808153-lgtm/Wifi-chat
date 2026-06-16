import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  Send, Image, Mic, Paperclip, Smile, Users, QrCode, 
  Wifi, WifiOff, LogOut, Palette, Trash2, Play, Pause, 
  X, CheckCheck, Square, Download, FileText, Sparkles, Lock, Paintbrush
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

// Predefined 16 Famous Anime Characters with custom theme colors
const ANIME_CHARACTERS = [
  { id: 'goku', name: 'Goku', series: 'Dragon Ball Z', image: '/avatars/goku.png?v=1', color: '#ff7b00' },
  { id: 'naruto', name: 'Naruto', series: 'Naruto', image: '/avatars/naruto.png?v=1', color: '#f1c40f' },
  { id: 'luffy', name: 'Luffy', series: 'One Piece', image: '/avatars/luffy.png?v=1', color: '#e74c3c' },
  { id: 'gojo', name: 'Gojo Satoru', series: 'Jujutsu Kaisen', image: '/avatars/gojo.png?v=1', color: '#9b59b6' },
  { id: 'sasuke', name: 'Sasuke', series: 'Naruto', image: '/avatars/sasuke.png?v=1', color: '#2980b9' },
  { id: 'zoro', name: 'Zoro', series: 'One Piece', image: '/avatars/zoro.png?v=1', color: '#2ecc71' },
  { id: 'saitama', name: 'Saitama', series: 'One Punch Man', image: '/avatars/saitama.png?v=1', color: '#f39c12' },
  { id: 'nezuko', name: 'Nezuko', series: 'Demon Slayer', image: '/avatars/nezuko.png?v=1', color: '#fd79a8' },
  { id: 'vegeta', name: 'Vegeta', series: 'Dragon Ball Z', image: '/avatars/vegeta.png?v=1', color: '#1e3799' },
  { id: 'tanjiro', name: 'Tanjiro', series: 'Demon Slayer', image: '/avatars/tanjiro.png?v=1', color: '#009432' },
  { id: 'deku', name: 'Deku', series: 'My Hero Academia', image: '/avatars/deku.png?v=1', color: '#00d2d3' },
  { id: 'kakashi', name: 'Kakashi', series: 'Naruto', image: '/avatars/kakashi.png?v=1', color: '#8395a7' },
  { id: 'eren', name: 'Eren Yeager', series: 'Attack on Titan', image: '/avatars/eren.png?v=1', color: '#485460' },
  { id: 'levi', name: 'Levi', series: 'Attack on Titan', image: '/avatars/levi.png?v=1', color: '#2f3542' },
  { id: 'killua', name: 'Killua', series: 'Hunter x Hunter', image: '/avatars/killua.png?v=1', color: '#a55eea' },
  { id: 'hinata', name: 'Hinata', series: 'Naruto', image: '/avatars/hinata.png?v=1', color: '#fda7df' }
];

// Predefined emojis for the quick emoji selector
const EMOJIS = [
  '😊', '😂', '🤣', '😍', '👍', '🔥', '🎉', '👏', '❤️', '🤔', 
  '👀', '🙌', '✨', '😎', '💀', '💯', '👋', '🥺', '💩', '🚀'
];

// Local network socket URL utility
const getSocketUrl = () => {
  if (window.location.port === '5173') {
    // Vite dev server port, connect to Express on port 3000
    return `http://${window.location.hostname}:3000`;
  }
  // Production
  return window.location.origin;
};

// Audio Notification generator using Web Audio API
const playReceiveSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.12); // G5
    
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch (e) {
    console.warn('Audio feedback failed', e);
  }
};

// A smart component that loads the avatar image and removes any white/light background on the fly (flood-fill algorithm)
const TransparentAvatar = ({ src, alt, className }) => {
  const [processedSrc, setProcessedSrc] = React.useState(src);

  React.useEffect(() => {
    if (!src) return;
    
    // Only process PNG images that might have a white background (like our local avatars)
    if (!src.startsWith('/avatars/')) {
      setProcessedSrc(src);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const width = canvas.width;
        const height = canvas.height;

        const visited = new Uint8Array(width * height);
        const queue = [];

        const getPixelIndex = (x, y) => (y * width + x) * 4;

        // Matches pure white to very light gray/shadows
        const isWhite = (r, g, b) => r > 230 && g > 230 && b > 230;

        // Push 4 corners to start the flood fill from
        const corners = [
          [0, 0],
          [width - 1, 0],
          [0, height - 1],
          [width - 1, height - 1]
        ];

        for (const [x, y] of corners) {
          const idx = y * width + x;
          const pIdx = getPixelIndex(x, y);
          if (isWhite(data[pIdx], data[pIdx + 1], data[pIdx + 2])) {
            queue.push([x, y]);
            visited[idx] = 1;
          }
        }

        // Flood fill from corners
        while (queue.length > 0) {
          const [x, y] = queue.shift();
          const pIdx = getPixelIndex(x, y);

          // Make the background transparent
          data[pIdx + 3] = 0;

          // 4-connected neighbors
          const neighbors = [
            [x + 1, y],
            [x - 1, y],
            [x, y + 1],
            [x, y - 1]
          ];

          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              if (!visited[nIdx]) {
                const npIdx = getPixelIndex(nx, ny);
                if (isWhite(data[npIdx], data[npIdx + 1], data[npIdx + 2])) {
                  queue.push([nx, ny]);
                  visited[nIdx] = 1;
                }
              }
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
        setProcessedSrc(canvas.toDataURL('image/png'));
      } catch (e) {
        console.error('Failed to process transparent background', e);
        setProcessedSrc(src);
      }
    };
    img.src = src;
  }, [src]);

  return <img src={processedSrc} alt={alt} className={className} />;
};

// Helper to save messages to localStorage without large file attachments (saves quota)
const saveMessagesToStorage = (messagesArray) => {
  try {
    const cleaned = messagesArray.map((msg) => {
      if (msg.fileData) {
        return { ...msg, fileData: '' };
      }
      return msg;
    });
    localStorage.setItem('wifi_chat_messages', JSON.stringify(cleaned));
  } catch (e) {
    console.error('Failed to persist messages to localStorage', e);
  }
};

// Collaborative Sketchpad modal component
const SketchpadModal = ({ onClose, onSend, socket, activeChatId }) => {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const [color, setColor] = useState('#ff7b00');
  const [lineWidth, setLineWidth] = useState(5);
  const [isEraser, setIsEraser] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const colors = [
    { name: 'Orange', value: '#ff7b00' },
    { name: 'Yellow', value: '#f1c40f' },
    { name: 'Pink', value: '#fd79a8' },
    { name: 'Blue', value: '#58a6ff' },
    { name: 'Green', value: '#2ecc71' },
    { name: 'Purple', value: '#9b59b6' },
    { name: 'White', value: '#ffffff' }
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Fixed internal resolution (800x600) for consistent cross-client drawing coordinates
    canvas.width = 800;
    canvas.height = 600;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';

    const context = canvas.getContext('2d');
    context.lineCap = 'round';
    context.lineJoin = 'round';
    contextRef.current = context;

    // Fill background with canvas color
    context.fillStyle = '#10141b';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Notify other users that we are actively sketching
    socket.emit('drawing-activity', {
      isDrawing: true,
      recipientId: activeChatId === 'general' ? null : activeChatId
    });

    // Request active canvas state from anyone else drawing
    socket.emit('request-canvas-state', {
      recipientId: activeChatId === 'general' ? null : activeChatId,
      senderId: socket.id
    });

    // Local custom event handlers mapping back from socket
    const handleRemoteDrawing = (e) => {
      const { prevX, prevY, currX, currY, color: remoteColor, lineWidth: remoteWidth, senderId } = e.detail;
      if (senderId === socket.id) return;

      const ctx = contextRef.current;
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(currX, currY);
        ctx.strokeStyle = remoteColor;
        ctx.lineWidth = remoteWidth;
        ctx.stroke();
        ctx.closePath();
      }
    };

    const handleRemoteClear = (e) => {
      const { senderId } = e.detail;
      if (senderId === socket.id) return;
      const ctx = contextRef.current;
      if (ctx) {
        ctx.fillStyle = '#10141b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };

    const handleRequestState = (e) => {
      const { senderId } = e.detail;
      if (senderId === socket.id) return;
      
      const dataUrl = canvas.toDataURL('image/png');
      socket.emit('send-canvas-state', {
        canvasState: dataUrl,
        recipientId: senderId,
        senderId: socket.id
      });
    };

    const handleReceiveState = (e) => {
      const { canvasState, senderId } = e.detail;
      if (senderId === socket.id) return;
      
      const img = new window.Image();
      img.onload = () => {
        const ctx = contextRef.current;
        if (ctx) {
          ctx.drawImage(img, 0, 0);
        }
      };
      img.src = canvasState;
    };

    window.addEventListener('remote-drawing-stroke', handleRemoteDrawing);
    window.addEventListener('remote-drawing-clear', handleRemoteClear);
    window.addEventListener('remote-request-canvas-state', handleRequestState);
    window.addEventListener('remote-send-canvas-state', handleReceiveState);

    return () => {
      window.removeEventListener('remote-drawing-stroke', handleRemoteDrawing);
      window.removeEventListener('remote-drawing-clear', handleRemoteClear);
      window.removeEventListener('remote-request-canvas-state', handleRequestState);
      window.removeEventListener('remote-send-canvas-state', handleReceiveState);
      
      socket.emit('drawing-activity', {
        isDrawing: false,
        recipientId: activeChatId === 'general' ? null : activeChatId
      });
    };
  }, [socket, activeChatId]);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const startDrawing = (e) => {
    // Prevent default scrolling on mobile touch
    if (e.cancelable) e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;
    
    lastPos.current = coords;
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    if (e.cancelable) e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;

    const ctx = contextRef.current;
    if (!ctx) return;

    const brushColor = isEraser ? '#10141b' : color;

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.closePath();

    socket.emit('drawing-stroke', {
      prevX: lastPos.current.x,
      prevY: lastPos.current.y,
      currX: coords.x,
      currY: coords.y,
      color: brushColor,
      lineWidth,
      recipientId: activeChatId === 'general' ? null : activeChatId,
      senderId: socket.id
    });

    lastPos.current = coords;
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (canvas && ctx) {
      ctx.fillStyle = '#10141b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      socket.emit('drawing-clear', {
        recipientId: activeChatId === 'general' ? null : activeChatId,
        senderId: socket.id
      });
    }
  };

  const handlePost = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    onSend(dataUrl);
  };

  return (
    <div className="sketchpad-modal-overlay" onClick={onClose}>
      <div className="sketchpad-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sketchpad-header">
          <h3>🎨 Collaborative Sketchpad</h3>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="sketchpad-canvas-container">
          <canvas
            ref={canvasRef}
            className="sketchpad-canvas"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>

        <div className="sketchpad-controls">
          <div className="sketchpad-tools-left">
            <div className="color-palette">
              {colors.map((c) => (
                <button
                  key={c.name}
                  className={`color-swatch ${color === c.value && !isEraser ? 'active' : ''}`}
                  style={{ backgroundColor: c.value, '--swatch-color': c.value }}
                  onClick={() => {
                    setColor(c.value);
                    setIsEraser(false);
                  }}
                  title={c.name}
                />
              ))}
            </div>

            <button
              className={`sketch-btn ${isEraser ? 'sketch-btn-primary' : 'sketch-btn-secondary'}`}
              onClick={() => setIsEraser(!isEraser)}
              style={isEraser ? { '--btn-accent': '#ef4444' } : {}}
            >
              🧹 Eraser
            </button>

            <div className="brush-slider-container">
              <span>Size:</span>
              <input
                type="range"
                min="1"
                max="20"
                value={lineWidth}
                onChange={(e) => setLineWidth(parseInt(e.target.value))}
                className="brush-slider"
                style={{ '--accent-color': isEraser ? '#ef4444' : color }}
              />
              <span>{lineWidth}px</span>
            </div>
          </div>

          <div className="sketchpad-actions-right">
            <button className="sketch-btn sketch-btn-danger" onClick={clearCanvas}>
              🗑️ Clear
            </button>
            <button className="sketch-btn sketch-btn-primary" onClick={handlePost}>
              🚀 Post Sketch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  // Lobby States
  const [joined, setJoined] = useState(false);
  const [nickname, setNickname] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(ANIME_CHARACTERS[0].image);
  const [selectedColor, setSelectedColor] = useState(ANIME_CHARACTERS[0].color);
  const [selectedCharId, setSelectedCharId] = useState(ANIME_CHARACTERS[0].id);
  
  // Connection and Room States
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [messages, setMessages] = useState(() => {
    try {
      const stored = localStorage.getItem('wifi_chat_messages');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });
  const [typingUsers, setTypingUsers] = useState([]);
  
  // Input States
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  // Edit/Delete States
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  // Voice Note Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  // App UI Customization
  const [theme, setTheme] = useState('glass-dark');
  const [showQR, setShowQR] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  
  // DM/Channel States
  const [activeChatId, setActiveChatId] = useState('general');
  const [unreadCounts, setUnreadCounts] = useState({});
  
  // Sketchpad States
  const [showSketchpad, setShowSketchpad] = useState(false);
  const [sketchpadActiveUsers, setSketchpadActiveUsers] = useState({});
  
  // Refs
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingIntervalRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Derived state: Online users other than the current client
  const otherUsers = onlineUsers.filter((user) => user.id !== socket?.id);

  // Derived state: Is another user currently drawing in the active room/DM
  const isSomeoneSketching = Object.entries(sketchpadActiveUsers).some(([id, details]) => {
    if (id === socket?.id) return false;
    if (activeChatId === 'general') {
      return !details.recipientId;
    } else {
      return details.recipientId === socket?.id && id === activeChatId;
    }
  });

  const handleSendSketch = (dataUrl) => {
    if (!socket) return;
    socket.emit('send-message', {
      type: 'image',
      text: '🎨 Shared a sketch',
      fileData: dataUrl,
      fileName: `sketch-${Date.now()}.png`,
      recipientId: activeChatId === 'general' ? null : activeChatId
    });
    setShowSketchpad(false);
  };

  // Load selection settings helper or auto-generate defaults
  useEffect(() => {
    const savedName = localStorage.getItem('wifi_chat_nickname');
    const savedAvatar = localStorage.getItem('wifi_chat_avatar');
    const savedColor = localStorage.getItem('wifi_chat_color');
    const savedTheme = localStorage.getItem('wifi_chat_theme');
    const savedCharId = localStorage.getItem('wifi_chat_char_id');
    
    if (savedTheme) setTheme(savedTheme);

    if (savedName) {
      setNickname(savedName);
    } else {
      // Suggest Goku by default
      setNickname('Goku');
    }
    
    if (savedAvatar) setSelectedAvatar(savedAvatar);
    if (savedColor) setSelectedColor(savedColor);
    if (savedCharId) setSelectedCharId(savedCharId);
  }, []);

  // Sync scrolling to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  // Connect to the socket server immediately on mount (lobby state)
  useEffect(() => {
    const socketUrl = getSocketUrl();
    const socketInstance = io(socketUrl);
    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      setConnected(true);

      // Auto-rejoin if session was active before refresh
      const wasJoined = localStorage.getItem('wifi_chat_joined') === 'true';
      const savedName = localStorage.getItem('wifi_chat_nickname');
      const savedAvatar = localStorage.getItem('wifi_chat_avatar');
      const savedColor = localStorage.getItem('wifi_chat_color');

      if (wasJoined && savedName) {
        socketInstance.emit('join', {
          nickname: savedName,
          avatar: savedAvatar || '/avatars/goku.png',
          color: savedColor || '#ff7b00'
        });
      }
    });

    socketInstance.on('disconnect', () => {
      setConnected(false);
    });

    socketInstance.on('users-update', (users) => {
      setOnlineUsers(users);
      setActiveChatId((currentActive) => {
        if (currentActive !== 'general' && !users.some(u => u.id === currentActive)) {
          return 'general';
        }
        return currentActive;
      });
    });

    socketInstance.on('message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      
      // Handle unread counts for private messages
      if (msg.recipientId && msg.sender && msg.sender.id !== socketInstance.id) {
        const senderId = msg.sender.id;
        setActiveChatId((currentActive) => {
          if (currentActive !== senderId) {
            setUnreadCounts((prev) => ({
              ...prev,
              [senderId]: (prev[senderId] || 0) + 1
            }));
          }
          return currentActive;
        });
      }

      if (msg.sender && msg.sender.id !== socketInstance.id && !msg.isSystem) {
        playReceiveSound();
      }
    });

    socketInstance.on('user-typing', ({ id, nickname: userNick, avatar, color, isTyping: isUserTyping, recipientId }) => {
      setTypingUsers((prev) => {
        if (isUserTyping) {
          if (prev.some(u => u.id === id)) {
            return prev.map(u => u.id === id ? { id, nickname: userNick, avatar, color, recipientId } : u);
          }
          return [...prev, { id, nickname: userNick, avatar, color, recipientId }];
        } else {
          return prev.filter(u => u.id !== id);
        }
      });
    });

    // Handle join response validation from server
    socketInstance.on('join-success', (userProfile) => {
      setJoined(true);
      setNickname(userProfile.nickname);
      setSelectedAvatar(userProfile.avatar);
      setSelectedColor(userProfile.color);
      
      // Load saved messages from local history
      try {
        const stored = localStorage.getItem('wifi_chat_messages');
        if (stored) {
          setMessages(JSON.parse(stored));
        }
      } catch (e) {
        console.warn('Error loading messages from localStorage', e);
      }
      
      const matchedChar = ANIME_CHARACTERS.find(c => c.image === userProfile.avatar);
      if (matchedChar) {
        setSelectedCharId(matchedChar.id);
        localStorage.setItem('wifi_chat_char_id', matchedChar.id);
      }

      localStorage.setItem('wifi_chat_joined', 'true');
      localStorage.setItem('wifi_chat_nickname', userProfile.nickname);
      localStorage.setItem('wifi_chat_avatar', userProfile.avatar);
      localStorage.setItem('wifi_chat_color', userProfile.color);
    });

    socketInstance.on('join-error', (errorMessage) => {
      alert(errorMessage);
      // Reset auto-rejoin on validation failure (e.g. name taken during offline state)
      localStorage.setItem('wifi_chat_joined', 'false');
      setJoined(false);
    });

    // Handle message edits
    socketInstance.on('message-edited', ({ messageId, text, editedAt }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, text, edited: true, editedAt } : msg
        )
      );
    });

    // Handle message deletions
    socketInstance.on('message-deleted', ({ messageId }) => {
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    });

    // Handle message reaction updates
    socketInstance.on('message-reaction-updated', ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, reactions } : msg
        )
      );
    });

    // Collaborative drawing socket listeners
    socketInstance.on('drawing-stroke', (drawData) => {
      window.dispatchEvent(new CustomEvent('remote-drawing-stroke', { detail: drawData }));
    });

    socketInstance.on('drawing-clear', (clearData) => {
      window.dispatchEvent(new CustomEvent('remote-drawing-clear', { detail: clearData }));
    });

    socketInstance.on('drawing-activity', ({ id, nickname, isDrawing, recipientId }) => {
      setSketchpadActiveUsers((prev) => {
        const next = { ...prev };
        if (isDrawing) {
          next[id] = { nickname, recipientId };
        } else {
          delete next[id];
        }
        return next;
      });
    });

    socketInstance.on('request-canvas-state', (requestData) => {
      window.dispatchEvent(new CustomEvent('remote-request-canvas-state', { detail: requestData }));
    });

    socketInstance.on('send-canvas-state', (stateData) => {
      window.dispatchEvent(new CustomEvent('remote-send-canvas-state', { detail: stateData }));
    });

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const handleSelectChat = (chatId) => {
    setActiveChatId(chatId);
    if (chatId !== 'general') {
      setUnreadCounts((prev) => {
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
    }
  };

  const getConversationMessages = () => {
    return messages.filter((msg) => {
      if (activeChatId === 'general') {
        return !msg.recipientId;
      } else {
        if (msg.isSystem) return false;
        const myId = socket?.id;
        return (
          (msg.sender?.id === myId && msg.recipientId === activeChatId) ||
          (msg.sender?.id === activeChatId && msg.recipientId === myId)
        );
      }
    });
  };

  const conversationMessages = getConversationMessages();

  // Handle character selection in lobby
  const handleSelectCharacter = (char) => {
    setSelectedCharId(char.id);
    setSelectedAvatar(char.image);
    setSelectedColor(char.color);
    
    // Auto-update nickname suggestion based on chosen character (clean name, fully editable!)
    setNickname(char.name);
  };

  // 3D Tilt Card Effects
  const handleMouseMoveCard = (e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    
    // Tilt calculations
    const rotateX = (yc - y) / 6;
    const rotateY = (x - xc) / 6;
    
    // Shine reflection coordinates
    const shineX = (x / rect.width) * 100;
    const shineY = (y / rect.height) * 100;
    
    card.style.setProperty('--rx', `${rotateX}deg`);
    card.style.setProperty('--ry', `${rotateY}deg`);
    card.style.setProperty('--mx', `${shineX}%`);
    card.style.setProperty('--my', `${shineY}%`);
  };

  const handleMouseLeaveCard = (e) => {
    const card = e.currentTarget;
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
    card.style.setProperty('--mx', '50%');
    card.style.setProperty('--my', '50%');
  };

  // Emit join request to the server instead of immediately transitioning
  const handleJoinChat = (e) => {
    e.preventDefault();
    const trimmedName = nickname.trim();
    if (!trimmedName || !socket) return;
    
    socket.emit('join', {
      nickname: trimmedName,
      avatar: selectedAvatar,
      color: selectedColor
    });
  };

  // Emit leave event and return to lobby without disconnecting the socket
  const handleLogout = () => {
    if (socket) {
      socket.emit('leave');
    }
    localStorage.setItem('wifi_chat_joined', 'false');
    setJoined(false);
    setMessages([]);
    setTypingUsers([]);
    setActiveChatId('general');
    setUnreadCounts({});
  };

  // Export/Save entire chat history to a formatted text file
  const handleSaveChat = () => {
    if (messages.length === 0) {
      alert("No messages to save.");
      return;
    }

    let logText = `=========================================\n`;
    logText += `WIFI WAVE CHAT LOG - ${new Date().toLocaleString()}\n`;
    logText += `=========================================\n\n`;

    messages.forEach((msg) => {
      const time = new Date(msg.timestamp).toLocaleTimeString();
      if (msg.isSystem) {
        logText += `[${time}] System: ${msg.text}\n`;
      } else {
        const sender = msg.sender.nickname;
        if (msg.type === 'text') {
          logText += `[${time}] ${sender}: ${msg.text}\n`;
        } else if (msg.type === 'image') {
          logText += `[${time}] ${sender}: [Image - ${msg.fileName || 'image.jpg'}]\n`;
        } else if (msg.type === 'voice') {
          logText += `[${time}] ${sender}: [Voice Note]\n`;
        } else if (msg.type === 'file') {
          logText += `[${time}] ${sender}: [File - ${msg.fileName} (${formatFileSize(msg.fileSize)})]\n`;
        }
      }
    });

    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wifi-chat-log-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Clear chat history locally (states + localStorage)
  const handleClearChat = () => {
    if (window.confirm("Are you sure you want to clear all chat history locally? This action cannot be undone.")) {
      setMessages([]);
      localStorage.removeItem('wifi_chat_messages');
    }
  };

  // Synchronize in-memory messages with localStorage (only if joined)
  useEffect(() => {
    if (joined) {
      saveMessagesToStorage(messages);
    }
  }, [messages, joined]);

  // Global keyboard shortcut to clear chat (Ctrl+Shift+5)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === '5' || e.keyCode === 53)) {
        e.preventDefault();
        handleClearChat();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  // Text message submission
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !socket) return;

    socket.emit('send-message', {
      type: 'text',
      text: inputText,
      recipientId: activeChatId === 'general' ? null : activeChatId
    });

    setInputText('');
    
    // Trigger typing stop immediately
    if (isTyping) {
      socket.emit('typing', {
        isTyping: false,
        recipientId: activeChatId === 'general' ? null : activeChatId
      });
      setIsTyping(false);
    }
  };

  // Start editing a message
  const handleStartEdit = (messageId, currentText) => {
    setEditingMessageId(messageId);
    setEditText(currentText);
  };

  // Save edited message
  const handleSaveEdit = (messageId) => {
    if (!editText.trim() || !socket) return;
    
    socket.emit('edit-message', {
      messageId,
      text: editText
    });
    
    setEditingMessageId(null);
    setEditText('');
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditText('');
  };

  // Delete a message
  const handleDeleteMessage = (messageId) => {
    if (!socket) return;
    if (window.confirm('Are you sure you want to delete this message?')) {
      socket.emit('delete-message', { messageId });
    }
  };

  // Toggle message reaction
  const handleToggleReaction = (messageId, emoji) => {
    if (!socket) return;
    socket.emit('toggle-reaction', {
      messageId,
      emoji
    });
  };

  // Search messages
  const getFilteredMessages = () => {
    const convoMsgs = getConversationMessages();
    if (!searchQuery.trim()) return convoMsgs;
    
    const query = searchQuery.toLowerCase();
    return convoMsgs.filter((msg) => {
      if (msg.isSystem) return false;
      if (msg.type === 'text') {
        return msg.text.toLowerCase().includes(query);
      }
      if (msg.sender && msg.sender.nickname) {
        return msg.sender.nickname.toLowerCase().includes(query);
      }
      return false;
    });
  };

  const filteredMessages = getFilteredMessages();

  // Typing state detection
  const handleTextInputChange = (e) => {
    setInputText(e.target.value);
    
    if (!socket) return;

    if (!isTyping) {
      socket.emit('typing', {
        isTyping: true,
        recipientId: activeChatId === 'general' ? null : activeChatId
      });
      setIsTyping(true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', {
        isTyping: false,
        recipientId: activeChatId === 'general' ? null : activeChatId
      });
      setIsTyping(false);
    }, 1500);
  };

  // Quick emoji click handler
  const handleSelectEmoji = (emoji) => {
    setInputText((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  // Image Upload with Client-Side Compression
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !socket) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Compress image to 70% JPEG quality
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

        socket.emit('send-message', {
          type: 'image',
          text: `Sent an image: ${file.name}`,
          fileData: dataUrl,
          fileName: file.name,
          recipientId: activeChatId === 'general' ? null : activeChatId
        });
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Generic File Upload Handler
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !socket) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File is too large! Maximum limit is 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      socket.emit('send-message', {
        type: 'file',
        text: `Shared a file: ${file.name}`,
        fileData: event.target.result,
        fileName: file.name,
        fileSize: file.size,
        recipientId: activeChatId === 'general' ? null : activeChatId
      });
    };
    reader.readAsDataURL(file);
  };

  // Voice Note Recorder Handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = (event) => {
          socket.emit('send-message', {
            type: 'voice',
            text: 'Voice note',
            fileData: event.target.result,
            fileName: 'voice-note.webm',
            recipientId: activeChatId === 'general' ? null : activeChatId
          });
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Audio recording failed', err);
      alert('Microphone access is required to record voice notes.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null; // Discard callback
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
    }
  };

  // Theme changer helper
  const changeTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('wifi_chat_theme', newTheme);
  };

  // Format File Size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format Time
  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Avatar Image/Emoji Renderer
  const renderAvatar = (avatarUrl, nicknameStr, cssClass = 'user-avatar-img') => {
    if (!avatarUrl) return <span className="avatar-placeholder">👤</span>;
    
    if (avatarUrl.startsWith('/') || avatarUrl.startsWith('http')) {
      return <TransparentAvatar src={avatarUrl} alt={nicknameStr} className={cssClass} />;
    }
    // Fallback emoji
    return <span className="avatar-emoji-text">{avatarUrl}</span>;
  };

  // Connection URL for friends to join
  const joinUrl = window.location.port === '5173'
    ? `http://${window.location.hostname}:3000`
    : window.location.origin;

  // LOBBY / WELCOME SCREEN
  if (!joined) {
    return (
      <div className={`app-container ${theme} lobby-screen`}>
        <div className="mesh-bg"></div>
        <div className="lobby-card glass anime-lobby-layout">
          <div className="brand">
            <div className="brand-logo">
              <Sparkles className="icon-pulse" size={32} />
            </div>
            <h1>WiFi Wave Chat</h1>
            <p>Select your 3D anime character card and start chatting!</p>
          </div>

          <form onSubmit={handleJoinChat} className="lobby-form">
            <div className="input-group">
              <label htmlFor="nickname">Your Nickname</label>
              <input
                type="text"
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, 16))}
                placeholder="Enter nickname..."
                required
                autoComplete="off"
              />
            </div>

            <div className="anime-selector-section">
              <label>Select 3D Character Card</label>
              <div className="anime-cards-grid">
                {ANIME_CHARACTERS.map((char) => {
                  const isTaken = onlineUsers.some(u => u.avatar === char.image);
                  return (
                    <div
                      key={char.id}
                      className={`anime-card-3d ${selectedCharId === char.id ? 'selected' : ''} ${isTaken ? 'taken' : ''}`}
                      style={{ 
                        '--accent-glow': char.color,
                        '--card-image': `url(${char.image})`
                      }}
                      onMouseMove={!isTaken ? handleMouseMoveCard : undefined}
                      onMouseLeave={!isTaken ? handleMouseLeaveCard : undefined}
                      onClick={() => !isTaken && handleSelectCharacter(char)}
                    >
                      <div className="card-shine"></div>
                      <div className="card-content">
                        {isTaken && (
                          <div className="card-lock-overlay">
                            <Lock size={18} className="lock-icon" />
                            <span className="lock-text">TAKEN</span>
                          </div>
                        )}
                         <div className="character-avatar-frame">
                           <TransparentAvatar src={char.image} alt={char.name} />
                         </div>
                        <div className="character-details">
                          <h4>{char.name}</h4>
                          <span>{char.series}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary submit-btn"
              style={{ '--btn-accent': selectedColor }}
            >
              <Sparkles size={18} className="submit-btn-icon" />
              <span>Enter Chatroom</span>
            </button>
          </form>

          <div className="theme-toggle-lobby">
            <Palette size={16} />
            <button className={`theme-btn ${theme === 'glass-dark' ? 'active' : ''}`} onClick={() => changeTheme('glass-dark')}>Dark</button>
            <button className={`theme-btn ${theme === 'glass-blue' ? 'active' : ''}`} onClick={() => changeTheme('glass-blue')}>Ocean</button>
            <button className={`theme-btn ${theme === 'glass-purple' ? 'active' : ''}`} onClick={() => changeTheme('glass-purple')}>Cosmic</button>
            <button className={`theme-btn ${theme === 'glass-sunset' ? 'active' : ''}`} onClick={() => changeTheme('glass-sunset')}>Sunset</button>
          </div>
        </div>
      </div>
    );
  }

  // MAIN CHAT INTERFACE
  return (
    <div className={`app-container ${theme} chat-screen`}>
      <div className="mesh-bg"></div>
      
      <div className="chat-window glass">
        {/* HEADER */}
        <header className="chat-header">
          <div className="header-left">
            <div className="app-logo">🌊</div>
            <div>
              {activeChatId === 'general' ? (
                <h2>Wave Chat</h2>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    onClick={() => handleSelectChat('general')}
                    className="theme-btn"
                    style={{ padding: '2px 8px', fontSize: '0.8rem', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '6px', border: '1px solid var(--glass-border)', cursor: 'pointer' }}
                  >
                    ← Back
                  </button>
                  <h2 style={{ fontSize: '1.1rem' }}>
                    DM with {onlineUsers.find(u => u.id === activeChatId)?.nickname || 'Friend'}
                  </h2>
                </div>
              )}
              <div className="status-indicator">
                {connected ? (
                  <span className="online-badge"><Wifi size={12} /> Connected to WiFi Server</span>
                ) : (
                  <span className="offline-badge"><WifiOff size={12} /> Connecting...</span>
                )}
              </div>
            </div>
          </div>

          <div className="header-actions">
            <button 
              className={`header-btn ${showQR ? 'active' : ''}`} 
              onClick={() => setShowQR(!showQR)} 
              title="Share connection URL / QR Code"
            >
              <QrCode size={20} />
              <span className="btn-label">Invite Friend</span>
            </button>

            <button 
              className="header-btn" 
              onClick={handleSaveChat} 
              title="Save Chat Logs"
            >
              <Download size={20} />
              <span className="btn-label">Save Chat</span>
            </button>

            <button 
              id="clear-chat-btn"
              className="header-btn clear-btn" 
              onClick={handleClearChat} 
              title="Clear Chat (Ctrl+Shift+5)"
            >
              <Trash2 size={20} />
              <span className="btn-label">Clear Chat</span>
            </button>

            <div className="header-theme-selector">
              <Palette size={18} />
              <select value={theme} onChange={(e) => changeTheme(e.target.value)}>
                <option value="glass-dark">Dark Mode</option>
                <option value="glass-blue">Ocean Wave</option>
                <option value="glass-purple">Cosmic Purple</option>
                <option value="glass-sunset">Sunset Glow</option>
              </select>
            </div>

            <button className="header-btn logout-btn" onClick={handleLogout} title="Leave room">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* WORKSPACE */}
        <div className="chat-workspace">
          
          {/* SIDEBAR: Online Users & Invite */}
          <aside className="chat-sidebar">
            {showQR && (
              <div className="qr-invite-panel glass">
                <div className="qr-header">
                  <h3>Invite Friend</h3>
                  <button className="close-btn" onClick={() => setShowQR(false)}><X size={16} /></button>
                </div>
                <div className="qr-body">
                  <div className="qr-container">
                    <QRCodeSVG value={joinUrl} size={150} bgColor="#ffffff" fgColor="#000000" includeMargin={true} />
                  </div>
                  <p className="qr-instructions">
                    Scan this QR code from your friend's phone or open this link on their browser:
                  </p>
                  <div className="qr-url-box">
                    <code>{joinUrl}</code>
                  </div>
                </div>
              </div>
            )}

            <div className="users-panel">
              {/* CHANNELS SECTION */}
              <div className="panel-header">
                <Users size={16} />
                <h3>Channels</h3>
              </div>
              <div className="users-list" style={{ marginBottom: '16px' }}>
                <div 
                  className={`user-item ${activeChatId === 'general' ? 'active' : ''}`}
                  onClick={() => handleSelectChat('general')}
                >
                  <div className="user-avatar-frame-small" style={{ '--accent-glow': 'var(--accent-color)' }}>
                    <span className="avatar-emoji-text">🌐</span>
                  </div>
                  <span className="user-nickname" style={{ fontWeight: 'bold' }}>
                    # general
                  </span>
                </div>
              </div>

              {/* DIRECT MESSAGES SECTION */}
              <div className="panel-header">
                <Users size={16} />
                <h3>Direct Messages</h3>
              </div>
              <div className="users-list">
                {otherUsers.length === 0 ? (
                  <div className="sidebar-empty-state">
                    No other users online.<br/>Invite friends on your network to chat privately!
                  </div>
                ) : (
                  otherUsers.map((user) => (
                    <div 
                      key={user.id} 
                      className={`user-item ${activeChatId === user.id ? 'active' : ''}`}
                      onClick={() => handleSelectChat(user.id)}
                    >
                      <div className="user-avatar-frame-small" style={{ '--accent-glow': user.color }}>
                        {renderAvatar(user.avatar, user.nickname, 'user-avatar-img-small')}
                      </div>
                      <span className="user-nickname" style={{ color: user.color }}>
                        {user.nickname}
                      </span>
                      {unreadCounts[user.id] > 0 && (
                        <span className="unread-badge">{unreadCounts[user.id]}</span>
                      )}
                      <span className="user-status-dot"></span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          {/* MAIN CHAT AREA */}
          <main className="chat-area">
            
            {/* Messages Viewport */}
            <div className="messages-viewport">
              {filteredMessages.length === 0 ? (
                searchQuery.trim() ? (
                  <div className="chat-placeholder">
                    <div className="placeholder-art">🔍</div>
                    <h3>No results found</h3>
                    <p>No messages match "{searchQuery}" in this conversation.</p>
                  </div>
                ) : activeChatId === 'general' ? (
                  <div className="chat-placeholder">
                    <div className="placeholder-art">🌊</div>
                    <h3>Welcome to WiFi Wave Chat!</h3>
                    <p>Share the QR code or URL to invite friends on your same WiFi network and start chatting instantly.</p>
                  </div>
                ) : (
                  <div className="chat-placeholder">
                    <div className="placeholder-art">🔒</div>
                    <h3>Secret Chat Room</h3>
                    <p>This conversation is private and encrypted between you and {onlineUsers.find(u => u.id === activeChatId)?.nickname || 'your friend'}.</p>
                  </div>
                )
              ) : (
                filteredMessages.map((msg) => {
                  if (msg.isSystem) {
                    return (
                      <div key={msg.id} className="message-system">
                        <span>{msg.text}</span>
                      </div>
                    );
                  }

                  const isMe = msg.sender.id === socket?.id;

                  return (
                    <div key={msg.id} className={`message-row ${isMe ? 'message-me' : 'message-other'}`}>
                      {!isMe && (
                        <div className="msg-avatar-frame" style={{ '--accent-glow': msg.sender.color }}>
                          {renderAvatar(msg.sender.avatar, msg.sender.nickname, 'msg-avatar-img')}
                        </div>
                      )}
                      
                      <div className="message-bubble-container">
                        {!isMe && (
                          <span className="msg-sender-name" style={{ color: msg.sender.color }}>
                            {msg.sender.nickname}
                          </span>
                        )}
                        
                        <div 
                          className="message-bubble"
                          style={isMe ? { '--bubble-accent': selectedColor } : { '--bubble-accent': msg.sender.color }}
                        >
                          {/* Edit Mode */}
                          {editingMessageId === msg.id && msg.type === 'text' ? (
                            <div className="edit-message-form">
                              <input
                                type="text"
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                placeholder="Edit your message..."
                                autoFocus
                                className="edit-input"
                              />
                              <div className="edit-actions">
                                <button
                                  onClick={() => handleSaveEdit(msg.id)}
                                  className="edit-save-btn"
                                  title="Save edit (Ctrl+Enter)"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="edit-cancel-btn"
                                  title="Cancel"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* Text Messages */}
                              {msg.type === 'text' && (
                                <p className="msg-text">
                                  {msg.text}
                                  {msg.edited && <span className="msg-edited-indicator"> (edited)</span>}
                                </p>
                              )}

                          {/* Image Messages */}
                          {msg.type === 'image' && (
                            <div className="msg-image-attachment">
                              {msg.fileData ? (
                                <img 
                                  src={msg.fileData} 
                                  alt={msg.fileName} 
                                  onClick={() => setPreviewImage(msg.fileData)}
                                />
                              ) : (
                                <div className="msg-media-placeholder">
                                  <Image size={24} />
                                  <span>Image ({msg.fileName})</span>
                                  <span className="media-placeholder-note">Not stored in local history</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Voice Message */}
                          {msg.type === 'voice' && (
                            <div className="msg-voice-attachment">
                              {msg.fileData ? (
                                <audio src={msg.fileData} controls className="styled-audio" />
                              ) : (
                                <div className="msg-media-placeholder">
                                  <Mic size={24} />
                                  <span>Voice Note</span>
                                  <span className="media-placeholder-note">Not stored in local history</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* File Attachment */}
                          {msg.type === 'file' && (
                            <div className="msg-file-attachment">
                              <div className="file-info">
                                <FileText size={20} className="file-icon" />
                                <div>
                                  <div className="file-name">{msg.fileName}</div>
                                  <div className="file-size">{formatFileSize(msg.fileSize)}</div>
                                </div>
                              </div>
                              {msg.fileData ? (
                                <a 
                                  href={msg.fileData} 
                                  download={msg.fileName} 
                                  className="file-download-btn"
                                  title="Download File"
                                >
                                  <Download size={16} />
                                </a>
                              ) : (
                                <span className="media-placeholder-note file-missing-note">Expired</span>
                              )}
                            </div>
                          )}

                          <div className="msg-metadata">
                            <span className="msg-time">{formatTime(msg.timestamp)}</span>
                            {isMe && <CheckCheck size={14} className="msg-status-icon" />}
                            {isMe && msg.type === 'text' && (
                              <div className="msg-actions">
                                <button
                                  onClick={() => handleStartEdit(msg.id, msg.text)}
                                  className="msg-action-btn edit-btn"
                                  title="Edit message"
                                >
                                  ✎
                                </button>
                                <button
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  className="msg-action-btn delete-btn"
                                  title="Delete message"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Reactions */}
                          {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                            <div className="msg-reactions">
                              {Object.entries(msg.reactions).map(([emoji, userIds]) => (
                                <button
                                  key={emoji}
                                  className={`reaction-btn ${userIds.includes(socket?.id) ? 'user-reacted' : ''}`}
                                  onClick={() => handleToggleReaction(msg.id, emoji)}
                                  title={`Reacted by ${userIds.length} user${userIds.length > 1 ? 's' : ''}`}
                                >
                                  <span className="reaction-emoji">{emoji}</span>
                                  <span className="reaction-count">{userIds.length}</span>
                                </button>
                              ))}
                              <button
                                className="add-reaction-btn"
                                onClick={() => handleToggleReaction(msg.id, EMOJIS[Math.floor(Math.random() * EMOJIS.length)])}
                                title="Add reaction"
                              >
                                +
                              </button>
                            </div>
                          )}

                          {/* Show add reaction button if no reactions exist */}
                          {(!msg.reactions || Object.keys(msg.reactions).length === 0) && (
                            <div className="msg-reactions empty">
                              <button
                                className="add-reaction-btn"
                                onClick={() => handleToggleReaction(msg.id, EMOJIS[Math.floor(Math.random() * EMOJIS.length)])}
                                title="Add reaction"
                              >
                                 +
                              </button>
                            </div>
                          )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Character Dock */}
            <div className="typing-indicator-dock">
              {/* Other Online Friends */}
              {otherUsers.map((user, index) => {
                const isUserTyping = typingUsers.some((u) => u.id === user.id && (activeChatId === 'general' ? !u.recipientId : u.recipientId === socket?.id));
                const playerTag = `${index + 2}P`;
                return (
                  <div key={user.id} className="typing-avatar-node arcade-node">
                    {/* Player Badge */}
                    <div className="arcade-player-badge" style={{ '--badge-color': user.color }}>
                      {playerTag}
                    </div>

                    {/* Arcade Corner Brackets */}
                    <div className="arcade-brackets" style={{ '--accent-glow': user.color }}>
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>

                    {/* Thought cloud bubble (only visible when typing) */}
                    {isUserTyping && (
                      <>
                        <div className="thought-cloud" style={{ '--accent-glow': user.color }}>
                          <div className="typing-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                        </div>
                        {/* Connecting thought bubbles */}
                        <div className="thought-bubble-small-1" style={{ '--accent-glow': user.color }}></div>
                        <div className="thought-bubble-small-2" style={{ '--accent-glow': user.color }}></div>
                      </>
                    )}
                    
                    {/* Character Avatar */}
                    <div className="typing-avatar-frame" style={{ '--accent-glow': user.color }}>
                      {renderAvatar(user.avatar, user.nickname, 'typing-avatar-img')}
                    </div>
                    
                    {/* Arcade Name Plate */}
                    <div className="arcade-name-plate" style={{ '--accent-glow': user.color }}>
                      <span className="typing-name">
                        {user.nickname}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Self Character (Always Visible) */}
              <div className="typing-avatar-node self-node arcade-node">
                {/* Player Badge */}
                <div className="arcade-player-badge self-badge" style={{ '--badge-color': selectedColor }}>
                  1P
                </div>

                {/* Arcade Corner Brackets */}
                <div className="arcade-brackets" style={{ '--accent-glow': selectedColor }}>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>

                {/* Thought cloud bubble (only visible when typing) */}
                {isTyping && (
                  <>
                    <div className="thought-cloud" style={{ '--accent-glow': selectedColor }}>
                      <div className="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                    {/* Connecting thought bubbles */}
                    <div className="thought-bubble-small-1" style={{ '--accent-glow': selectedColor }}></div>
                    <div className="thought-bubble-small-2" style={{ '--accent-glow': selectedColor }}></div>
                  </>
                )}
                
                {/* Character Avatar */}
                <div className="typing-avatar-frame self-frame" style={{ '--accent-glow': selectedColor }}>
                  {renderAvatar(selectedAvatar, nickname, 'typing-avatar-img')}
                </div>
                
                {/* Arcade Name Plate */}
                <div className="arcade-name-plate self-name-plate" style={{ '--accent-glow': selectedColor }}>
                  <span className="typing-name">
                    {nickname}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Emoji Bar */}
            {showEmojiPicker && (
              <div className="emoji-bar-popup glass">
                {EMOJIS.map((emoji) => (
                  <button 
                    key={emoji} 
                    type="button" 
                    className="emoji-select-btn" 
                    onClick={() => handleSelectEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            {/* CHAT INPUT AREA */}
            <div className="chat-footer-controls">
              {isSomeoneSketching && (
                <div className="sketching-status-bar" style={{ marginBottom: '8px' }}>
                  <span className="sketching-status-dot"></span>
                  <span>
                    {Object.entries(sketchpadActiveUsers)
                      .filter(([id, details]) => {
                        if (id === socket?.id) return false;
                        if (activeChatId === 'general') return !details.recipientId;
                        return details.recipientId === socket?.id && id === activeChatId;
                      })
                      .map(([id, details]) => details.nickname)
                      .join(', ')}{' '}
                    is drawing on the sketchpad...
                  </span>
                </div>
              )}
              {isRecording ? (
                // Recording Mode
                <div className="recording-dashboard glass">
                  <div className="recording-status">
                    <span className="recording-dot"></span>
                    <span>Recording Voice Note... ({recordingDuration}s)</span>
                  </div>
                  <div className="recording-actions">
                    <button className="btn-icon btn-cancel" onClick={cancelRecording} title="Cancel recording">
                      <X size={18} />
                    </button>
                    <button className="btn btn-record-stop" onClick={stopRecording} title="Stop and send recording">
                      <Square size={16} /> Stop & Send
                    </button>
                  </div>
                </div>
              ) : (
                // Regular Input Mode
                <form onSubmit={handleSendMessage} className="input-form">
                  <div className="input-attachments">
                    {/* Emoji Trigger */}
                    <button 
                      type="button" 
                      className={`btn-icon input-tool-btn ${showEmojiPicker ? 'active' : ''}`}
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      title="Select Emoji"
                    >
                      <Smile size={20} />
                    </button>

                    {/* Image Attachment input */}
                    <label className="btn-icon input-tool-btn" title="Send Image">
                      <Image size={20} />
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageUpload} 
                        style={{ display: 'none' }} 
                      />
                    </label>

                    {/* File Attachment input */}
                    <label className="btn-icon input-tool-btn" title="Share File">
                      <Paperclip size={20} />
                      <input 
                        type="file" 
                        onChange={handleFileUpload} 
                        style={{ display: 'none' }} 
                      />
                    </label>

                    {/* Collaborative Sketchpad Trigger */}
                    <button 
                      type="button" 
                      className={`btn-icon input-tool-btn ${showSketchpad ? 'active' : ''}`}
                      onClick={() => setShowSketchpad(!showSketchpad)}
                      title="Collaborative Sketchpad"
                      style={{ position: 'relative' }}
                    >
                      <Paintbrush size={20} />
                      {isSomeoneSketching && <span className="sketch-badge-notification"></span>}
                    </button>
                  </div>

                  <input
                    type="text"
                    value={inputText}
                    onChange={handleTextInputChange}
                    placeholder="Type a message..."
                    className="message-text-input"
                    autoComplete="off"
                  />

                  <div className="input-actions">
                    <button 
                      type="button" 
                      className="btn-icon voice-record-btn"
                      onClick={startRecording}
                      title="Record Voice Note"
                    >
                      <Mic size={20} />
                    </button>

                    <button 
                      type="submit" 
                      className="btn-icon send-msg-btn" 
                      disabled={!inputText.trim()}
                      title="Send Message"
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </form>
              )}
            </div>

          </main>
        </div>
      </div>

      {/* FULLSCREEN IMAGE PREVIEW MODAL */}
      {previewImage && (
        <div className="fullscreen-image-modal" onClick={() => setPreviewImage(null)}>
          <div className="modal-content">
            <button className="modal-close" onClick={() => setPreviewImage(null)}>
              <X size={24} />
            </button>
            <img src={previewImage} alt="Preview" />
          </div>
        </div>
      )}

      {/* COLLABORATIVE SKETCHPAD MODAL */}
      {showSketchpad && (
        <SketchpadModal
          onClose={() => setShowSketchpad(false)}
          onSend={handleSendSketch}
          socket={socket}
          activeChatId={activeChatId}
        />
      )}
    </div>
  );
}

export default App;
