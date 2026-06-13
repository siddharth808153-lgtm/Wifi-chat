import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  Send, Image, Mic, Paperclip, Smile, Users, QrCode, 
  Wifi, WifiOff, LogOut, Palette, Trash2, Play, Pause, 
  X, CheckCheck, Square, Download, FileText, Sparkles, Lock
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
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  
  // Input States
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  // Voice Note Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  // App UI Customization
  const [theme, setTheme] = useState('glass-dark');
  const [showQR, setShowQR] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  
  // Refs
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingIntervalRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Derived state: Online users other than the current client
  const otherUsers = onlineUsers.filter((user) => user.id !== socket?.id);

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
    });

    socketInstance.on('message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      if (msg.sender && msg.sender.id !== socketInstance.id && !msg.isSystem) {
        playReceiveSound();
      }
    });

    socketInstance.on('user-typing', ({ id, nickname: userNick, avatar, color, isTyping: isUserTyping }) => {
      setTypingUsers((prev) => {
        if (isUserTyping) {
          if (prev.some(u => u.id === id)) return prev;
          return [...prev, { id, nickname: userNick, avatar, color }];
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

    return () => {
      socketInstance.disconnect();
    };
  }, []);

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
  };

  // Text message submission
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !socket) return;

    socket.emit('send-message', {
      type: 'text',
      text: inputText
    });

    setInputText('');
    
    // Trigger typing stop immediately
    if (isTyping) {
      socket.emit('typing', false);
      setIsTyping(false);
    }
  };

  // Typing state detection
  const handleTextInputChange = (e) => {
    setInputText(e.target.value);
    
    if (!socket) return;

    if (!isTyping) {
      socket.emit('typing', true);
      setIsTyping(true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', false);
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
          fileName: file.name
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
        fileSize: file.size
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
            fileName: 'voice-note.webm'
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
              <h2>Wave Chat</h2>
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
              <div className="panel-header">
                <Users size={16} />
                <h3>Online Friends ({onlineUsers.length})</h3>
              </div>
              <div className="users-list">
                {onlineUsers.map((user) => (
                  <div key={user.id} className="user-item">
                    <div className="user-avatar-frame-small" style={{ '--accent-glow': user.color }}>
                      {renderAvatar(user.avatar, user.nickname, 'user-avatar-img-small')}
                    </div>
                    <span className="user-nickname" style={{ color: user.color }}>
                      {user.nickname}
                      {user.id === socket?.id && <span className="self-tag"> (you)</span>}
                    </span>
                    <span className="user-status-dot"></span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* MAIN CHAT AREA */}
          <main className="chat-area">
            
            {/* Messages Viewport */}
            <div className="messages-viewport">
              {messages.length === 0 ? (
                <div className="chat-placeholder">
                  <div className="placeholder-art">🌊</div>
                  <h3>Welcome to WiFi Wave Chat!</h3>
                  <p>Share the QR code or URL to invite friends on your same WiFi network and start chatting instantly.</p>
                </div>
              ) : (
                messages.map((msg) => {
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
                          {/* Text Messages */}
                          {msg.type === 'text' && <p className="msg-text">{msg.text}</p>}

                          {/* Image Messages */}
                          {msg.type === 'image' && (
                            <div className="msg-image-attachment">
                              <img 
                                src={msg.fileData} 
                                alt={msg.fileName} 
                                onClick={() => setPreviewImage(msg.fileData)}
                              />
                            </div>
                          )}

                          {/* Voice Message */}
                          {msg.type === 'voice' && (
                            <div className="msg-voice-attachment">
                              <audio src={msg.fileData} controls className="styled-audio" />
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
                              <a 
                                href={msg.fileData} 
                                download={msg.fileName} 
                                className="file-download-btn"
                                title="Download File"
                              >
                                <Download size={16} />
                              </a>
                            </div>
                          )}

                          <div className="msg-metadata">
                            <span className="msg-time">{formatTime(msg.timestamp)}</span>
                            {isMe && <CheckCheck size={14} className="msg-status-icon" />}
                          </div>
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
                const isUserTyping = typingUsers.some((u) => u.id === user.id);
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
    </div>
  );
}

export default App;
