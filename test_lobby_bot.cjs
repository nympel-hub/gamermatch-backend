const io = require('socket.io-client');
const jwt = require('jsonwebtoken');

const token = jwt.sign({ id: 1, username: 'testbot' }, 'SUPER_SECRET_KEY_12345', { expiresIn: '1d' });

const socket = io('http://127.0.0.1:3000', {
  auth: { token }
});

socket.on('connect', () => {
  console.log('Bot connected with ID:', socket.id);
  socket.emit('create_lobby', { 
    user: { id: 1, username: 'testbot', is_vip: 1 },
    prefs: { targetGender: 'Any', targetGame: 'Any', userRankForGame: 'Unranked', targetRole: 'Any' },
    maxPlayers: 5
  });
});

socket.on('lobby_created', (lobby) => {
  console.log('SUCCESS: Received lobby_created!', lobby);
  process.exit(0);
});

socket.on('connect_error', (err) => {
  console.log('Auth Error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('TIMEOUT: Did not receive lobby_created');
  process.exit(1);
}, 3000);
