// ==================== GAME STATE ====================
const state = {
  mode: 'offline', // 'offline' or 'online'
  
  // Offline mode state
  totalPlayers: 4,
  undercoverCount: 1,
  mrwhiteCount: 0,
  playerNames: [],
  players: [],
  words: { civilian: '', undercover: '' },
  currentRevealIndex: 0,
  discussionRound: 1,
  speakingOrder: [],
  eliminatedThisRound: null,
  mrWhiteGuessedCorrectly: false,
  
  // Offline room data (with QR codes)
  offlineRoomCode: null,
  playerQRCodes: {}, // { playerName: qrCodeDataUrl }
  playerTokens: {}, // { playerName: token }
  
  // Session state
  session: {
    active: false,
    gameRound: 0,
    players: []
  },
  
  // Online/Socket state
  socket: null,
  roomCode: null,
  isHost: false,
  myName: null,
  myWord: null,
  myRole: null,
  onlinePlayers: [],
  
  // Token state (for players on their phone)
  myToken: null
};

// Storage keys
const STORAGE_KEYS = {
  GROUPS: 'undercover_groups',
  RECENT_NAMES: 'undercover_recent_names',
  SESSION: 'undercover_session',
  PLAYER_STATS: 'undercover_player_stats',
  MY_TOKEN: 'undercover_my_token',
  PLAYED_PAIRS: 'undercover_played_pairs'
};

// Points
const POINTS = {
  CIVILIAN_WIN: 2,
  UNDERCOVER_WIN: 10,
  MRWHITE_WIN: 6,
  MRWHITE_GUESS: 12
};

// ==================== AUDIO SYSTEM ====================
const audioCache = {};
const AUDIO_FILES = {
  click: '/audios/click.mp3',
  showWord: '/audios/show-word.mp3',
  seenWord: '/audios/i-have-seen-word.mp3',
  civiliansWin: '/audios/civilians-win.mp3',
  infiltratorsWin: '/audios/infiltrators-win.mp3',
  civilianDie: '/audios/civilian-die.mp3',
  undercoverDie: '/audios/undercover-die.mp3',
  mrwhiteGuessedCorrect: '/audios/mrwhite-guessed-correct.mp3',
  mrwhiteGuessedWrong: '/audios/mrwhite-guessed-wrong.mp3',
  amnesicMode: '/audios/amnesic-mode.mp3'
};

// Prefetch all audio files
function prefetchAudio() {
  Object.entries(AUDIO_FILES).forEach(([key, src]) => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = src;
    audioCache[key] = audio;
    console.log(`🔊 Prefetching audio: ${key}`);
  });
}

// Play a cached audio
function playAudio(key, volume = 0.7, loop = false) {
  try {
    const cachedAudio = audioCache[key];
    if (cachedAudio) {
      // Clone for overlapping plays
      const audio = cachedAudio.cloneNode();
      audio.volume = volume;
      audio.loop = loop;
      audio.play().catch(err => console.log('Audio play failed:', err));
      return audio;
    }
  } catch (e) {
    console.log('Audio not supported:', e);
  }
  return null;
}

// Stop a specific audio
function stopAudio(audio) {
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}

// Play click sound
function playClickSound() {
  playAudio('click', 0.3);
}

// ==================== DOM HELPERS ====================
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function showScreen(screenId) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  const screen = $(`#${screenId}-screen`);
  if (screen) screen.classList.add('active');
}

function showLoading(text = 'Loading...') {
  $('#loading-text').textContent = text;
  $('#loading-overlay').classList.remove('hidden');
}

function hideLoading() {
  $('#loading-overlay').classList.add('hidden');
}

// Get base URL for QR codes
function getBaseUrl() {
  return `${window.location.protocol}//${window.location.host}`;
}

// ==================== LOCAL STORAGE ====================
function getSavedGroups() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.GROUPS)) || []; }
  catch { return []; }
}

function saveGroups(groups) {
  localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(groups));
}

function getRecentNames() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.RECENT_NAMES)) || []; }
  catch { return []; }
}

function saveRecentNames(names) {
  const unique = [...new Set(names)].slice(0, 20);
  localStorage.setItem(STORAGE_KEYS.RECENT_NAMES, JSON.stringify(unique));
}

function addToRecentNames(names) {
  const recent = getRecentNames();
  const updated = [...new Set([...names, ...recent])].slice(0, 20);
  saveRecentNames(updated);
}

function getSavedSession() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION)) || null; }
  catch { return null; }
}

function saveSession() {
  if (state.session.active) {
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(state.session));
  }
}

function clearSavedSession() {
  localStorage.removeItem(STORAGE_KEYS.SESSION);
}

function getSavedToken() {
  return localStorage.getItem(STORAGE_KEYS.MY_TOKEN);
}

function saveToken(token) {
  localStorage.setItem(STORAGE_KEYS.MY_TOKEN, token);
}

function clearToken() {
  localStorage.removeItem(STORAGE_KEYS.MY_TOKEN);
}

// ==================== PLAYED WORD PAIRS ====================
function getPlayedPairs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.PLAYED_PAIRS)) || []; }
  catch { return []; }
}

function savePlayedPairs(pairs) {
  localStorage.setItem(STORAGE_KEYS.PLAYED_PAIRS, JSON.stringify(pairs));
}

function addPlayedPair(civilianWord, undercoverWord) {
  const played = getPlayedPairs();
  // Create a normalized key (alphabetical order)
  const w1 = civilianWord.toLowerCase();
  const w2 = undercoverWord.toLowerCase();
  const pairKey = w1 < w2 ? `${w1}|${w2}` : `${w2}|${w1}`;
  
  if (!played.includes(pairKey)) {
    played.push(pairKey);
    savePlayedPairs(played);
    console.log(`📝 Added played pair: ${pairKey}`);
  }
}

function hasPlayedPair(civilianWord, undercoverWord) {
  const played = getPlayedPairs();
  const w1 = civilianWord.toLowerCase();
  const w2 = undercoverWord.toLowerCase();
  const pairKey = w1 < w2 ? `${w1}|${w2}` : `${w2}|${w1}`;
  return played.includes(pairKey);
}

function clearPlayedPairs() {
  localStorage.removeItem(STORAGE_KEYS.PLAYED_PAIRS);
  console.log('🗑️ Cleared all played pairs');
}

function getPlayedPairsCount() {
  return getPlayedPairs().length;
}

// Prefetched word pair for next round
let prefetchedWordPair = null;
let isPrefetching = false;

async function prefetchNextWordPair() {
  if (isPrefetching) return;
  isPrefetching = true;
  
  try {
    // Try up to 5 times to get an unplayed pair
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await fetch('/api/generate-words', { method: 'POST' });
      const data = await response.json();
      
      if (!hasPlayedPair(data.civilianWord, data.undercoverWord)) {
        prefetchedWordPair = data;
        console.log(`✅ Prefetched word pair: ${data.civilianWord} / ${data.undercoverWord}`);
        break;
      } else {
        console.log(`⏭️ Skipping already played pair: ${data.civilianWord} / ${data.undercoverWord}`);
      }
    }
  } catch (error) {
    console.error('Failed to prefetch word pair:', error);
  } finally {
    isPrefetching = false;
  }
}

