const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const oldMatchFound = `io.to(p1.socketId).emit('match_found', { roomId, opponent: p2.user.username });
          io.to(p2.socketId).emit('match_found', { roomId, opponent: p1.user.username });`;

const newMatchFound = `io.to(p1.socketId).emit('match_found', { roomId, opponent: p2.user.username, opponentProfile: p2.user });
          io.to(p2.socketId).emit('match_found', { roomId, opponent: p1.user.username, opponentProfile: p1.user });`;

content = content.replace(oldMatchFound, newMatchFound);

fs.writeFileSync('server.js', content);
console.log('Server patched for detailed match_found');
