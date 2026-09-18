const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { initDB } = require('./database');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // ให้ Express อ่านข้อมูลแบบ JSON ได้

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const JWT_SECRET = 'gamermatch_super_secret_key_123'; // ในระบบจริงต้องย้ายไปอยู่ไฟล์ .env
let db;
let queue = [];
let pendingMatches = {};
let activeRooms = {};
let lobbies = {}; // Lobby System 

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
    const isVip = username.toLowerCase().includes('vip') ? true : false; // จำลอง VIP
    const emailToken = require('crypto').randomBytes(20).toString('hex'); // สร้างรหัสยืนยันอีเมลจำลอง

    const result = await db.run(
      `INSERT INTO users (username, password, email, email_token, gender, age, is_vip) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
      [username, hashedPassword, email, emailToken, gender || 'Any', age || 18, isVip]
    );

    const user = await db.get(`SELECT id, username, email, email_verified, gender, age, is_vip, exp, game_rank, is_verified, bio, play_role, avatar_id, avatar_url FROM users WHERE id = ?`, [result.lastID]);
    
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
    
    await db.run('UPDATE users SET email_verified = TRUE, email_token = NULL WHERE id = ?', [user.id]);
    
    const safeUser = { id: user.id, username: user.username, email: user.email, email_verified: true, gender: user.gender, age: user.age, is_vip: user.is_vip, exp: user.exp, game_rank: user.game_rank, is_verified: user.is_verified, bio: user.bio, play_role: user.play_role, avatar_id: user.avatar_id, avatar_url: user.avatar_url };
    const jwtToken = jwt.sign({ id: user.id, username: user.username, is_vip: user.is_vip }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ token: jwtToken, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/update_profile', async (req, res) => {
  const { userId, bio, playRole, avatarUrl } = req.body;
  try {
    await db.run('UPDATE users SET bio = ?, play_role = ?, avatar_url = ? WHERE id = ?', [bio, playRole, avatarUrl, userId]);
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
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, email_verified: user.email_verified, gender: user.gender, age: user.age, is_vip: user.is_vip, exp: user.exp, game_rank: user.game_rank, is_verified: user.is_verified, bio: user.bio, play_role: user.play_role, avatar_id: user.avatar_id, avatar_url: user.avatar_url } });

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
    await db.run('UPDATE users SET is_verified = TRUE WHERE id = ?', [userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API สำหรับดึง Rank ทั้งหมดของตัวเอง
app.post('/api/get_ranks', async (req, res) => {
  const { userId } = req.body;
  try {
    const ranks = await db.all('SELECT game, rank, role FROM user_ranks WHERE user_id = ?', [userId]);
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

  
  // === LOBBY SYSTEM ===
  socket.on('convert_room_to_lobby', ({ roomId, user, targetSize }) => {
    try {
      const match = pendingMatches[roomId];
      if (!match) return;
      const lobbyId = Math.random().toString(36).substring(2, 8).toUpperCase();
      lobbies[lobbyId] = {
        id: lobbyId,
        host: user.id,
        maxPlayers: targetSize || 5,
        prefs: { targetGame: 'Any', targetGender: 'Any', targetRole: 'Any', userRankForGame: 'Unranked' },
        users: match.users,
        isFilling: true
      };
      match.users.forEach(u => {
        const uSocket = io.sockets.sockets.get(u.id); // u.id is socketId here
        if (uSocket) {
          uSocket.join(lobbyId);
          uSocket.emit('lobby_created', lobbies[lobbyId]);
          uSocket.emit('lobby_updated', lobbies[lobbyId]);
        }
      });
      tryMatch();
    } catch(err) {
      console.error(err);
    }
  });

  socket.on('create_lobby', ({ user, prefs, maxPlayers }) => {
    try {
      console.log('Received create_lobby from', user.username);

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
      console.log('Emitted lobby_created', lobbyId);
    } catch(err) {
      console.error('ERROR in create_lobby:', err);
    }
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
        if (lobby.host === userId || !lobby.users.some(u => u.dbId === lobby.host)) {
          lobby.host = lobby.users[0].dbId;
        }
        io.to(lobbyId).emit('lobby_updated', lobby);
      }
    }
  });

  socket.on('toggle_lobby_fill', ({ lobbyId, isFilling, userId }) => {
    const lobby = lobbies[lobbyId];
    if (lobby && lobby.host === userId) { // NOTE: Need to track socket.user on connect
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
    // Prevent matching with self across tabs
    if (matcher.user.id === target.user.id) return false;

    // 1. เช็คว่าเกมที่เล่น ต้องตรงกัน
    if (matcher.prefs.targetGame !== target.prefs.targetGame) return false;
    
    // 2. เช็คว่า Rank ต้องเท่ากันเป๊ะๆ ในเกมนั้น
    if (matcher.prefs.targetGame !== 'Any') {
       if (matcher.prefs.userRankForGame !== target.prefs.userRankForGame) return false;
    }
    
    // 3. เช็คเงื่อนไข VIP (เพศและตำแหน่ง)
    if (!matcher.user.is_vip) return true;
    
    if (matcher.prefs.targetGender !== 'Any' && target.user.gender !== matcher.prefs.targetGender) return false;
    if (matcher.prefs.targetRole !== 'Any' && target.user.play_role !== matcher.prefs.targetRole) return false;
    
    return true;
  };

  const tryMatch = () => {
    try {
      // 1. Fill open lobbies first
      for (const lobbyId in lobbies) {
        const lobby = lobbies[lobbyId];
        if (lobby.isFilling && lobby.users.length < lobby.maxPlayers) {
          for (let i = queue.length - 1; i >= 0; i--) {
            const solo = queue[i];
            
            // Check if solo matches lobby prefs (using lobby host's profile as target)
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
            const roomId = `match_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            
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
  socket.on('request_voice_connections', ({ roomId }) => { 
      if (!isUserAuthorizedForRoom(socket.id, roomId)) { console.log('Unauthorized request_voice', socket.id, roomId); return; }
      console.log('Voice connection requested by', socket.id, 'in', roomId);
      socket.to(roomId).emit('voice_connection_requested', { sender: socket.id, roomId }); 
    });
    
    socket.on('webrtc_offer', ({ roomId, offer }) => {
      if (!isUserAuthorizedForRoom(socket.id, roomId)) { console.log('Unauthorized webrtc_offer', socket.id, roomId); return; }
      console.log('Sending webrtc_offer from', socket.id, 'to room', roomId);
      socket.to(roomId).emit('webrtc_offer', { offer, sender: socket.id, roomId });
    });
  
    socket.on('webrtc_answer', ({ roomId, answer }) => {
      if (!isUserAuthorizedForRoom(socket.id, roomId)) { console.log('Unauthorized webrtc_answer', socket.id, roomId); return; }
      console.log('Sending webrtc_answer from', socket.id, 'to room', roomId);
      socket.to(roomId).emit('webrtc_answer', { answer, sender: socket.id, roomId });
    });
  
    socket.on('webrtc_ice_candidate', ({ roomId, candidate }) => {
      if (!isUserAuthorizedForRoom(socket.id, roomId)) return;
      socket.to(roomId).emit('webrtc_ice_candidate', { candidate, sender: socket.id, roomId });
    });
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