async function getWordPairForRound() {
  // Use prefetched pair if available
  if (prefetchedWordPair) {
    const pair = prefetchedWordPair;
    prefetchedWordPair = null;
    
    // Start prefetching next pair in background
    prefetchNextWordPair();
    
    return pair;
  }
  
  // Otherwise fetch now (with retry for unplayed)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch('/api/generate-words', { method: 'POST' });
      const data = await response.json();
      
      if (!hasPlayedPair(data.civilianWord, data.undercoverWord)) {
        // Start prefetching next pair in background
        prefetchNextWordPair();
        return data;
      } else {
        console.log(`⏭️ Skipping already played pair: ${data.civilianWord} / ${data.undercoverWord}`);
      }
    } catch (error) {
      console.error('Failed to fetch word pair:', error);
    }
  }
  
  // Fallback: return any pair (all pairs played or error)
  console.warn('⚠️ Could not find unplayed pair, using any available');
  const response = await fetch('/api/generate-words', { method: 'POST' });
  return await response.json();
}

function getPlayerStats() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.PLAYER_STATS)) || {}; }
  catch { return {}; }
}

function savePlayerStats(stats) {
  localStorage.setItem(STORAGE_KEYS.PLAYER_STATS, JSON.stringify(stats));
}

function updatePlayerStats(playerName, role, won, points) {
  const stats = getPlayerStats();
  const key = playerName.toLowerCase();
  
  if (!stats[key]) {
    stats[key] = {
      name: playerName, totalPoints: 0, gamesPlayed: 0,
      civilianPlayed: 0, civilianWon: 0,
      undercoverPlayed: 0, undercoverWon: 0,
      mrwhitePlayed: 0, mrwhiteWon: 0
    };
  }
  
  stats[key].totalPoints += points;
  stats[key].gamesPlayed += 1;
  
  if (role === 'civilian') {
    stats[key].civilianPlayed += 1;
    if (won) stats[key].civilianWon += 1;
  } else if (role === 'undercover') {
    stats[key].undercoverPlayed += 1;
    if (won) stats[key].undercoverWon += 1;
  } else if (role === 'mrwhite') {
    stats[key].mrwhitePlayed += 1;
    if (won) stats[key].mrwhiteWon += 1;
  }
  
  savePlayerStats(stats);
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  // Prefetch audio files
  prefetchAudio();
  
  // Always initialize event listeners first
  initEventListeners();
  
  // Check if this is a token URL (player scanning QR code)
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('t');
  
  if (token) {
    // This is a player scanning a QR code
    handleTokenUrl(token);
  } else {
    // Normal flow - check for saved token first
    const savedToken = getSavedToken();
    if (savedToken) {
      // Try to reconnect with saved token
      tryReconnectWithToken(savedToken);
    } else {
      // Normal initialization
      initApp();
    }
  }
});

function initApp() {
  updatePlayerCountUI();
  updateRoleConfigUI();
  checkForSavedSession();
  
  // Start prefetching word pair in background
  prefetchNextWordPair();
}

function checkForSavedSession() {
  const savedSession = getSavedSession();
  if (savedSession && savedSession.active && savedSession.players.length > 0) {
    $('#resume-game-section').classList.remove('hidden');
    const playerNames = savedSession.players.map(p => p.name).slice(0, 4).join(', ');
    const more = savedSession.players.length > 4 ? `... +${savedSession.players.length - 4} more` : '';
    $('#resume-players-preview').textContent = `${playerNames}${more}`;
    $('#resume-round-info').textContent = `Game Round ${savedSession.gameRound} • ${savedSession.players.length} players`;
  } else {
    $('#resume-game-section').classList.add('hidden');
  }
}

function initEventListeners() {
  // Global click sound for buttons
  document.addEventListener('click', (e) => {
    if (e.target.matches('button, .btn, .mode-card, .elimination-option, .player-reveal-option')) {
      playClickSound();
    }
  });
  
  // Landing
  $('#play-btn').addEventListener('click', () => {
    renderSavedGroups();
    showScreen('mode');
  });
  $('#resume-game-btn').addEventListener('click', resumeGame);
  $('#discard-session-btn').addEventListener('click', discardSession);
  $('#how-to-play-btn').addEventListener('click', () => $('#how-to-play-modal').classList.remove('hidden'));
  $('#close-modal').addEventListener('click', () => $('#how-to-play-modal').classList.add('hidden'));
  $('#got-rules-btn').addEventListener('click', () => $('#how-to-play-modal').classList.add('hidden'));

  // Mode selection
  $('#offline-mode-card').addEventListener('click', () => {
    state.mode = 'offline';
    renderSavedGroups();
    showScreen('player-setup');
  });
  $('#online-mode-card').addEventListener('click', () => {
    state.mode = 'online';
    showScreen('online-choice');
  });

  // Online choice
  $('#host-game-card').addEventListener('click', () => showScreen('host-setup'));
  $('#join-game-card').addEventListener('click', () => showScreen('join-room'));

  // Token word screen buttons
  $('#show-token-word-btn').addEventListener('click', showTokenWord);
  $('#confirm-token-word-btn').addEventListener('click', confirmTokenWord);
  $('#confirm-token-mrwhite-btn').addEventListener('click', confirmTokenWord);

  // Join Room (Online mode)
  $('#room-code-input').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  $('#join-room-btn').addEventListener('click', joinRoom);
  $('#leave-room-btn').addEventListener('click', leaveRoom);

  // Host Setup
  initHostSetupListeners();
  $('#create-room-btn').addEventListener('click', createRoom);

  // Host Lobby
  $('#start-online-game-btn').addEventListener('click', startOnlineGame);
  $('#close-room-btn').addEventListener('click', closeRoom);

  // Online Word Screen
  $('#reveal-online-word-btn').addEventListener('click', showOnlineWord);
  $('#hide-online-word-btn').addEventListener('click', hideOnlineWord);
  $('#mrwhite-online-continue-btn').addEventListener('click', hideOnlineWord);

  // Offline mode listeners
  $('#start-fresh-btn').addEventListener('click', () => showScreen('player-count'));
  $('#decrease-players').addEventListener('click', () => changePlayerCount(-1));
  $('#increase-players').addEventListener('click', () => changePlayerCount(1));
  $('#continue-to-roles-btn').addEventListener('click', () => {
    showScreen('role-config');
    updateRoleConfigUI();
  });

  $$('.stepper-btn').forEach(btn => {
    if (btn.dataset.target) btn.addEventListener('click', handleRoleStepper);
  });
  $('#continue-to-names-btn').addEventListener('click', startNameEntry);

  $('#add-name-btn').addEventListener('click', addPlayerName);
  $('#player-name-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addPlayerName();
  });

  $('#start-reveal-btn').addEventListener('click', startWordReveal);
  $('#save-group-btn').addEventListener('click', () => $('#save-group-modal').classList.remove('hidden'));

  $('#close-save-modal').addEventListener('click', () => $('#save-group-modal').classList.add('hidden'));
  $('#cancel-save-btn').addEventListener('click', () => $('#save-group-modal').classList.add('hidden'));
  $('#confirm-save-btn').addEventListener('click', saveCurrentGroup);
  $('#group-name-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveCurrentGroup();
  });

  // Offline reveal screen
  $('#im-ready-btn').addEventListener('click', showPlayerWord);
  $('#hide-word-btn').addEventListener('click', hideWordAndContinue);
  $('#mrwhite-got-it-btn').addEventListener('click', hideWordAndContinue);
  $('#player-used-phone-btn').addEventListener('click', playerUsedPhone);

  $('#start-elimination-btn').addEventListener('click', startElimination);
  $('#continue-game-btn').addEventListener('click', continueAfterElimination);
  $('#submit-guess-btn').addEventListener('click', handleMrWhiteGuess);

  // Scorecard and Amnesic mode
  $('#view-scores-btn').addEventListener('click', showScorecard);
  $('#close-scorecard-modal').addEventListener('click', hideScorecard);
  $('#amnesic-mode-btn').addEventListener('click', showAmnesicMode);
  $('#close-amnesic-modal').addEventListener('click', hideAmnesicMode);
  $('#hide-amnesic-word-btn').addEventListener('click', hideAmnesicWord);

  $('#play-again-btn').addEventListener('click', playNextRound);
  $('#end-session-btn').addEventListener('click', endSession);
  $('#close-stats-modal').addEventListener('click', () => $('#stats-modal').classList.add('hidden'));

  $$('.back-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.target.dataset.back;
      if (target === 'role-config') state.playerNames = [];
      if (target === 'landing' && state.socket) {
        state.socket.disconnect();
        state.socket = null;
      }
      showScreen(target);
    });
  });
}

