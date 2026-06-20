const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// roomId -> room object
const rooms = new Map();

function generateRoomId() {
  return uuidv4().slice(0, 6).toUpperCase();
}

app.get('/health', (_, res) => res.json({ ok: true }));

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('create-room', ({ timeControl = 600, playerName = 'Player' }) => {
    let roomId = generateRoomId();
    while (rooms.has(roomId)) roomId = generateRoomId();

    const room = {
      id: roomId,
      players: [{ id: socket.id, color: 'white', name: playerName }],
      fen: 'start',
      pgn: '',
      moves: [],
      timers: { white: timeControl * 1000, black: timeControl * 1000 },
      status: 'waiting',
      timeControl: timeControl * 1000,
      lastMoveTime: null,
      activeColor: 'white',
    };
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.emit('room-created', { roomId, color: 'white', timeControl: room.timeControl });
    console.log(`Room created: ${roomId}`);
  });

  socket.on('join-room', ({ roomId, playerName = 'Player' }) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('join-error', { message: 'Room not found' });
    if (room.players.length >= 2) return socket.emit('join-error', { message: 'Room is full' });

    room.players.push({ id: socket.id, color: 'black', name: playerName });
    room.status = 'playing';
    room.lastMoveTime = Date.now();
    socket.join(roomId);

    const gameData = {
      roomId,
      players: room.players,
      fen: room.fen,
      timers: room.timers,
      timeControl: room.timeControl,
    };
    socket.emit('room-joined', { ...gameData, color: 'black' });
    socket.to(roomId).emit('opponent-joined', { ...gameData, color: 'white' });
    console.log(`Room joined: ${roomId}`);
  });

  socket.on('move', ({ roomId, move, fen, timers }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.fen = fen;
    room.timers = timers;
    room.moves.push(move);
    room.lastMoveTime = Date.now();
    room.activeColor = room.activeColor === 'white' ? 'black' : 'white';
    socket.to(roomId).emit('opponent-move', { move, fen, timers });
  });

  socket.on('game-over', ({ roomId, result, reason }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    io.to(roomId).emit('game-ended', { result, reason });
    rooms.delete(roomId);
    console.log(`Game over in room ${roomId}: ${result} by ${reason}`);
  });

  socket.on('resign', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    const winner = player.color === 'white' ? 'black' : 'white';
    io.to(roomId).emit('game-ended', { result: winner, reason: 'resignation' });
    rooms.delete(roomId);
  });

  socket.on('offer-draw', ({ roomId }) => {
    socket.to(roomId).emit('draw-offered');
  });

  socket.on('accept-draw', ({ roomId }) => {
    io.to(roomId).emit('game-ended', { result: 'draw', reason: 'agreement' });
    rooms.delete(roomId);
  });

  socket.on('decline-draw', ({ roomId }) => {
    socket.to(roomId).emit('draw-declined');
  });

  socket.on('chat-message', ({ roomId, message }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    io.to(roomId).emit('chat-message', {
      id: `${Date.now()}-${socket.id}`,
      text: message,
      playerName: player?.name || 'Unknown',
      color: player?.color,
      senderId: socket.id,
      timestamp: Date.now(),
    });
  });

  // WebRTC signaling
  socket.on('rtc-offer', ({ roomId, offer }) => {
    socket.to(roomId).emit('rtc-offer', { offer, fromId: socket.id });
  });

  socket.on('rtc-answer', ({ roomId, answer }) => {
    socket.to(roomId).emit('rtc-answer', { answer, fromId: socket.id });
  });

  socket.on('rtc-ice-candidate', ({ roomId, candidate }) => {
    socket.to(roomId).emit('rtc-ice-candidate', { candidate, fromId: socket.id });
  });

  socket.on('media-state', ({ roomId, audioEnabled, videoEnabled }) => {
    socket.to(roomId).emit('opponent-media-state', { audioEnabled, videoEnabled });
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    for (const [roomId, room] of rooms.entries()) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx === -1) continue;
      const disconnected = room.players[idx];
      if (room.status === 'playing') {
        const winner = disconnected.color === 'white' ? 'black' : 'white';
        socket.to(roomId).emit('game-ended', { result: winner, reason: 'disconnection' });
      }
      rooms.delete(roomId);
      break;
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
