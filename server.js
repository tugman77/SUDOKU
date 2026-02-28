const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── In-memory room store ───
// rooms[code] = { code, mode, difficulty, players: [{id, name, role}], state, spectators: [] }
const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

// ─── Sudoku engine (server-side, authoritative) ───
function genFull() {
  const g = Array.from({ length: 9 }, () => Array(9).fill(0));
  fill(g);
  return g;
}
function fill(g) {
  const ns = shuffle([1,2,3,4,5,6,7,8,9]);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (g[r][c] === 0) {
        for (const n of ns) {
          if (okCell(g, r, c, n)) {
            g[r][c] = n;
            if (fill(g)) return true;
            g[r][c] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}
function okCell(g, r, c, n) {
  for (let i = 0; i < 9; i++) {
    if (g[r][i] === n || g[i][c] === n) return false;
    if (g[3*Math.floor(r/3)+Math.floor(i/3)][3*Math.floor(c/3)+(i%3)] === n) return false;
  }
  return true;
}
function shuffle(a) {
  for (let i = a.length-1; i > 0; i--) {
    const j = 0|Math.random()*(i+1);
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
function makePuzzle(sol, diff) {
  const removals = { easy: 35, medium: 46, hard: 55 }[diff] || 40;
  const p = sol.map(r => [...r]);
  let removed = 0;
  for (const idx of shuffle([...Array(81).keys()])) {
    if (removed >= removals) break;
    const r = 0|idx/9, c = idx%9, bk = p[r][c];
    p[r][c] = 0;
    if (countSol(p.map(x => [...x])) === 1) removed++;
    else p[r][c] = bk;
  }
  return p;
}
function countSol(g, cnt = { n: 0 }) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (g[r][c] === 0) {
        for (let n = 1; n <= 9; n++) {
          if (okCell(g, r, c, n)) { g[r][c]=n; countSol(g, cnt); g[r][c]=0; if (cnt.n > 1) return cnt.n; }
        }
        return cnt.n;
      }
    }
  }
  cnt.n++;
  return cnt.n;
}

// ─── Room helpers ───
function createRoom(mode, difficulty) {
  let code;
  do { code = generateCode(); } while (rooms.has(code));

  const solution = genFull();
  const puzzle = makePuzzle(solution, difficulty);
  const totalEmpty = puzzle.flat().filter(v => v === 0).length;

  const room = {
    code, mode, difficulty,
    solution, puzzle, totalEmpty,
    players: [],   // max 2
    spectators: [],
    gameState: 'waiting', // waiting | countdown | playing | finished
    startTime: null,
    // per-player progress stored server-side
    progress: {},  // socketId -> { filled, score, errors, hints }
    chat: [],      // last 50 messages
    createdAt: Date.now()
  };
  rooms.set(code, room);
  return room;
}

function roomPublicState(room) {
  return {
    code: room.code,
    mode: room.mode,
    difficulty: room.difficulty,
    puzzle: room.puzzle,
    totalEmpty: room.totalEmpty,
    gameState: room.gameState,
    players: room.players.map(p => ({
      id: p.id, name: p.name, role: p.role,
      ...( room.progress[p.id] || { filled: 0, score: 0, errors: 0, hints: 3 })
    })),
    spectatorCount: room.spectators.length
  };
}

// Cleanup stale rooms every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > 2 * 60 * 60 * 1000) rooms.delete(code); // 2h TTL
  }
}, 10 * 60 * 1000);