// ==================== TOKEN URL HANDLING (QR Code Scan) ====================

function handleTokenUrl(token) {
  showScreen('token-word');
  $('#token-loading').classList.remove('hidden');
  $('#token-word-ready').classList.add('hidden');
  $('#token-error').classList.add('hidden');
  
  initSocket();
  
  state.socket.emit('claim-by-token', { token }, (response) => {
    $('#token-loading').classList.add('hidden');
    
    if (response.success) {
      state.myToken = token;
      state.myName = response.playerName;
      state.myWord = response.word;
      state.myRole = response.role;
      
      // Save token for future rounds
      saveToken(token);
      
      // Clear URL parameter
      window.history.replaceState({}, document.title, window.location.pathname);
      
      if (response.reconnected) {
        // Already seen this word, show waiting state
        showTokenWaitingState();
      } else {
        // Show ready to reveal state
        $('#token-player-name').textContent = response.playerName;
        $('#token-word-ready').classList.remove('hidden');
      }
    } else {
      $('#token-error').classList.remove('hidden');
      $('#token-error-message').textContent = response.error || 'Invalid or expired link';
    }
  });
}

function tryReconnectWithToken(token) {
  showScreen('token-word');
  $('#token-loading').classList.remove('hidden');
  $('#token-word-ready').classList.add('hidden');
  $('#token-error').classList.add('hidden');
  
  initSocket();
  
  state.socket.emit('reconnect-with-token', { token }, (response) => {
    $('#token-loading').classList.add('hidden');
    
    if (response.success) {
      state.myToken = token;
      state.myName = response.playerName;
      
      // Show waiting for next round
      $('#token-waiting-round').classList.remove('hidden');
      $('#token-word-done').classList.add('hidden');
    } else {
      // Token invalid, clear it and show normal landing
      clearToken();
      initApp();
      showScreen('landing');
    }
  });
}

function showTokenWord() {
  $('#token-word-ready').classList.add('hidden');
  
  if (state.myRole === 'mrwhite') {
    $('#token-mrwhite-state').classList.remove('hidden');
  } else {
    $('#token-word-display').textContent = state.myWord;
    $('#token-word-shown').classList.remove('hidden');
  }
}

function confirmTokenWord() {
  // Notify server
  state.socket.emit('token-word-seen', { token: state.myToken });
  
  // Show done state
  $('#token-word-shown').classList.add('hidden');
  $('#token-mrwhite-state').classList.add('hidden');
  $('#token-word-done').classList.remove('hidden');
}

function showTokenWaitingState() {
  $('#token-waiting-round').classList.remove('hidden');
}

// ==================== SOCKET.IO ====================
function initSocket() {
  if (state.socket) return;
  
  state.socket = io();
  
  state.socket.on('connect', () => {
    console.log('🔌 Connected to server');
  });
  
  state.socket.on('disconnect', () => {
    console.log('🔌 Disconnected from server');
  });
  
  // Player joined the room (online mode)
  state.socket.on('player-joined', (data) => {
    state.onlinePlayers = data.players;
    if (state.isHost) {
      updateHostLobbyUI();
    } else {
      updatePlayerLobbyUI();
    }
  });
  
  // Player left
  state.socket.on('player-left', (data) => {
    state.onlinePlayers = data.players;
    if (state.isHost) {
      updateHostLobbyUI();
    } else {
      updatePlayerLobbyUI();
    }
  });
  
  // Settings updated by host
  state.socket.on('settings-updated', (data) => {
    hostSettings = data.settings;
    updatePlayerLobbyUI();
  });
  
  // Game started (online mode)
  state.socket.on('game-started', (data) => {
    state.onlinePlayers = data.players;
    showScreen('online-word');
  });
  
  // Receive your word (online mode)
  state.socket.on('your-word', (data) => {
    state.myWord = data.word;
    state.myRole = data.role;
  });
  
  // Reveal progress (for host)
  state.socket.on('reveal-progress', (data) => {
    const percent = (data.seen / data.total) * 100;
    $('#host-reveal-progress').style.width = `${percent}%`;
    $('#host-reveal-text').textContent = `${data.seen} / ${data.total} players have seen their word`;
  });
  
  // All players have seen their word (online mode)
  state.socket.on('all-words-seen', () => {
    if (state.isHost) {
      $('#host-discussion-section').classList.remove('hidden');
      state.socket.emit('get-speaking-order', (response) => {
        if (response.success) {
          renderHostSpeakingOrder(response.order);
        }
      });
    }
  });
  
  // Player seen word notification (for offline hybrid mode)
  state.socket.on('player-seen-word', (data) => {
    console.log(`${data.playerName} saw their word (${data.seenCount}/${data.totalPlayers})`);
    const currentPlayer = state.players[state.currentRevealIndex];
    if (currentPlayer && currentPlayer.name.toLowerCase() === data.playerName.toLowerCase()) {
      currentPlayer.seenViaPhone = true;
    }
  });
  
  // New round word (for phone players)
  state.socket.on('new-round-word', (data) => {
    state.myWord = data.word;
    state.myRole = data.role;
    
    // Show ready to reveal again
    $('#token-waiting-round').classList.add('hidden');
    $('#token-word-done').classList.add('hidden');
    $('#token-player-name').textContent = state.myName;
    $('#token-word-ready').classList.remove('hidden');
    showScreen('token-word');
  });
  
  // Room closed
  state.socket.on('room-closed', (data) => {
    if (state.myToken) {
      // Player on phone - clear token and go home
      clearToken();
      state.myToken = null;
    }
    alert(data.reason || 'Room was closed');
    resetOnlineState();
    showScreen('landing');
    initApp();
  });
}

// ==================== HYBRID OFFLINE MODE (QR-based) ====================

async function createOfflineRoom() {
  return new Promise((resolve) => {
    initSocket();
    
    const playersData = state.players.map(p => ({
      name: p.name,
      role: p.role,
      word: p.word
    }));
    
    console.log('Creating offline room for players:', playersData.map(p => p.name));
    
    state.socket.emit('create-offline-room', { 
      players: playersData,
      baseUrl: getBaseUrl()
    }, (response) => {
      if (response.success) {
        state.offlineRoomCode = response.roomCode;
        
        // Store QR codes and tokens
        response.players.forEach(p => {
          state.playerQRCodes[p.name] = p.qrCode;
          state.playerTokens[p.name] = p.token;
        });
        
        console.log('📱 Offline room created:', response.roomCode);
        console.log('Tokens stored for:', Object.keys(state.playerTokens));
      } else {
        console.error('Failed to create offline room');
      }
      resolve(response.success);
    });
  });
}

