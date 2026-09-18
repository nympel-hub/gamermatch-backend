const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// Fix WebRTC emitting
content = content.replace(
  "socket.to(roomId).emit('webrtc_offer', { offer, sender: socket.id });",
  "socket.to(roomId).emit('webrtc_offer', { offer, sender: socket.id, roomId });"
);
content = content.replace(
  "socket.to(roomId).emit('webrtc_answer', { answer, sender: socket.id });",
  "socket.to(roomId).emit('webrtc_answer', { answer, sender: socket.id, roomId });"
);
content = content.replace(
  "socket.to(roomId).emit('webrtc_ice_candidate', { candidate, sender: socket.id });",
  "socket.to(roomId).emit('webrtc_ice_candidate', { candidate, sender: socket.id, roomId });"
);

fs.writeFileSync('server.js', content);
console.log('Fixed WebRTC in server.js');
