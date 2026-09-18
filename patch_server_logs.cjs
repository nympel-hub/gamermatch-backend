const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const regex = /socket\.on\('create_lobby', \(\{ user, prefs, maxPlayers \}\) => \{/;
const replacement = `socket.on('create_lobby', ({ user, prefs, maxPlayers }) => {
    try {
      console.log('Received create_lobby from', user.username);
`;

content = content.replace(regex, replacement);

const endRegex = /socket\.emit\('lobby_created', lobbies\[lobbyId\]\);\s*\}\);/g;
const endReplacement = `socket.emit('lobby_created', lobbies[lobbyId]);
      console.log('Emitted lobby_created', lobbyId);
    } catch(err) {
      console.error('ERROR in create_lobby:', err);
    }
  });`;

content = content.replace(endRegex, endReplacement);

fs.writeFileSync('server.js', content);
console.log('Patched server.js create_lobby with try/catch and logs');