function closeOfflineRoom() {
  if (state.socket && state.offlineRoomCode) {
    state.socket.emit('close-offline-room', { roomCode: state.offlineRoomCode });
    state.offlineRoomCode = null;
    state.playerQRCodes = {};
    state.playerTokens = {};
  }
}

function playerUsedPhone() {
  const player = state.players[state.currentRevealIndex];
  if (player) {
    player.seenViaPhone = true;
  }
  moveToNextPlayer();
}

// Update tokens for new round (keeps same QR codes, just updates words)
async function updateRoundTokens() {
  return new Promise((resolve) => {
    // Ensure socket is connected
    initSocket();
    
    if (!state.offlineRoomCode) {
      console.log('No room code, cannot update tokens');
      resolve(false);
      return;
    }
    
    const playersData = state.players.map(p => ({
      name: p.name,
      role: p.role,
      word: p.word
    }));
    
    console.log('Updating tokens for players:', playersData.map(p => p.name));
    
    state.socket.emit('update-round-tokens', {
      roomCode: state.offlineRoomCode,
      players: playersData,
      baseUrl: getBaseUrl()
    }, (response) => {
      if (response.success) {
        console.log('✓ Tokens updated for new round - same QR codes will work!');
      } else {
        console.error('Failed to update tokens:', response.error);
        // Fallback: create new room
        console.log('Falling back to creating new room...');
        state.offlineRoomCode = null;
        state.playerTokens = {};
        state.playerQRCodes = {};
        createOfflineRoom().then(resolve);
        return;
      }
      resolve(response.success);
    });
  });
}

// ==================== ONLINE MODE FUNCTIONS ====================

let hostSettings = { totalPlayers: 4, undercoverCount: 1, mrwhiteCount: 0 };

function initHostSetupListeners() {
  $('#host-decrease-players').addEventListener('click', () => {
    if (hostSettings.totalPlayers > 3) {
      hostSettings.totalPlayers--;
      updateHostSettingsUI();
    }
  });
  $('#host-increase-players').addEventListener('click', () => {
    if (hostSettings.totalPlayers < 12) {
      hostSettings.totalPlayers++;
      updateHostSettingsUI();
    }
  });
  $('#host-decrease-undercover').addEventListener('click', () => {
    if (hostSettings.undercoverCount > 1) {
      hostSettings.undercoverCount--;
      updateHostSettingsUI();
    }
  });
  $('#host-increase-undercover').addEventListener('click', () => {
    const max = Math.floor(hostSettings.totalPlayers / 2) - 1 - hostSettings.mrwhiteCount;
    if (hostSettings.undercoverCount < max) {
      hostSettings.undercoverCount++;
      updateHostSettingsUI();
    }
  });
  $('#host-decrease-mrwhite').addEventListener('click', () => {
    if (hostSettings.mrwhiteCount > 0) {
      hostSettings.mrwhiteCount--;
      updateHostSettingsUI();
    }
  });
  $('#host-increase-mrwhite').addEventListener('click', () => {
    const max = Math.floor(hostSettings.totalPlayers / 2) - 1 - hostSettings.undercoverCount;
    if (hostSettings.mrwhiteCount < max) {
      hostSettings.mrwhiteCount++;
      updateHostSettingsUI();
    }
  });
}

function updateHostSettingsUI() {
  $('#host-player-count').textContent = hostSettings.totalPlayers;
  $('#host-undercover-count').textContent = hostSettings.undercoverCount;
  $('#host-mrwhite-count').textContent = hostSettings.mrwhiteCount;
}

function createRoom() {
  const hostName = $('#host-name-input').value.trim();
  if (!hostName) {
    alert('Please enter your name');
    $('#host-name-input').focus();
    return;
  }
  
  showLoading('Creating room...');
  initSocket();
  
  state.socket.emit('create-room', {
    hostName,
    settings: hostSettings
  }, (response) => {
    hideLoading();
    if (response.success) {
      state.isHost = true;
      state.myName = hostName;
      state.roomCode = response.roomCode;
      state.onlinePlayers = response.room.players;
      showHostLobby();
    } else {
      alert('Failed to create room');
    }
  });
}

function showHostLobby() {
  $('#display-room-code').textContent = state.roomCode;
  $('#lobby-undercover-count').textContent = hostSettings.undercoverCount;
  $('#lobby-mrwhite-count').textContent = hostSettings.mrwhiteCount;
  updateHostLobbyUI();
  showScreen('host-lobby');
}

function updateHostLobbyUI() {
  const list = $('#lobby-players-list');
  list.innerHTML = '';
  
  state.onlinePlayers.forEach(player => {
    const item = document.createElement('div');
    item.className = 'lobby-player-item';
    item.innerHTML = `
      <div class="lobby-player-avatar">${player.name.charAt(0).toUpperCase()}</div>
      <span class="lobby-player-name">${escapeHtml(player.name)}</span>
      ${player.isHost ? '<span class="host-badge">Host</span>' : ''}
    `;
    list.appendChild(item);
  });
  
  $('#lobby-player-count').textContent = `${state.onlinePlayers.length}/${hostSettings.totalPlayers}`;
  
  const startBtn = $('#start-online-game-btn');
  if (state.onlinePlayers.length >= 3 && state.onlinePlayers.length === hostSettings.totalPlayers) {
    startBtn.disabled = false;
    startBtn.textContent = '🎮 Start Game';
  } else if (state.onlinePlayers.length >= 3) {
    startBtn.disabled = false;
    startBtn.textContent = `🎮 Start with ${state.onlinePlayers.length} players`;
  } else {
    startBtn.disabled = true;
    startBtn.textContent = `Waiting for players... (${state.onlinePlayers.length}/3 min)`;
  }
}

function joinRoom() {
  const roomCode = $('#room-code-input').value.trim().toUpperCase();
  const playerName = $('#join-player-name-input').value.trim();
  
  if (!roomCode || roomCode.length !== 4) {
    showJoinError('Please enter a 4-character room code');
    return;
  }
  
  if (!playerName) {
    showJoinError('Please enter your name');
    return;
  }
  
  showLoading('Joining room...');
  initSocket();
  
  state.socket.emit('join-room', { roomCode, playerName }, (response) => {
    hideLoading();
    if (response.success) {
      state.isHost = false;
      state.myName = playerName;
      state.roomCode = roomCode;
      state.onlinePlayers = response.room.players;
      hostSettings = response.room.settings;
      showPlayerLobby();
    } else {
      showJoinError(response.error || 'Failed to join room');
    }
  });
}

