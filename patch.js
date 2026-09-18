const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const dmCode = `
  // === ระบบแชทส่วนตัว (Direct Messages) ===
  socket.on('get_dm_history', async ({ friendId }) => {
    try {
      const dms = await db.all(
        'SELECT * FROM dms WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY timestamp ASC',
        [userId, friendId, friendId, userId]
      );
      socket.emit('dm_history', { friendId, dms });
    } catch(err) {
      console.error(err);
    }
  });

  socket.on('send_dm', async ({ receiverId, message }) => {
    try {
      const result = await db.run(
        'INSERT INTO dms (sender_id, receiver_id, message) VALUES (?, ?, ?)',
        [userId, receiverId, message]
      );
      
      const newMsg = await db.get('SELECT * FROM dms WHERE id = ?', [result.lastID]);
      
      socket.emit('receive_dm', newMsg);
      const friendSockets = Array.from(io.sockets.sockets.values()).filter(s => s.user && s.user.id === receiverId);
      friendSockets.forEach(s => s.emit('receive_dm', newMsg));
    } catch(err) {
      console.error(err);
    }
  });
`;

content = content.replace("socket.on('join_queue'", dmCode + "\n  socket.on('join_queue'");
fs.writeFileSync('server.js', content);
console.log('Done!');
