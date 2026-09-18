const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// 1. Add friend_requests table to db setup
content = content.replace(
  "db.run(`CREATE TABLE IF NOT EXISTS friends",
  "db.run(`CREATE TABLE IF NOT EXISTS friend_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER, receiver_id INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);\n  db.run(`CREATE TABLE IF NOT EXISTS friends"
);

// 2. Add handlers for friend requests
const oldAddFriend = /socket\.on\('add_friend', async \(\{ friendId \}\) => \{[\s\S]*?io\.to\(friendSocket\.id\)\.emit\('update_friends'\);\n\s*\}\n\s*\}\n\s*\} catch \(e\) \{\n\s*console\.error\(e\);\n\s*\}\n\s*\}\);/;

const newFriendLogic = `socket.on('send_friend_request', async ({ friendId }) => {
    try {
      if (friendId === userId) return;
      const existingFriend = await db.get(\`SELECT * FROM friends WHERE user_id = ? AND friend_id = ?\`, [userId, friendId]);
      if (existingFriend) return;
      
      const existingReq = await db.get(\`SELECT * FROM friend_requests WHERE sender_id = ? AND receiver_id = ?\`, [userId, friendId]);
      if (existingReq) return;

      await db.run(\`INSERT INTO friend_requests (sender_id, receiver_id) VALUES (?, ?)\`, [userId, friendId]);
      
      const friendSocket = Array.from(io.sockets.sockets.values()).find(s => s.user && s.user.id === friendId);
      if (friendSocket) {
        // Find sender info
        const senderInfo = await db.get('SELECT id, username, avatar_url, is_vip FROM users WHERE id = ?', [userId]);
        io.to(friendSocket.id).emit('friend_request_received', senderInfo);
      }
    } catch (e) {
      console.error(e);
    }
  });

  socket.on('get_friend_requests', async () => {
    try {
      const requests = await db.all(\`
        SELECT u.id, u.username, u.avatar_url, u.is_vip, fr.id as request_id 
        FROM friend_requests fr 
        JOIN users u ON fr.sender_id = u.id 
        WHERE fr.receiver_id = ?\`, [userId]);
      socket.emit('friend_requests_list', requests);
    } catch(e) { console.error(e); }
  });

  socket.on('accept_friend_request', async ({ senderId }) => {
    try {
      await db.run(\`DELETE FROM friend_requests WHERE sender_id = ? AND receiver_id = ?\`, [senderId, userId]);
      await db.run(\`INSERT INTO friends (user_id, friend_id) VALUES (?, ?)\`, [userId, senderId]);
      await db.run(\`INSERT INTO friends (user_id, friend_id) VALUES (?, ?)\`, [senderId, userId]);
      
      loadFriends();
      const senderSocket = Array.from(io.sockets.sockets.values()).find(s => s.user && s.user.id === senderId);
      if (senderSocket) io.to(senderSocket.id).emit('update_friends');
    } catch(e) { console.error(e); }
  });

  socket.on('decline_friend_request', async ({ senderId }) => {
    try {
      await db.run(\`DELETE FROM friend_requests WHERE sender_id = ? AND receiver_id = ?\`, [senderId, userId]);
      socket.emit('update_friend_requests');
    } catch(e) { console.error(e); }
  });

  socket.on('remove_friend', async ({ friendId }) => {
    try {
      await db.run(\`DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)\`, [userId, friendId, friendId, userId]);
      loadFriends();
      const friendSocket = Array.from(io.sockets.sockets.values()).find(s => s.user && s.user.id === friendId);
      if (friendSocket) io.to(friendSocket.id).emit('update_friends');
    } catch(e) { console.error(e); }
  });`;

content = content.replace(oldAddFriend, newFriendLogic);

fs.writeFileSync('server.js', content);
console.log("Backend updated for friend requests!");