function showJoinError(message) {
  const errorEl = $('#join-error');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function showPlayerLobby() {
  $('#player-room-code').textContent = state.roomCode;
  updatePlayerLobbyUI();
  showScreen('player-lobby');
}

function updatePlayerLobbyUI() {
  const list = $('#player-lobby-list');
  list.innerHTML = '';
  
  state.onlinePlayers.forEach(player => {
    const item = document.createElement('div');
    item.className = 'lobby-player-item';
    item.innerHTML = `
      <div class="lobby-player-avatar">${player.name.charAt(0).toUpperCase()}</div>
      <span class="lobby-player-name">${escapeHtml(player.name)}</span>
      ${player.isHost ? '<span class="host-badge">Host</span>' : ''}
    `;
    list.appendChild(item);
  });
  
  $('#player-lobby-count').textContent = `${state.onlinePlayers.length}/${hostSettings.totalPlayers}`;
}

function leaveRoom() {
  if (state.socket) {
    state.socket.disconnect();
  }
  resetOnlineState();
  showScreen('landing');
}

function closeRoom() {
  if (confirm('Close this room? All players will be disconnected.')) {
    if (state.socket) {
      state.socket.disconnect();
    }
    resetOnlineState();
    showScreen('landing');
  }
}

function startOnlineGame() {
  if (!state.isHost) return;
  
  showLoading('Starting game...');
  state.socket.emit('start-game', (response) => {
    hideLoading();
    if (response.success) {
      showScreen('host-game');
    } else {
      alert(response.error || 'Failed to start game');
    }
  });
}

function showOnlineWord() {
  $('#online-word-hidden').classList.add('hidden');
  
  if (state.myRole === 'mrwhite') {
    $('#online-mrwhite-state').classList.remove('hidden');
  } else {
    $('#online-word-display').textContent = state.myWord;
    $('#online-word-shown').classList.remove('hidden');
  }
}

function hideOnlineWord() {
  $('#online-word-shown').classList.add('hidden');
  $('#online-mrwhite-state').classList.add('hidden');
  $('#online-word-confirmed').classList.remove('hidden');
  
  state.socket.emit('word-seen');
}

function renderHostSpeakingOrder(order) {
  const list = $('#host-speaking-order');
  list.innerHTML = '';
  
  order.forEach((name, index) => {
    const item = document.createElement('div');
    item.className = 'speaking-order-item';
    item.innerHTML = `
      <span class="speaking-order-number">${index + 1}</span>
      <span class="speaking-order-name">${escapeHtml(name)}</span>
    `;
    list.appendChild(item);
  });
}

function resetOnlineState() {
  state.socket = null;
  state.roomCode = null;
  state.isHost = false;
  state.myName = null;
  state.myWord = null;
  state.myRole = null;
  state.onlinePlayers = [];
}

// ==================== OFFLINE MODE FUNCTIONS ====================

function startNewSession() {
  state.session = {
    active: true,
    gameRound: 1,
    players: state.playerNames.map(name => ({ name, totalPoints: 0 }))
  };
  saveSession();
}

function resumeGame() {
  const savedSession = getSavedSession();
  if (!savedSession) return;
  
  state.session = savedSession;
  state.playerNames = savedSession.players.map(p => p.name);
  state.totalPlayers = state.playerNames.length;
  state.undercoverCount = 1;
  state.mrwhiteCount = 0;
  
  updatePlayerCountUI();
  showScreen('role-config');
  updateRoleConfigUI();
}

function discardSession() {
  if (!confirm('Discard this session? All progress will be lost.')) return;
  clearSavedSession();
  state.session = { active: false, gameRound: 0, players: [] };
  checkForSavedSession();
}

async function playNextRound() {
  state.session.gameRound++;
  saveSession();
  
  state.players = [];
  state.currentRevealIndex = 0;
  state.discussionRound = 1;
  state.speakingOrder = [];
  state.eliminatedThisRound = null;
  state.mrWhiteGuessedCorrectly = false;
  
  showScreen('role-config');
  updateRoleConfigUI();
}

function endSession() {
  closeOfflineRoom();
  
  const winner = determineWinner();
  state.players.forEach(player => {
    const won = (winner === 'civilian' && player.role === 'civilian') ||
                (winner === 'undercover' && (player.role === 'undercover' || player.role === 'mrwhite') && !player.eliminated) ||
                (winner === 'mrwhite-guess' && player.role === 'mrwhite' && state.mrWhiteGuessedCorrectly);
    updatePlayerStats(player.name, player.role, won, player.roundPoints || 0);
  });
  
  clearSavedSession();
  state.session = { active: false, gameRound: 0, players: [] };
  resetGame();
}

function determineWinner() {
  if (state.mrWhiteGuessedCorrectly) return 'mrwhite-guess';
  const activePlayers = state.players.filter(p => !p.eliminated);
  const activeInfiltrators = activePlayers.filter(p => p.role === 'undercover' || p.role === 'mrwhite');
  const activeCivilians = activePlayers.filter(p => p.role === 'civilian');
  if (activeInfiltrators.length === 0) return 'civilian';
  if (activeInfiltrators.length >= activeCivilians.length) return 'undercover';
  return null;
}

// Saved groups
function renderSavedGroups() {
  const groups = getSavedGroups();
  const list = $('#saved-groups-list');
  const noGroupsMsg = $('#no-groups-message');
  
  list.innerHTML = '';
  
  if (groups.length === 0) {
    noGroupsMsg.classList.remove('hidden');
    return;
  }
  
  noGroupsMsg.classList.add('hidden');
  
  groups.forEach((group, index) => {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.innerHTML = `
      <div class="group-info">
        <div class="group-name">${escapeHtml(group.name)}</div>
        <div class="group-players">${group.players.length} players: ${group.players.slice(0, 3).join(', ')}${group.players.length > 3 ? '...' : ''}</div>
      </div>
      <div class="group-actions">
        <button class="group-action-btn delete" data-index="${index}">🗑️</button>
      </div>
    `;
    card.querySelector('.group-info').addEventListener('click', () => selectGroup(group));
    card.querySelector('.delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteGroup(index);
    });
    list.appendChild(card);
  });
}

function selectGroup(group) {
  state.totalPlayers = group.players.length;
  state.playerNames = [...group.players];
  state.undercoverCount = 1;
  state.mrwhiteCount = 0;
  updatePlayerCountUI();
  showScreen('role-config');
  updateRoleConfigUI();
}

function deleteGroup(index) {
  if (!confirm('Delete this group?')) return;
  const groups = getSavedGroups();
  groups.splice(index, 1);
  saveGroups(groups);
  renderSavedGroups();
}

function saveCurrentGroup() {
  const nameInput = $('#group-name-input');
  const groupName = nameInput.value.trim();
  if (!groupName) { nameInput.focus(); return; }
  
  const groups = getSavedGroups();
  if (groups.some(g => g.name.toLowerCase() === groupName.toLowerCase())) {
    alert('A group with this name already exists!');
    return;
  }
  
  groups.push({ name: groupName, players: [...state.playerNames], createdAt: Date.now() });
  saveGroups(groups);
  $('#save-group-modal').classList.add('hidden');
  nameInput.value = '';
  
  const saveBtn = $('#save-group-btn');
  saveBtn.textContent = '✓ Saved!';
  saveBtn.disabled = true;
  setTimeout(() => { saveBtn.textContent = '💾 Save as Group'; saveBtn.disabled = false; }, 2000);
}

// Player count
function changePlayerCount(delta) {
  const newCount = state.totalPlayers + delta;
  if (newCount >= 3 && newCount <= 12) {
    state.totalPlayers = newCount;
    updatePlayerCountUI();
    const maxInfiltrators = Math.floor(state.totalPlayers / 2) - 1;
    if (state.undercoverCount > maxInfiltrators) state.undercoverCount = Math.max(1, maxInfiltrators);
    if (state.undercoverCount + state.mrwhiteCount > maxInfiltrators) state.mrwhiteCount = Math.max(0, maxInfiltrators - state.undercoverCount);
  }
}

function updatePlayerCountUI() {
  $('#player-count-value').textContent = state.totalPlayers;
  $('#decrease-players').disabled = state.totalPlayers <= 3;
  $('#increase-players').disabled = state.totalPlayers >= 12;
}

