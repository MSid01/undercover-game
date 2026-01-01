import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { getRandomPair, getPairCount, runGeneration, getAllPairs } from './db/word-generator.js';
import { startCron, stopCron } from './db/cron.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// In-memory storage
const rooms = new Map();
const playerTokens = new Map(); // token -> { roomCode, playerName, word, role, socketId }

// Fallback static word pairs (used if database is empty)
const FALLBACK_WORD_PAIRS = [
  { civilianWord: 'Cat', undercoverWord: 'Dog' },
  { civilianWord: 'Pizza', undercoverWord: 'Burger' },
  { civilianWord: 'Malaysia', undercoverWord: 'Thailand' },
  { civilianWord: 'Snake', undercoverWord: 'Eel' },
  { civilianWord: 'Guitar', undercoverWord: 'Ukulele' },
];

// Generate random room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  if (rooms.has(code)) {
    return generateRoomCode();
  }
  return code;
}

// Generate unique player token
function generatePlayerToken() {
  return uuidv4().replace(/-/g, '').substring(0, 12);
}

// Get random word pair (from database or fallback)
async function getRandomWordPair() {
  // Try database first
  const dbPair = await getRandomPair();
  if (dbPair) {
    return dbPair;
  }
  // Fallback to static pairs
  return FALLBACK_WORD_PAIRS[Math.floor(Math.random() * FALLBACK_WORD_PAIRS.length)];
}

