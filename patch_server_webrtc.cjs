const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const oldVoiceReq = `socket.on('request_voice_connections', ({ roomId }) => { if (!isUserAuthorizedForRoom(socket.id, roomId)) return; socket.to(roomId).emit('voice_connection_requested', { sender: socket.id }); });`;
const newVoiceReq = `socket.on('request_voice_connections', ({ roomId }) => { if (!isUserAuthorizedForRoom(socket.id, roomId)) return; socket.to(roomId).emit('voice_connection_requested', { sender: socket.id, roomId }); });`;

content = content.replace(oldVoiceReq, newVoiceReq);
fs.writeFileSync('server.js', content);
console.log("Server.js patched for WebRTC roomId");