// Role config
function handleRoleStepper(e) {
  const action = e.target.dataset.action;
  const target = e.target.dataset.target;
  const minCivilians = 2;
  const currentTotal = state.undercoverCount + state.mrwhiteCount;
  const maxInfiltrators = state.totalPlayers - minCivilians;
  
  if (target === 'undercover') {
    if (action === 'increase' && currentTotal < maxInfiltrators) state.undercoverCount++;
    else if (action === 'decrease' && state.undercoverCount > 1) state.undercoverCount--;
  } else if (target === 'mrwhite') {
    if (action === 'increase' && currentTotal < maxInfiltrators) state.mrwhiteCount++;
    else if (action === 'decrease' && state.mrwhiteCount > 0) state.mrwhiteCount--;
  }
  updateRoleConfigUI();
}

function updateRoleConfigUI() {
  const civilians = state.totalPlayers - state.undercoverCount - state.mrwhiteCount;
  const minCivilians = 2;
  const currentTotal = state.undercoverCount + state.mrwhiteCount;
  const maxInfiltrators = state.totalPlayers - minCivilians;
  
  $('#total-players-display').textContent = state.totalPlayers;
  $('#undercover-count').textContent = state.undercoverCount;
  $('#mrwhite-count').textContent = state.mrwhiteCount;
  $('#civilian-count').textContent = civilians;
  $('#undercover-bar-count').textContent = state.undercoverCount;
  $('#mrwhite-bar-count').textContent = state.mrwhiteCount;
  
  $('#civilian-bar').style.width = `${(civilians / state.totalPlayers) * 100}%`;
  $('#undercover-bar').style.width = `${(state.undercoverCount / state.totalPlayers) * 100}%`;
  $('#mrwhite-bar').style.width = `${(state.mrwhiteCount / state.totalPlayers) * 100}%`;
  
  const ucDec = $$('[data-target="undercover"][data-action="decrease"]')[0];
  const ucInc = $$('[data-target="undercover"][data-action="increase"]')[0];
  const mwDec = $$('[data-target="mrwhite"][data-action="decrease"]')[0];
  const mwInc = $$('[data-target="mrwhite"][data-action="increase"]')[0];
  
  if (ucDec) ucDec.disabled = state.undercoverCount <= 1;
  if (ucInc) ucInc.disabled = currentTotal >= maxInfiltrators;
  if (mwDec) mwDec.disabled = state.mrwhiteCount <= 0;
  if (mwInc) mwInc.disabled = currentTotal >= maxInfiltrators;
  
  const warning = $('#role-warning');
  if (civilians < minCivilians) {
    warning.classList.remove('hidden');
    $('#continue-to-names-btn').disabled = true;
  } else {
    warning.classList.add('hidden');
    $('#continue-to-names-btn').disabled = false;
  }
}

// Name entry
function startNameEntry() {
  if (state.session.active && state.session.players.length === state.totalPlayers) {
    state.playerNames = state.session.players.map(p => p.name);
    prepareGame();
    return;
  }
  if (state.playerNames.length !== state.totalPlayers) state.playerNames = [];
  renderRecentNames();
  updateNameEntryUI();
  showScreen('name-entry');
  $('#player-name-input').focus();
}

function renderRecentNames() {
  const recentNames = getRecentNames();
  const section = $('#recent-names-section');
  const list = $('#recent-names-list');
  const available = recentNames.filter(n => !state.playerNames.some(p => p.toLowerCase() === n.toLowerCase()));
  
  if (available.length === 0) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  list.innerHTML = '';
  available.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'recent-name-btn';
    btn.textContent = name;
    btn.addEventListener('click', () => quickAddName(name));
    list.appendChild(btn);
  });
}

function quickAddName(name) {
  if (state.playerNames.length >= state.totalPlayers) return;
  if (state.playerNames.some(n => n.toLowerCase() === name.toLowerCase())) return;
  state.playerNames.push(name);
  updateNameEntryUI();
  renderRecentNames();
  if (state.playerNames.length >= state.totalPlayers) prepareGame();
}

function addPlayerName() {
  const input = $('#player-name-input');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  if (state.playerNames.some(n => n.toLowerCase() === name.toLowerCase())) {
    alert('This name is already added!');
    input.select();
    return;
  }
  state.playerNames.push(name);
  input.value = '';
  input.focus();
  updateNameEntryUI();
  renderRecentNames();
  if (state.playerNames.length >= state.totalPlayers) prepareGame();
}

function updateNameEntryUI() {
  const current = state.playerNames.length + 1;
  const total = state.totalPlayers;
  $('#name-entry-progress').textContent = `Player ${Math.min(current, total)} of ${total}`;
  $('#current-player-number').textContent = Math.min(current, total);
  $('#add-name-btn-text').textContent = current >= total ? 'Start Game' : 'Next Player';
  
  const list = $('#names-list');
  list.innerHTML = '';
  state.playerNames.forEach((name, i) => {
    const tag = document.createElement('div');
    tag.className = 'name-tag';
    tag.innerHTML = `<span class="name-tag-number">${i + 1}</span><span>${escapeHtml(name)}</span>`;
    list.appendChild(tag);
  });
}

// Game preparation
async function prepareGame() {
  showLoading('Setting up game...');
  try {
    addToRecentNames(state.playerNames);
    const isFirstRound = !state.session.active;
    if (isFirstRound) startNewSession();
    
    // Get word pair (uses prefetched if available, skips played pairs)
    const wordData = await getWordPairForRound();
    state.words.civilian = wordData.civilianWord;
    state.words.undercover = wordData.undercoverWord;
    
    // Mark this pair as played
    addPlayedPair(wordData.civilianWord, wordData.undercoverWord);
    
    assignRoles();
    state.discussionRound = 1;
    state.currentRevealIndex = 0;
    state.eliminatedThisRound = null;
    state.mrWhiteGuessedCorrectly = false;
    
    // Check if we already have tokens (from previous round)
    const hasExistingTokens = Object.keys(state.playerTokens).length > 0 && state.offlineRoomCode;
    
    if (hasExistingTokens) {
      // Update existing tokens with new words
      console.log('Updating existing tokens for new round...');
      await updateRoundTokens();
    } else {
      // First round - create new room with QR codes
      console.log('Creating new offline room with QR codes...');
      const roomCreated = await createOfflineRoom();
      if (!roomCreated) {
        console.warn('Failed to create offline room, continuing without QR codes');
      }
    }
    
    showReadyScreen();
  } catch (error) {
    console.error('Error:', error);
    alert('Failed to generate words.');
    showScreen('name-entry');
  } finally {
    hideLoading();
  }
}

function assignRoles() {
  const shuffled = [...state.playerNames].sort(() => Math.random() - 0.5);
  state.players = [];
  let index = 0;
  for (let i = 0; i < state.undercoverCount; i++) {
    state.players.push({ name: shuffled[index++], role: 'undercover', word: state.words.undercover, eliminated: false, roundPoints: 0 });
  }
  for (let i = 0; i < state.mrwhiteCount; i++) {
    state.players.push({ name: shuffled[index++], role: 'mrwhite', word: null, eliminated: false, roundPoints: 0 });
  }
  while (index < shuffled.length) {
    state.players.push({ name: shuffled[index++], role: 'civilian', word: state.words.civilian, eliminated: false, roundPoints: 0 });
  }
  state.players.sort(() => Math.random() - 0.5);
}

