const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const oldTryMatch = `  const tryMatch = () => { try {
    // 1. Fill open lobbies first`;

const properTryMatch = `  const tryMatch = () => { try {
    // 1. Fill open lobbies first`;

// Wait, let's just replace the whole tryMatch block securely.
const startIndex = content.indexOf('const tryMatch = () => {');
const endIndex = content.indexOf('socket.on(\'join_queue\', (data) => {');

if (startIndex !== -1 && endIndex !== -1) {
  const replacement = `const tryMatch = () => {
    try {
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
    } catch (e) {
      console.error("Matchmaking Error: ", e);
    }
  };

  `;
  
  content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
  fs.writeFileSync('server.js', content);
  console.log('tryMatch safely patched.');
}
