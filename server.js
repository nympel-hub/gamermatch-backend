const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { initDB } = require('./database');

const app = express();
app.use(cors());
app.use(express.json()); // ให้ Express อ่านข้อมูลแบบ JSON ได้

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const JWT_SECRET = 'gamermatch_super_secret_key_123'; // ในระบบจริงต้องย้ายไปอยู่ไฟล์ .env
let db;
let queue = [];
let pendingMatches = {};
let activeRooms = {}; 

initDB().then(database => {
  db = database;
  console.log("Database initialized.");
});

// === REST API ROUTES (Authentication) ===
app.post('/api/register', async (req, res) => {
  const { username, password, gender, age, email } = req.body;
  if (!username || !password || !email) return res.status(400).json({ error: "Username, email, and password required" });
  
  try {
    const existing = await db.get(`SELECT * FROM users WHERE username = ? OR email = ?`, [username, email]);
    if (existing) return res.status(400).json({ error: "Username or email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const isVip = username.toLowerCase().includes('vip') ? 1 : 0; // จำลอง VIP
    const emailToken = require('crypto').randomBytes(20).toString('hex'); // สร้างรหัสยืนยันอีเมลจำลอง

    const result = await db.run(
      `INSERT INTO users (username, password, email, email_token, gender, age, is_vip) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
      [username, hashedPassword, email, emailToken, gender || 'Any', age || 18, isVip]
    );

    const user = await db.get(`SELECT id, username, email, email_verified, gender, age, is_vip, exp, game_rank, is_verified, bio, play_role, avatar_id FROM users WHERE id = ?`, [result.lastID]);
    
    // เราจะส่ง emailToken กลับไปให้ Client จำลองการคลิกลิงก์ในอีเมล (เพื่อการทดสอบ)
    res.json({ 
      message: "Registration successful. Please verify your email.",
      userId: user.id,
      mockEmailLink: `/api/verify_email?token=${emailToken}` 
    });
  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// === REST API ROUTES (Profile & Email Verification) ===
app.post('/api/verify_email', async (req, res) => {
  const { token } = req.body;
  try {
    const user = await db.get('SELECT * FROM users WHERE email_token = ?', [token]);
    if (!user) return res.status(400).json({ error: 'Invalid or expired verification link.' });
    
    await db.run('UPDATE users SET email_verified = 1, email_token = NULL WHERE id = ?', [user.id]);
    
    const safeUser = { id: user.id, username: user.username, email: user.email, email_verified: 1, gender: user.gender, age: user.age, is_vip: user.is_vip, exp: user.exp, game_rank: user.game_rank, is_verified: user.is_verified, bio: user.bio, play_role: user.play_role, avatar_id: user.avatar_id };
    const jwtToken = jwt.sign({ id: user.id, username: user.username, is_vip: user.is_vip }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ token: jwtToken, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/update_profile', async (req, res) => {
  const { userId, bio, playRole, avatarId } = req.body;
  try {
    await db.run('UPDATE users SET bio = ?, play_role = ?, avatar_id = ? WHERE id = ?', [bio, playRole, avatarId, userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(400).json({ error: 'User not found' });
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });

    const token = jwt.sign({ id: user.id, username: user.username, is_vip: user.is_vip }, JWT_SECRET);
    
    if (!user.email_verified) return res.status(403).json({ error: 'Email not verified. Please check your simulated email link.' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, email_verified: user.email_verified, gender: user.gender, age: user.age, is_vip: user.is_vip, exp: user.exp, game_rank: user.game_rank, is_verified: user.is_verified, bio: user.bio, play_role: user.play_role, avatar_id: user.avatar_id } });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API สำหรับแก้ไขโปรไฟล์และเปลี่ยน Rank
app.post('/api/update_profile', async (req, res) => {
  const { userId, game_rank } = req.body;
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // ด่านตรวจจับ: ถ้าจะเอา Rank สูงสุด ต้องยืนยันตัวตนแล้วเท่านั้น
    if (game_rank === 'Apex Predator' && user.is_verified === 0) {
       return res.status(403).json({ error: 'IDENTITY_UNVERIFIED', message: 'Identity verification required for Apex Predator rank!' });
    }

    await db.run('UPDATE users SET game_rank = ? WHERE id = ?', [game_rank, userId]);
    res.json({ success: true, game_rank });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API สำหรับจำลองการอัปโหลดบัตรประชาชนยืนยันตัวตน
app.post('/api/verify_identity', async (req, res) => {
  const { userId } = req.body;
  try {
    await db.run('UPDATE users SET is_verified = 1 WHERE id = ?', [userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API สำหรับดึง Rank ทั้งหมดของตัวเอง
app.post('/api/get_ranks', async (req, res) => {
  const { userId } = req.body;
  try {
    const ranks = await db.all('SELECT game, rank FROM user_ranks WHERE user_id = ?', [userId]);
    res.json({ success: true, ranks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API สำหรับแก้ไข Rank ตามเกม
app.post('/api/update_rank', async (req, res) => {
  const { userId, game, rank } = req.body;
  try {
    const user = await db.get('SELECT is_verified FROM users WHERE id = ?', [userId]);
    
    if (rank.toLowerCase() === 'apex predator' && user.is_verified === 0) {
       return res.status(403).json({ error: 'IDENTITY_UNVERIFIED', message: 'Identity verification required for Apex Predator rank!' });
    }

    const existing = await db.get('SELECT * FROM user_ranks WHERE user_id = ? AND game = ?', [userId, game]);
    if (existing) {
      await db.run('UPDATE user_ranks SET rank = ? WHERE user_id = ? AND game = ?', [rank, userId, game]);
    } else {
      await db.run('INSERT INTO user_ranks (user_id, game, rank) VALUES (?, ?, ?)', [userId, game, rank]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === SECURE SOCKET MIDDLEWARE ===
// ก่อนที่ผู้เล่นจะเข้ามาในท่อสื่อสาร (Socket) ได้ จะต้องมีบัตร (Token) ก่อน
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Invalid token'));
    socket.userContext = decoded; // เก็บข้อมูลผู้ใช้ที่ถอดรหัสแล้วไว้ใน socket
    next();
  });
});

const isUserAuthorizedForRoom = (socketId, roomId) => {
  if (!activeRooms[roomId]) return false;
  return activeRooms[roomId].some(user => user.id === socketId);
};

// เก็บรายชื่อคนที่ออนไลน์ { userId: socketId }
let onlineUsers = {};

io.on('connection', (socket) => {
  const userId = socket.userContext.id;
  const username = socket.userContext.username;
  
  console.log(`User online: ${username}`);
  onlineUsers[userId] = socket.id;

  // โหลดรายชื่อเพื่อนทันทีที่ออนไลน์
  const loadFriends = async () => {
    try {
      const friendsList = await db.all(`
        SELECT u.id, u.username, u.is_vip, u.exp
        FROM friends f
        JOIN users u ON f.friend_id = u.id
        WHERE f.user_id = ?
      `, [userId]);
      
      // แนบสถานะ Online
      const friendsWithStatus = friendsList.map(f => ({
        ...f,
        isOnline: !!onlineUsers[f.id]
      }));
      
      socket.emit('friends_list', friendsWithStatus);
    } catch (err) {
      console.error("Error loading friends:", err);
    }
  };
  
  loadFriends(); // เรียกใช้เลยตอนเชื่อมต่อ

  socket.on('get_friends', () => {
    loadFriends();
  });

  socket.on('add_friend', async ({ friendId }) => {
    try {
      if (friendId === userId) return;
      const existing = await db.get(`SELECT * FROM friends WHERE user_id = ? AND friend_id = ?`, [userId, friendId]);
      if (!existing) {
        await db.run(`INSERT INTO friends (user_id, friend_id) VALUES (?, ?)`, [userId, friendId]);
        await db.run(`INSERT INTO friends (user_id, friend_id) VALUES (?, ?)`, [friendId, userId]);
      }
      loadFriends();
      const friendSocket = onlineUsers[friendId];
      if (friendSocket) {
        io.to(friendSocket).emit('refresh_friends');
      }
    } catch (err) {
      console.error("Error adding friend:", err);
    }
  });

  // 1. ระบบคิวและจับคู่
  
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

  socket.on('join_queue', (data) => {
    // data = { user, prefs: { targetGender, targetGame, userRankForGame } }
    console.log(`${data.user.username} joined queue for Game: ${data.prefs.targetGame} Rank: ${data.prefs.userRankForGame}`);
    queue.push({ socketId: socket.id, user: data.user, prefs: data.prefs });
    tryMatch();
  });

  socket.on('leave_queue', () => {
    const idx = queue.findIndex(q => q.socketId === socket.id);
    if (idx !== -1) queue.splice(idx, 1);
  });

  const checkMatchPrefs = (matcher, target) => {
    // 1. เช็คว่าเกมที่เล่น ต้องตรงกัน (ถ้าเป็น Any ก็จะเจอแต่คนที่สุ่ม Any เหมือนกัน)
    if (matcher.prefs.targetGame !== target.prefs.targetGame) return false;
    
    // 2. เช็คว่า Rank ต้องเท่ากันเป๊ะๆ ในเกมนั้น
    if (matcher.prefs.targetGame !== 'Any') {
       if (matcher.prefs.userRankForGame !== target.prefs.userRankForGame) return false;
    }
    
    // 3. เช็คเงื่อนไข VIP (เพศ)
    if (!matcher.user.is_vip) return true;
    if (matcher.prefs.targetGender === 'Any') return true;
    return target.user.gender === matcher.prefs.targetGender;
  };

  const tryMatch = () => {
    if (queue.length < 2) return;
    for (let i = 0; i < queue.length; i++) {
      const p1 = queue[i];
      for (let j = i + 1; j < queue.length; j++) {
        const p2 = queue[j];
        if (checkMatchPrefs(p1, p2) && checkMatchPrefs(p2, p1)) {
          const roomId = `match_${Date.now()}_${Math.random().toString(36).substring(7)}`; // ทำให้เดา RoomID ยากขึ้น
          
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
  };

  // 2. กดยอมรับ/ปฏิเสธ
  socket.on('accept_match', ({ roomId }) => {
    const match = pendingMatches[roomId];
    if (match) {
      // ตรวจสอบว่าคนที่ส่งคำขออยู่ในรายชื่อที่จับคู่จริงๆ
      if (!match.users.some(u => u.id === socket.id)) return;

      if (!match.accepted.includes(socket.id)) {
        match.accepted.push(socket.id);
      }

      if (match.accepted.length === 2) {
        activeRooms[roomId] = match.users;
        match.users.forEach(u => {
          const userSocket = io.sockets.sockets.get(u.id);
          const opponentData = match.users.find(x => x.id !== u.id);
          if (userSocket) userSocket.join(roomId);
          io.to(u.id).emit('match_started', { 
              roomId, 
              users: match.users, 
              opponentDbId: opponentData.dbId,
              opponentProfile: opponentData.profile // ส่งโปรไฟล์ศัตรูไปให้อวดกันได้
          });
        });
        delete pendingMatches[roomId];
      }
    }
  });
  
  socket.on('decline_match', ({ roomId }) => {
     const match = pendingMatches[roomId];
     if (match && match.users.some(u => u.id === socket.id)) {
        match.users.forEach(u => {
            if (u.id !== socket.id) io.to(u.id).emit('match_declined');
        });
        delete pendingMatches[roomId];
     }
  });

  // ==========================================
  // === SECURE ROOM COMMUNICATIONS ===
  // ==========================================

  // 4. แชทข้อความ (เพิ่ม Security Check)
  socket.on('send_message', ({ roomId, message, senderName }) => {
    if (!isUserAuthorizedForRoom(socket.id, roomId)) return; // เตะทิ้งถ้าไม่มีสิทธิ์
    io.to(roomId).emit('receive_message', { senderName, message, timestamp: new Date() });
  });
  
  // 5. ระบบเชื่อมต่อเสียง (WebRTC Signaling)
  socket.on('webrtc_offer', ({ roomId, offer }) => {
    if (!isUserAuthorizedForRoom(socket.id, roomId)) return;
    socket.to(roomId).emit('webrtc_offer', { offer, sender: socket.id });
  });

  socket.on('webrtc_answer', ({ roomId, answer }) => {
    if (!isUserAuthorizedForRoom(socket.id, roomId)) return;
    socket.to(roomId).emit('webrtc_answer', { answer, sender: socket.id });
  });

  socket.on('webrtc_ice_candidate', ({ roomId, candidate }) => {
    if (!isUserAuthorizedForRoom(socket.id, roomId)) return;
    socket.to(roomId).emit('webrtc_ice_candidate', { candidate, sender: socket.id });
  });

  // 6. การออกจากห้อง
  socket.on('leave_room', async ({ roomId }) => {
     if (!isUserAuthorizedForRoom(socket.id, roomId)) return;
     
     // แจก EXP ให้ทั้งคู่เมื่อมีคนจบแมตช์ (+10 EXP)
     const usersInRoom = activeRooms[roomId];
     if (usersInRoom) {
         try {
             for (const u of usersInRoom) {
                 await db.run(`UPDATE users SET exp = exp + 10 WHERE id = ?`, [u.dbId]);
                 // ดึงข้อมูล EXP ล่าสุดส่งกลับไปอัปเดตหน้าจอ
                 const updatedUser = await db.get(`SELECT exp FROM users WHERE id = ?`, [u.dbId]);
                 io.to(u.id).emit('exp_gained', { newExp: updatedUser.exp });
             }
         } catch(err) {
             console.error("Error giving EXP:", err);
         }
     }

     socket.leave(roomId);
     socket.to(roomId).emit('partner_left');
     
     // ลบห้องทิ้งหากมีคนออก
     delete activeRooms[roomId]; 
  });

  socket.on('disconnect', () => {
    queue = queue.filter(u => u.socketId !== socket.id);
    // แจ้งเตือนห้องที่กำลังออนไลน์อยู่ว่าเพื่อนหลุด
    for (const [roomId, users] of Object.entries(activeRooms)) {
       if (users.some(u => u.id === socket.id)) {
           socket.to(roomId).emit('partner_left');
           delete activeRooms[roomId];
       }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