function showReadyScreen() {
  const list = $('#ready-players-list');
  list.innerHTML = '';
  state.players.forEach(player => {
    const sessionPlayer = state.session.players.find(p => p.name === player.name);
    const totalPoints = sessionPlayer ? sessionPlayer.totalPoints : 0;
    const tag = document.createElement('span');
    tag.className = 'ready-player-tag';
    tag.innerHTML = `${escapeHtml(player.name)}${totalPoints > 0 ? ` <small>(${totalPoints}pts)</small>` : ''}`;
    list.appendChild(tag);
  });
  $('#game-round-info').textContent = `Game Round ${state.session.gameRound}`;
  $('#save-group-btn').textContent = '💾 Save as Group';
  $('#save-group-btn').disabled = false;
  showScreen('ready');
}

// Word reveal
function startWordReveal() {
  state.currentRevealIndex = 0;
  showScreen('reveal');
  updateRevealUI();
}

function updateRevealUI() {
  const player = state.players[state.currentRevealIndex];
  $('#reveal-player-name').textContent = player.name;
  $('#reveal-player-name-btn').textContent = player.name;
  
  // Show QR code for this player
  const qrCode = state.playerQRCodes[player.name];
  if (qrCode) {
    $('#player-qr-code').src = qrCode;
    $('#qr-option-section').style.display = 'block';
  } else {
    $('#qr-option-section').style.display = 'none';
  }
  
  const progress = (state.currentRevealIndex / state.players.length) * 100;
  $('#reveal-progress-fill').style.width = `${progress}%`;
  $('#reveal-progress-text').textContent = `Player ${state.currentRevealIndex + 1} of ${state.players.length}`;
  
  $('#reveal-pass').classList.remove('hidden');
  $('#reveal-word').classList.add('hidden');
  $('#reveal-mrwhite').classList.add('hidden');
}

function showPlayerWord() {
  const player = state.players[state.currentRevealIndex];
  $('#reveal-pass').classList.add('hidden');
  playAudio('showWord', 0.5);
  if (player.role === 'mrwhite') {
    $('#reveal-mrwhite').classList.remove('hidden');
  } else {
    $('#word-display').textContent = player.word;
    $('#word-display').className = 'word-display';
    $('#reveal-word').classList.remove('hidden');
  }
}

function hideWordAndContinue() {
  playAudio('seenWord', 0.5);
  moveToNextPlayer();
}

function moveToNextPlayer() {
  state.currentRevealIndex++;
  if (state.currentRevealIndex >= state.players.length) {
    showScreen('discussion');
    updateDiscussionUI();
  } else {
    updateRevealUI();
  }
}

// Discussion
function updateDiscussionUI() {
  $('#round-badge').textContent = `Round ${state.discussionRound}`;
  const activePlayers = state.players.filter(p => !p.eliminated);
  state.speakingOrder = [...activePlayers].sort(() => Math.random() - 0.5);
  const list = $('#speaking-order-list');
  list.innerHTML = '';
  state.speakingOrder.forEach((player, index) => {
    const item = document.createElement('div');
    item.className = 'speaking-order-item';
    item.innerHTML = `<span class="speaking-order-number">${index + 1}</span><span class="speaking-order-name">${escapeHtml(player.name)}</span>`;
    list.appendChild(item);
  });
}

// Elimination
function startElimination() {
  showScreen('elimination');
  updateEliminationUI();
}

function updateEliminationUI() {
  $('#elim-round').textContent = state.discussionRound;
  const activePlayers = state.players.filter(p => !p.eliminated);
  const options = $('#elimination-options');
  options.innerHTML = '';
  activePlayers.forEach(player => {
    const option = document.createElement('div');
    option.className = 'elimination-option';
    option.innerHTML = `<div class="elimination-option-avatar">${player.name.charAt(0).toUpperCase()}</div><span class="elimination-option-name">${escapeHtml(player.name)}</span>`;
    option.addEventListener('click', () => eliminatePlayer(player.name));
    options.appendChild(option);
  });
}

function eliminatePlayer(playerName) {
  state.eliminatedThisRound = playerName;
  const player = state.players.find(p => p.name === playerName);
  player.eliminated = true;
  showRoleReveal();
}

function showRoleReveal() {
  const player = state.players.find(p => p.name === state.eliminatedThisRound);
  $('#revealed-player-name').textContent = player.name;
  const roleEl = $('#revealed-role');
  const emojiEl = $('#revealed-role-emoji');
  const nameEl = $('#revealed-role-name');
  roleEl.className = 'revealed-role ' + player.role;
  if (player.role === 'civilian') { emojiEl.textContent = '👤'; nameEl.textContent = 'Civilian'; }
  else if (player.role === 'undercover') { emojiEl.textContent = '🕵️'; nameEl.textContent = 'Undercover'; }
  else { emojiEl.textContent = '👻'; nameEl.textContent = 'Mr. White'; }
  
  // Play elimination sound
  playEliminationAudio(player.role);
  
  const guessSection = $('#mrwhite-guess-section');
  const continueBtn = $('#continue-game-btn');
  if (player.role === 'mrwhite') {
    guessSection.classList.remove('hidden');
    continueBtn.classList.add('hidden');
    $('#mrwhite-guess-input').value = '';
    $('#mrwhite-guess-input').focus();
  } else {
    guessSection.classList.add('hidden');
    continueBtn.classList.remove('hidden');
  }
  showScreen('role-reveal');
}

function handleMrWhiteGuess() {
  const guess = $('#mrwhite-guess-input').value.trim().toLowerCase();
  const civilianWord = state.words.civilian.toLowerCase();
  if (!guess) { $('#mrwhite-guess-input').focus(); return; }
  if (guess === civilianWord) {
    state.mrWhiteGuessedCorrectly = true;
    playMrWhiteGuessAudio(true);
    const mrWhite = state.players.find(p => p.name === state.eliminatedThisRound);
    mrWhite.roundPoints = POINTS.MRWHITE_GUESS;
    addPointsToSession();
    endGame('mrwhite-guess');
  } else {
    playMrWhiteGuessAudio(false);
    alert(`Wrong! The word was "${state.words.civilian}"`);
    $('#mrwhite-guess-section').classList.add('hidden');
    $('#continue-game-btn').classList.remove('hidden');
  }
}

function continueAfterElimination() {
  const activePlayers = state.players.filter(p => !p.eliminated);
  const activeUndercover = activePlayers.filter(p => p.role === 'undercover');
  const activeMrWhite = activePlayers.filter(p => p.role === 'mrwhite');
  const activeCivilians = activePlayers.filter(p => p.role === 'civilian');
  
  if (activeUndercover.length + activeMrWhite.length >= activeCivilians.length) {
    calculatePoints('undercover');
    addPointsToSession();
    endGame('undercover');
    return;
  }
  if (activeUndercover.length === 0 && activeMrWhite.length === 0) {
    calculatePoints('civilian');
    addPointsToSession();
    endGame('civilian');
    return;
  }
  state.discussionRound++;
  showScreen('discussion');
  updateDiscussionUI();
}

// Points
function calculatePoints(winner) {
  if (winner === 'civilian') {
    state.players.filter(p => p.role === 'civilian').forEach(p => p.roundPoints = POINTS.CIVILIAN_WIN);
  } else if (winner === 'undercover') {
    state.players.filter(p => p.role === 'undercover' && !p.eliminated).forEach(p => p.roundPoints = POINTS.UNDERCOVER_WIN);
    state.players.filter(p => p.role === 'mrwhite' && !p.eliminated).forEach(p => p.roundPoints = POINTS.MRWHITE_WIN);
  }
}