// ─── Socket.io ───
io.on('connection', (socket) => {
  console.log('connect', socket.id);

  // Create room
  socket.on('create_room', ({ name, mode, difficulty }) => {
    const room = createRoom(mode, difficulty);
    const player = { id: socket.id, name: name || 'Player1', role: 'p1' };
    room.players.push(player);
    room.progress[socket.id] = { filled: 0, score: 0, errors: 0, hints: 3 };
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.name = player.name;
    socket.emit('room_created', { code: room.code, role: 'p1', state: roomPublicState(room) });
  });

  // Join room
  socket.on('join_room', ({ code, name }) => {
    const room = rooms.get(code.toUpperCase());
    if (!room) { socket.emit('error', { msg: '방을 찾을 수 없습니다.' }); return; }
    if (room.gameState === 'finished') { socket.emit('error', { msg: '이미 종료된 게임입니다.' }); return; }

    const isSpectator = room.players.length >= 2;
    if (isSpectator) {
      // Join as spectator
      room.spectators.push({ id: socket.id, name: name || 'Spectator' });
      socket.join(room.code);
      socket.data.roomCode = room.code;
      socket.data.isSpectator = true;
      socket.emit('joined_as_spectator', { state: roomPublicState(room), chat: room.chat });
      io.to(room.code).emit('room_update', roomPublicState(room));
    } else {
      const role = room.players.length === 0 ? 'p1' : 'p2';
      const player = { id: socket.id, name: name || `Player${role === 'p1' ? 1 : 2}`, role };
      room.players.push(player);
      room.progress[socket.id] = { filled: 0, score: 0, errors: 0, hints: 3 };
      socket.join(room.code);
      socket.data.roomCode = room.code;
      socket.data.name = player.name;
      socket.data.role = role;
      socket.emit('room_joined', { role, state: roomPublicState(room), chat: room.chat });
      io.to(room.code).emit('room_update', roomPublicState(room));

      // Auto-start if 2 players (battle/coop both need 2)
      if (room.players.length === 2 && room.gameState === 'waiting') {
        startCountdown(room);
      }
    }
  });

  // Rejoin room (page refresh)
  socket.on('rejoin_room', ({ code, name, role }) => {
    const room = rooms.get(code);
    if (!room) { socket.emit('error', { msg: '방이 만료되었습니다.' }); return; }
    // re-add player
    const existing = room.players.find(p => p.name === name && p.role === role);
    if (existing) {
      existing.id = socket.id;
      if (!room.progress[socket.id]) room.progress[socket.id] = room.progress[existing.id] || { filled:0, score:0, errors:0, hints:3 };
    } else {
      room.players.push({ id: socket.id, name, role });
      room.progress[socket.id] = { filled: 0, score: 0, errors: 0, hints: 3 };
    }
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.emit('room_joined', { role, state: roomPublicState(room), chat: room.chat });
    io.to(room.code).emit('room_update', roomPublicState(room));
  });

  // Player ready (used for coop confirm)
  socket.on('player_ready', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    // if both ready or only 1 player, start
  });

  // Cell input — server validates and broadcasts
  socket.on('cell_input', ({ row, col, value }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.gameState !== 'playing') return;
    const prog = room.progress[socket.id];
    if (!prog) return;

    const correct = (value === room.solution[row][col]);
    const wasEmpty = true; // client only sends non-fixed cells

    if (correct) {
      prog.filled++;
      const elapsed = Date.now() - room.startTime;
      const pts = Math.max(10, 50 - Math.floor(elapsed / 30000) * 5);
      prog.score += pts;
    } else {
      prog.errors++;
      prog.score = Math.max(0, prog.score - 20);
    }

    // Broadcast to everyone in room
    io.to(room.code).emit('cell_update', {
      playerId: socket.id,
      row, col, value,
      correct,
      progress: roomPublicState(room).players
    });

    // Check win
    if (correct && prog.filled === room.totalEmpty) {
      finishGame(room, socket.id);
    }
  });

  // Erase cell
  socket.on('cell_erase', ({ row, col, wasCorrect }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.gameState !== 'playing') return;
    if (wasCorrect) {
      const prog = room.progress[socket.id];
      if (prog) prog.filled = Math.max(0, prog.filled - 1);
    }
    io.to(room.code).emit('cell_erased', {
      playerId: socket.id, row, col,
      progress: roomPublicState(room).players
    });
  });

  // Hint used
  socket.on('use_hint', ({ row, col }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.gameState !== 'playing') return;
    const prog = room.progress[socket.id];
    if (!prog || prog.hints <= 0) { socket.emit('hint_denied'); return; }
    prog.hints--;
    prog.score = Math.max(0, prog.score - 50);
    prog.filled++;
    const value = room.solution[row][col];
    socket.emit('hint_result', { row, col, value, hintsLeft: prog.hints });
    io.to(room.code).emit('cell_update', {
      playerId: socket.id, row, col, value, correct: true, isHint: true,
      progress: roomPublicState(room).players
    });
    if (prog.filled === room.totalEmpty) finishGame(room, socket.id);
  });

  // Chat message
  socket.on('chat_msg', ({ text, emoji }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    const spectator = room.spectators.find(s => s.id === socket.id);
    const name = player?.name || spectator?.name || 'Unknown';
    const role = player?.role || 'spectator';
    const msg = { name, role, text: text?.slice(0, 120) || '', emoji: emoji || '', ts: Date.now() };
    room.chat.push(msg);
    if (room.chat.length > 50) room.chat.shift();
    io.to(room.code).emit('chat_msg', msg);
  });

  // Emoji reaction (quick)
  socket.on('emoji_react', ({ emoji }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    io.to(room.code).emit('emoji_react', { playerId: socket.id, role: player?.role, emoji });
  });

  // Disconnect
  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    // Remove from spectators
    room.spectators = room.spectators.filter(s => s.id !== socket.id);
    // Notify players
    const pIdx = room.players.findIndex(p => p.id === socket.id);
    if (pIdx >= 0) {
      io.to(code).emit('player_disconnected', {
        name: room.players[pIdx].name,
        role: room.players[pIdx].role
      });
      if (room.gameState === 'playing') {
        // pause game for 30s to allow rejoin
        room.gameState = 'paused';
        io.to(code).emit('game_paused', { reason: `${room.players[pIdx].name}이(가) 연결이 끊어졌습니다. 30초 내 재접속 가능.` });
        room._pauseTimer = setTimeout(() => {
          if (room.gameState === 'paused') {
            room.gameState = 'finished';
            io.to(code).emit('game_aborted', { reason: '상대방이 게임을 떠났습니다.' });
          }
        }, 30000);
      }
    }
    io.to(code).emit('room_update', roomPublicState(room));
  });
});

function startCountdown(room) {
  room.gameState = 'countdown';
  io.to(room.code).emit('countdown_start');
  let n = 3;
  const tick = () => {
    io.to(room.code).emit('countdown_tick', { n });
    n--;
    if (n >= 0) setTimeout(tick, 1000);
    else {
      room.gameState = 'playing';
      room.startTime = Date.now();
      io.to(room.code).emit('game_start', { startTime: room.startTime });
    }
  };
  setTimeout(tick, 500);
}

function finishGame(room, winnerId) {
  if (room.gameState === 'finished') return;
  room.gameState = 'finished';
  clearTimeout(room._pauseTimer);
  const winner = room.players.find(p => p.id === winnerId);
  const elapsed = Date.now() - room.startTime;
  io.to(room.code).emit('game_over', {
    winnerId,
    winnerName: winner?.name || '?',
    winnerRole: winner?.role,
    elapsed,
    finalProgress: roomPublicState(room).players,
    solution: room.solution
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎮 Sudoku Battle server running on port ${PORT}`));
