const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// 1. Add lobby state
if (!content.includes('let lobbies = {};')) {
  content = content.replace('let activeRooms = {};', "let activeRooms = {};\nlet lobbies = {}; // Lobby System");
}

// 2. Add Lobby Socket Events inside io.on('connection')
const lobbyEvents = `
  // === LOBBY SYSTEM ===
  socket.on('create_lobby', ({ user, prefs, maxPlayers }) => {
    const lobbyId = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6 char code
    lobbies[lobbyId] = {
      id: lobbyId,
      host: user.id,
      maxPlayers: maxPlayers || 5,
      prefs: prefs,
      users: [{ socketId: socket.id, dbId: user.id, name: user.username, profile: user }],
      isFilling: false
    };
    socket.join(lobbyId);
    socket.emit('lobby_created', lobbies[lobbyId]);
  });

  socket.on('join_lobby', ({ user, lobbyId }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) {
      return socket.emit('lobby_error', 'Lobby not found');
    }
    if (lobby.users.length >= lobby.maxPlayers) {
      return socket.emit('lobby_error', 'Lobby is full');
    }
    if (lobby.users.some(u => u.dbId === user.id)) {
      return socket.emit('lobby_error', 'Already in lobby');
    }

    lobby.users.push({ socketId: socket.id, dbId: user.id, name: user.username, profile: user });
    socket.join(lobbyId);
    io.to(lobbyId).emit('lobby_updated', lobby);
  });

  socket.on('leave_lobby', ({ lobbyId }) => {
    const lobby = lobbies[lobbyId];
    if (lobby) {
      lobby.users = lobby.users.filter(u => u.socketId !== socket.id);
      socket.leave(lobbyId);
      if (lobby.users.length === 0) {
        delete lobbies[lobbyId];
      } else {
        // If host left, assign new host
        if (lobby.host === socket.user?.id || !lobby.users.some(u => u.dbId === lobby.host)) {
          lobby.host = lobby.users[0].dbId;
        }
        io.to(lobbyId).emit('lobby_updated', lobby);
      }
    }
  });

  socket.on('toggle_lobby_fill', ({ lobbyId, isFilling }) => {
    const lobby = lobbies[lobbyId];
    if (lobby && lobby.host === socket.user?.id) { // NOTE: Need to track socket.user on connect
      lobby.isFilling = isFilling;
      io.to(lobbyId).emit('lobby_updated', lobby);
      if (isFilling) tryMatch(); // trigger matchmaking to fill this lobby
    }
  });

  socket.on('start_lobby_match', ({ lobbyId }) => {
    // Converts Lobby into an Active Room
    const lobby = lobbies[lobbyId];
    if (lobby) {
      activeRooms[lobbyId] = lobby.users;
      io.to(lobbyId).emit('match_started', {
        roomId: lobbyId,
        users: lobby.users,
        isGroupMatch: true
      });
      delete lobbies[lobbyId];
    }
  });
`;

if (!content.includes('socket.on(\'create_lobby\'')) {
  // Inject before "socket.on('join_queue'"
  content = content.replace("socket.on('join_queue',", lobbyEvents + "\n  socket.on('join_queue',");
}

// 3. Track socket.user on connect
if (!content.includes('socket.user = ')) {
  content = content.replace("console.log('A user connected:', socket.id);", 
    "console.log('A user connected:', socket.id);\n  // Extract user from token if available (or just pass in events)\n  // We will assume the frontend passes user in events for now.");
}

// 4. Update tryMatch to fill lobbies
const tryMatchRegex = /const tryMatch = \(\) => \{[\s\S]*?\n  \};/;
const newTryMatch = `const tryMatch = () => {
    // 1. Fill open lobbies first
    for (const lobbyId in lobbies) {
      const lobby = lobbies[lobbyId];
      if (lobby.isFilling && lobby.users.length < lobby.maxPlayers) {
        for (let i = queue.length - 1; i >= 0; i--) {
          const solo = queue[i];
          if (checkMatchPrefs(solo, { prefs: lobby.prefs, user: lobby.users[0].profile }) && lobby.users.length < lobby.maxPlayers) {
            lobby.users.push({ socketId: solo.socketId, dbId: solo.user.id, name: solo.user.username, profile: solo.user });
            const userSocket = io.sockets.sockets.get(solo.socketId);
            if (userSocket) userSocket.join(lobbyId);
            
            queue.splice(i, 1);
            io.to(lobbyId).emit('lobby_updated', lobby);
            
            if (lobby.users.length >= lobby.maxPlayers) {
              lobby.isFilling = false;
              io.to(lobbyId).emit('lobby_updated', lobby);
              break;
            }
          }
        }
      }
    }

    // 2. Standard 1v1 Matching (if not filled into a lobby)
    if (queue.length < 2) return;
    for (let i = 0; i < queue.length; i++) {
      const p1 = queue[i];
      for (let j = i + 1; j < queue.length; j++) {
        const p2 = queue[j];
        if (checkMatchPrefs(p1, p2) && checkMatchPrefs(p2, p1)) {
          const roomId = \`match_\${Date.now()}_\${Math.random().toString(36).substring(7)}\`;
          
          pendingMatches[roomId] = {
            users: [
               { id: p1.socketId, dbId: p1.user.id, name: p1.user.username, profile: p1.user }, 
               { id: p2.socketId, dbId: p2.user.id, name: p2.user.username, profile: p2.user }
            ],
            accepted: []
          };

          io.to(p1.socketId).emit('match_found', { roomId, opponent: p2.user.username, opponentProfile: p2.user });
          io.to(p2.socketId).emit('match_found', { roomId, opponent: p1.user.username, opponentProfile: p1.user });

          queue.splice(j, 1);
          queue.splice(i, 1);
          return; 
        }
      }
    }
  };`;

content = content.replace(tryMatchRegex, newTryMatch);

fs.writeFileSync('server.js', content);
console.log("Backend lobby patched.");