function addPointsToSession() {
  state.players.forEach(player => {
    const sessionPlayer = state.session.players.find(p => p.name === player.name);
    if (sessionPlayer) sessionPlayer.totalPoints += player.roundPoints;
  });
  saveSession();
}

// Play win/elimination audio
function playWinAudio(winner) {
  if (winner === 'civilian') {
    playAudio('civiliansWin', 0.7);
  } else if (winner === 'undercover' || winner === 'mrwhite') {
    playAudio('infiltratorsWin', 0.7);
  }
}

function playEliminationAudio(role) {
  if (role === 'civilian') {
    playAudio('civilianDie', 0.7);
  } else if (role === 'undercover') {
    playAudio('undercoverDie', 0.7);
  }
}

function playMrWhiteGuessAudio(correct) {
  if (correct) {
    playAudio('mrwhiteGuessedCorrect', 0.7);
  } else {
    playAudio('mrwhiteGuessedWrong', 0.7);
  }
}

// Game over
function endGame(winner) {
  const emojiEl = $('#winner-emoji');
  const titleEl = $('#winner-title');
  const subtitleEl = $('#winner-subtitle');
  
  // Play victory audio
  playWinAudio(winner);
  
  if (winner === 'civilian') {
    emojiEl.textContent = '🎉'; titleEl.textContent = 'Civilians Win!'; titleEl.className = 'civilian';
    subtitleEl.textContent = 'All infiltrators have been found!';
  } else if (winner === 'undercover') {
    emojiEl.textContent = '🕵️'; titleEl.textContent = 'Infiltrators Win!'; titleEl.className = 'undercover';
    subtitleEl.textContent = 'The infiltrators have taken over!';
  } else {
    emojiEl.textContent = '👻'; titleEl.textContent = 'Mr. White Wins!'; titleEl.className = 'mrwhite';
    subtitleEl.textContent = 'Guessed the civilian word correctly!';
  }
  
  $('#final-civilian-word').textContent = state.words.civilian;
  $('#final-undercover-word').textContent = state.words.undercover;
  renderSessionScoreboard();
  showScreen('gameover');
}

function renderSessionScoreboard() {
  const pointsList = $('#points-list');
  pointsList.innerHTML = '';
  const sortedPlayers = [...state.session.players].sort((a, b) => b.totalPoints - a.totalPoints);
  
  sortedPlayers.forEach((sessionPlayer, index) => {
    const gamePlayer = state.players.find(p => p.name === sessionPlayer.name);
    const roundPoints = gamePlayer ? gamePlayer.roundPoints : 0;
    let icon = '👤', roleLabel = 'Civilian';
    if (gamePlayer) {
      if (gamePlayer.role === 'undercover') { icon = '🕵️'; roleLabel = 'Undercover'; }
      else if (gamePlayer.role === 'mrwhite') { icon = '👻'; roleLabel = 'Mr. White'; }
    }
    const item = document.createElement('div');
    item.className = 'points-item' + (index === 0 ? ' leader' : '');
    item.innerHTML = `
      <div class="points-player">
        <span class="points-rank">${index + 1}</span>
        <span class="points-player-icon">${icon}</span>
        <span class="points-player-name">${escapeHtml(sessionPlayer.name)}</span>
      </div>
      <div class="points-values">
        ${roundPoints > 0 ? `<span class="points-round">+${roundPoints}</span>` : ''}
        <span class="points-total">${sessionPlayer.totalPoints}</span>
      </div>
    `;
    pointsList.appendChild(item);
  });
  $('#session-round-display').textContent = `Game Round ${state.session.gameRound} Complete`;
}

// Reset
function resetGame() {
  closeOfflineRoom();
  
  state.totalPlayers = 4;
  state.undercoverCount = 1;
  state.mrwhiteCount = 0;
  state.playerNames = [];
  state.players = [];
  state.words = { civilian: '', undercover: '' };
  state.currentRevealIndex = 0;
  state.discussionRound = 1;
  state.speakingOrder = [];
  state.eliminatedThisRound = null;
  state.mrWhiteGuessedCorrectly = false;
  state.offlineRoomCode = null;
  state.playerQRCodes = {};
  state.playerTokens = {};
  
  updatePlayerCountUI();
  checkForSavedSession();
  showScreen('landing');
}

// ==================== SCORECARD ====================
function showScorecard() {
  const scoreList = $('#scorecard-list');
  scoreList.innerHTML = '';
  
  $('#scorecard-round').textContent = `Game Round ${state.session.gameRound || 1}`;
  
  // Sort by total points
  const sortedPlayers = [...state.session.players].sort((a, b) => b.totalPoints - a.totalPoints);
  
  sortedPlayers.forEach((player, index) => {
    const gamePlayer = state.players.find(p => p.name === player.name);
    const isEliminated = gamePlayer ? gamePlayer.eliminated : false;
    
    const item = document.createElement('div');
    item.className = 'scorecard-item' + (index === 0 ? ' leader' : '') + (isEliminated ? ' eliminated' : '');
    item.innerHTML = `
      <span class="scorecard-rank">${index + 1}</span>
      <span class="scorecard-name">
        ${escapeHtml(player.name)}
        ${isEliminated ? '<span class="eliminated-badge">☠️</span>' : ''}
      </span>
      <span class="scorecard-points">${player.totalPoints} pts</span>
    `;
    scoreList.appendChild(item);
  });
  
  $('#scorecard-modal').classList.remove('hidden');
}

function hideScorecard() {
  $('#scorecard-modal').classList.add('hidden');
}

// ==================== AMNESIC MODE ====================
let amnesicAudio = null;

function showAmnesicMode() {
  const playerList = $('#amnesic-players');
  playerList.innerHTML = '';
  
  // Hide word display initially
  $('#amnesic-word-display').classList.add('hidden');
  
  // Show all players (including eliminated for reference)
  state.players.forEach(player => {
    const btn = document.createElement('button');
    btn.className = 'amnesic-player-btn' + (player.eliminated ? ' eliminated' : '');
    btn.innerHTML = `
      <span class="amnesic-player-avatar">${player.name.charAt(0).toUpperCase()}</span>
      <span class="amnesic-player-name">${escapeHtml(player.name)}</span>
      ${player.eliminated ? '<span>☠️</span>' : ''}
    `;
    
    if (!player.eliminated) {
      btn.addEventListener('click', () => showAmnesicWord(player));
    }
    
    playerList.appendChild(btn);
  });
  
  // Play amnesic mode music
  amnesicAudio = playAudio('amnesicMode', 0.3, true);
  
  $('#amnesic-modal').classList.remove('hidden');
}

function showAmnesicWord(player) {
  const wordDisplay = $('#amnesic-word-display');
  const wordEl = $('#amnesic-word');
  
  if (player.role === 'mrwhite') {
    wordEl.textContent = "You're Mr. White - No word!";
    wordEl.className = 'amnesic-word mrwhite';
  } else {
    wordEl.textContent = player.word;
    wordEl.className = 'amnesic-word';
  }
  
  wordDisplay.classList.remove('hidden');
}

function hideAmnesicWord() {
  $('#amnesic-word-display').classList.add('hidden');
}

function hideAmnesicMode() {
  // Stop the music
  if (amnesicAudio) {
    stopAudio(amnesicAudio);
    amnesicAudio = null;
  }
  
  $('#amnesic-modal').classList.add('hidden');
  hideAmnesicWord();
}

// Utility
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