// Shuffle array
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Generate QR code as data URL
async function generateQRCode(url) {
  try {
    return await QRCode.toDataURL(url, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('QR generation error:', err);
    return null;
  }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// REST API - Generate words (for offline mode)
app.post('/api/generate-words', async (req, res) => {
  const wordPair = await getRandomWordPair();
  console.log(`🎲 Selected word pair: ${wordPair.civilianWord} / ${wordPair.undercoverWord}`);
  res.json(wordPair);
});

// Health check
app.get('/api/health', async (req, res) => {
  res.json({ 
    status: 'OK', 
    rooms: rooms.size, 
    tokens: playerTokens.size, 
    wordPairs: await getPairCount(),
    timestamp: new Date().toISOString() 
  });
});

// Word pairs stats
app.get('/api/words/stats', async (req, res) => {
  res.json({ 
    count: await getPairCount(),
    hasGroqKey: !!process.env.GROQ_API_KEY
  });
});

// Get all word pairs (for debugging)
app.get('/api/words', async (req, res) => {
  const pairs = await getAllPairs();
  res.json({ count: pairs.length, pairs });
});

// Manually trigger word generation (for testing)
app.post('/api/words/generate', async (req, res) => {
  try {
    const result = await runGeneration();
    res.json({ 
      success: true, 
      ...result,
      totalCount: await getPairCount()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop the cron job
app.post('/api/cron/stop', (req, res) => {
  const stopped = stopCron();
  res.json({ success: stopped, message: stopped ? 'Cron stopped' : 'Cron was not running' });
});

// Start the cron job
app.post('/api/cron/start', (req, res) => {
  startCron();
  res.json({ success: true, message: 'Cron started' });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Serve word page (for QR code scans)
app.get('/word', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'word.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // ==================== HYBRID OFFLINE MODE (QR-based) ====================
  
  // HOST: Create offline room with QR codes for each player
  socket.on('create-offline-room', async (data, callback) => {
    const { players, baseUrl } = data; // players: [{ name, role, word }]
    const roomCode = generateRoomCode();
    
    const playersWithTokens = [];
    
    for (const player of players) {
      const token = generatePlayerToken();
      const qrUrl = `${baseUrl}/word?t=${token}`;
      const qrDataUrl = await generateQRCode(qrUrl);
      
      // Store token mapping
      playerTokens.set(token, {
        roomCode,
        playerName: player.name,
        word: player.word,
        role: player.role,
        hasSeenWord: false,
        socketId: null
      });
      
      playersWithTokens.push({
        name: player.name,
        role: player.role,
        word: player.word,
        token,
        qrCode: qrDataUrl,
        hasSeenWord: false
      });
    }
    
    const room = {
      code: roomCode,
      type: 'offline',
      hostId: socket.id,
      players: playersWithTokens,
      status: 'revealing',
      createdAt: Date.now()
    };
    
    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    console.log(`📱 Offline room created: ${roomCode} with ${players.length} players (QR-based)`);
    
    // Return room code and QR codes for each player
    callback({ 
      success: true, 
      roomCode,
      players: playersWithTokens.map(p => ({
        name: p.name,
        token: p.token,
        qrCode: p.qrCode
      }))
    });
  });

  // PLAYER: Claim word using token (from QR code scan)
  socket.on('claim-by-token', (data, callback) => {
    const { token } = data;
    const tokenData = playerTokens.get(token);
    
    if (!tokenData) {
      callback({ success: false, error: 'Invalid or expired token' });
      return;
    }
    
    if (tokenData.hasSeenWord) {
      // Already seen but allow reconnection
      callback({
        success: true,
        reconnected: true,
        playerName: tokenData.playerName,
        word: tokenData.word,
        role: tokenData.role,
        roomCode: tokenData.roomCode
      });
      return;
    }
    
    // Link socket to token
    tokenData.socketId = socket.id;
    socket.playerToken = token;
    socket.roomCode = tokenData.roomCode;
    socket.join(tokenData.roomCode);
    
    console.log(`🎫 Token claimed: ${tokenData.playerName} in room ${tokenData.roomCode}`);
    
    callback({
      success: true,
      playerName: tokenData.playerName,
      word: tokenData.word,
      role: tokenData.role,
      roomCode: tokenData.roomCode
    });
  });

  // PLAYER: Confirm word seen (via QR/phone)
  socket.on('token-word-seen', (data) => {
    const { token } = data;
    const tokenData = playerTokens.get(token);
    
    if (!tokenData) return;
    
    tokenData.hasSeenWord = true;
    
    // Update room data too
    const room = rooms.get(tokenData.roomCode);
    if (room) {
      const player = room.players.find(p => p.token === token);
      if (player) {
        player.hasSeenWord = true;
      }
      
      // Notify host
      io.to(room.hostId).emit('player-seen-word', {
        playerName: tokenData.playerName,
        seenCount: room.players.filter(p => p.hasSeenWord).length,
        totalPlayers: room.players.length
      });
    }
    
    console.log(`✓ ${tokenData.playerName} confirmed word seen via phone`);
  });

  // PLAYER: Reconnect with existing token (for next round)
  socket.on('reconnect-with-token', (data, callback) => {
    const { token } = data;
    const tokenData = playerTokens.get(token);
    
    if (!tokenData) {
      callback({ success: false, error: 'Token not found' });
      return;
    }
    
    // Update socket ID
    tokenData.socketId = socket.id;
    socket.playerToken = token;
    socket.roomCode = tokenData.roomCode;
    socket.join(tokenData.roomCode);
    
    console.log(`🔄 ${tokenData.playerName} reconnected with token`);
    
    callback({
      success: true,
      playerName: tokenData.playerName,
      roomCode: tokenData.roomCode,
      // Don't send word yet - wait for new round to start
      waiting: true
    });
  });

  // HOST: Update tokens for new round (same players, new words)
  socket.on('update-round-tokens', async (data, callback) => {
    const { roomCode, players, baseUrl } = data; // players with new words
    const room = rooms.get(roomCode);
    
    if (!room || room.hostId !== socket.id) {
      callback({ success: false, error: 'Not authorized' });
      return;
    }
    
    // Update existing tokens with new words
    for (const player of players) {
      const existingPlayer = room.players.find(p => p.name === player.name);
      if (existingPlayer && existingPlayer.token) {
        const tokenData = playerTokens.get(existingPlayer.token);
        if (tokenData) {
          tokenData.word = player.word;
          tokenData.role = player.role;
          tokenData.hasSeenWord = false;
          
          // Update room player data
          existingPlayer.word = player.word;
          existingPlayer.role = player.role;
          existingPlayer.hasSeenWord = false;
          
          // Notify connected player of new word
          if (tokenData.socketId) {
            io.to(tokenData.socketId).emit('new-round-word', {
              word: player.word,
              role: player.role
            });
          }
        }
      }
    }
    
    console.log(`🔄 Round updated for room ${roomCode}`);
    
    callback({ success: true });
  });

  // HOST: Close offline room and clean up tokens
  socket.on('close-offline-room', (data) => {
    const { roomCode } = data;
    const room = rooms.get(roomCode);
    
    if (room) {
      // Clean up all tokens for this room
      for (const player of room.players) {
        if (player.token) {
          playerTokens.delete(player.token);
        }
      }
      
      // Notify all connected players
      io.to(roomCode).emit('room-closed', { reason: 'Session ended' });
      
      rooms.delete(roomCode);
      console.log(`📱 Offline room ${roomCode} closed, tokens cleaned up`);
    }
  });

  // ==================== ONLINE MODE ====================
  
  // HOST: Create a new room (online mode)
  socket.on('create-room', (data, callback) => {
    const { hostName, settings } = data;
    const roomCode = generateRoomCode();
    
    const room = {
      code: roomCode,
      type: 'online',
      hostId: socket.id,
      hostName: hostName,
      settings: {
        totalPlayers: settings.totalPlayers || 4,
        undercoverCount: settings.undercoverCount || 1,
        mrwhiteCount: settings.mrwhiteCount || 0
      },
      players: [{
        id: socket.id,
        name: hostName,
        isHost: true,
        role: null,
        word: null,
        hasSeenWord: false
      }],
      status: 'waiting',
      words: null,
      currentRevealIndex: 0
    };
    
    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    console.log(`🏠 Room created: ${roomCode} by ${hostName}`);
    
    callback({ success: true, roomCode, room: getSafeRoomData(room) });
  });

  // PLAYER: Join an existing room (online mode)
  socket.on('join-room', (data, callback) => {
    const { roomCode, playerName } = data;
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
      callback({ success: false, error: 'Room not found' });
      return;
    }
    
    if (room.type === 'offline') {
      callback({ success: false, error: 'This is an offline game. Scan the QR code instead.' });
      return;
    }
    
    if (room.status !== 'waiting') {
      callback({ success: false, error: 'Game already started' });
      return;
    }
    
    if (room.players.length >= room.settings.totalPlayers) {
      callback({ success: false, error: 'Room is full' });
      return;
    }
    
    if (room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
      callback({ success: false, error: 'Name already taken' });
      return;
    }
    
    room.players.push({
      id: socket.id,
      name: playerName,
      isHost: false,
      role: null,
      word: null,
      hasSeenWord: false
    });
    
    socket.join(roomCode.toUpperCase());
    socket.roomCode = roomCode.toUpperCase();
    
    console.log(`👤 ${playerName} joined room ${roomCode}`);
    
    io.to(roomCode.toUpperCase()).emit('player-joined', {
      player: { name: playerName },
      players: room.players.map(p => ({ name: p.name, isHost: p.isHost })),
      totalPlayers: room.settings.totalPlayers
    });
    
    callback({ success: true, room: getSafeRoomData(room) });
  });

  // HOST: Update room settings
  socket.on('update-settings', (data) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.hostId !== socket.id) return;
    
    room.settings = { ...room.settings, ...data.settings };
    
    io.to(socket.roomCode).emit('settings-updated', {
      settings: room.settings
    });
  });

  // HOST: Start the game (online mode)
  socket.on('start-game', async (callback) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.hostId !== socket.id) {
      callback({ success: false, error: 'Not authorized' });
      return;
    }
    
    if (room.players.length < 3) {
      callback({ success: false, error: 'Need at least 3 players' });
      return;
    }
    
    room.words = await getRandomWordPair();
    
    const shuffledPlayers = shuffleArray(room.players);
    let roleIndex = 0;
    
    for (let i = 0; i < room.settings.undercoverCount && roleIndex < shuffledPlayers.length; i++) {
      shuffledPlayers[roleIndex].role = 'undercover';
      shuffledPlayers[roleIndex].word = room.words.undercoverWord;
      roleIndex++;
    }
    
    for (let i = 0; i < room.settings.mrwhiteCount && roleIndex < shuffledPlayers.length; i++) {
      shuffledPlayers[roleIndex].role = 'mrwhite';
      shuffledPlayers[roleIndex].word = null;
      roleIndex++;
    }
    
    while (roleIndex < shuffledPlayers.length) {
      shuffledPlayers[roleIndex].role = 'civilian';
      shuffledPlayers[roleIndex].word = room.words.civilianWord;
      roleIndex++;
    }
    
    room.players = shuffleArray(shuffledPlayers);
    room.status = 'revealing';
    room.currentRevealIndex = 0;
    
    console.log(`🎮 Game started in room ${socket.roomCode}`);
    
    io.to(socket.roomCode).emit('game-started', {
      players: room.players.map(p => ({ name: p.name, isHost: p.isHost }))
    });
    
    room.players.forEach(player => {
      io.to(player.id).emit('your-word', {
        word: player.word,
        role: player.role
  });
});

    callback({ success: true });
  });

  // PLAYER: Confirmed they've seen their word (online mode)
  socket.on('word-seen', () => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.hasSeenWord = true;
      
      const seenCount = room.players.filter(p => p.hasSeenWord).length;
      io.to(room.hostId).emit('reveal-progress', {
        seen: seenCount,
        total: room.players.length
      });
      
      if (seenCount === room.players.length) {
        room.status = 'playing';
        io.to(socket.roomCode).emit('all-words-seen');
      }
    }
  });

  // HOST: Request speaking order for discussion round
  socket.on('get-speaking-order', (callback) => {
    const room = rooms.get(socket.roomCode);
    if (!room) {
      callback({ success: false });
      return;
    }
    
    const order = shuffleArray(room.players.map(p => p.name));
    callback({ success: true, order });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    
    // Don't delete token on disconnect - allow reconnection
    if (socket.playerToken) {
      const tokenData = playerTokens.get(socket.playerToken);
      if (tokenData) {
        tokenData.socketId = null; // Clear socket but keep token
        console.log(`📱 Player ${tokenData.playerName} disconnected but token preserved`);
      }
    }
    
    if (socket.roomCode) {
      const room = rooms.get(socket.roomCode);
      if (room && room.type === 'online') {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          const player = room.players[playerIndex];
          room.players.splice(playerIndex, 1);
          
          console.log(`👤 ${player.name} left room ${socket.roomCode}`);
          
          if (player.isHost) {
            io.to(socket.roomCode).emit('room-closed', { reason: 'Host left the room' });
            rooms.delete(socket.roomCode);
            console.log(`🏠 Room ${socket.roomCode} closed (host left)`);
          } else {
            io.to(socket.roomCode).emit('player-left', {
              player: { name: player.name },
              players: room.players.map(p => ({ name: p.name, isHost: p.isHost }))
            });
          }
        }
        
        if (room.players.length === 0) {
          rooms.delete(socket.roomCode);
          console.log(`🏠 Room ${socket.roomCode} deleted (empty)`);
        }
      }
    }
  });
});

// Helper: Get safe room data
function getSafeRoomData(room) {
  return {
    code: room.code,
    hostName: room.hostName,
    settings: room.settings,
    players: room.players.map(p => ({ name: p.name, isHost: p.isHost })),
    status: room.status
  };
}

// Clean up old offline rooms (expire after 24 hours)
setInterval(() => {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  
  for (const [code, room] of rooms) {
    if (room.type === 'offline' && now - room.createdAt > ONE_DAY) {
      // Clean up tokens
      for (const player of room.players) {
        if (player.token) {
          playerTokens.delete(player.token);
        }
      }
      rooms.delete(code);
      console.log(`🗑️ Expired offline room ${code} deleted`);
    }
  }
  console.log(`📊 Active rooms: ${rooms.size}, Active tokens: ${playerTokens.size}`);
}, 30 * 60 * 1000);

// Start server
server.listen(PORT, async () => {
  console.log(`🎭 Undercover Game Server running on http://localhost:${PORT}`);
  console.log(`🔌 Socket.io enabled for real-time gameplay`);
  console.log(`📱 QR code generation enabled`);
  console.log(`📊 Word pairs in database: ${await getPairCount()}`);
  
  // Start cron job for word generation
  startCron();
});

export default app;
