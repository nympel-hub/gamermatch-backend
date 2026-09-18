const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// Update Register route
const oldRegister = `app.post('/api/register', async (req, res) => {
  const { username, password, gender, age } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  
  try {
    const existing = await db.get(\`SELECT * FROM users WHERE username = ?\`, [username]);
    if (existing) return res.status(400).json({ error: "Username already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const isVip = username.toLowerCase().includes('vip') ? 1 : 0; // จำลอง VIP

    const result = await db.run(
      \`INSERT INTO users (username, password, gender, age, is_vip) VALUES (?, ?, ?, ?, ?)\`, 
      [username, hashedPassword, gender || 'Any', age || 18, isVip]
    );

    const user = await db.get(\`SELECT id, username, gender, age, is_vip, exp, game_rank, is_verified FROM users WHERE id = ?\`, [result.lastID]);
    // ไม่ส่งรหัสผ่านที่เข้ารหัสแล้วกลับไปหา Client
    const safeUser = { id: user.id, username: user.username, gender: user.gender, age: user.age, is_vip: user.is_vip, exp: user.exp, game_rank: user.game_rank, is_verified: user.is_verified };
    const token = jwt.sign({ id: user.id, username: user.username, is_vip: user.is_vip }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ token, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});`;

const newRegister = `app.post('/api/register', async (req, res) => {
  const { username, password, gender, age, email } = req.body;
  if (!username || !password || !email) return res.status(400).json({ error: "Username, email, and password required" });
  
  try {
    const existing = await db.get(\`SELECT * FROM users WHERE username = ? OR email = ?\`, [username, email]);
    if (existing) return res.status(400).json({ error: "Username or email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const isVip = username.toLowerCase().includes('vip') ? 1 : 0; // จำลอง VIP
    const emailToken = require('crypto').randomBytes(20).toString('hex'); // สร้างรหัสยืนยันอีเมลจำลอง

    const result = await db.run(
      \`INSERT INTO users (username, password, email, email_token, gender, age, is_vip) VALUES (?, ?, ?, ?, ?, ?, ?)\`, 
      [username, hashedPassword, email, emailToken, gender || 'Any', age || 18, isVip]
    );

    const user = await db.get(\`SELECT id, username, email, email_verified, gender, age, is_vip, exp, game_rank, is_verified, bio, play_role, avatar_id FROM users WHERE id = ?\`, [result.lastID]);
    
    // เราจะส่ง emailToken กลับไปให้ Client จำลองการคลิกลิงก์ในอีเมล (เพื่อการทดสอบ)
    res.json({ 
      message: "Registration successful. Please verify your email.",
      userId: user.id,
      mockEmailLink: \`/api/verify_email?token=\${emailToken}\` 
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
`;

content = content.replace(oldRegister, newRegister);

// Update Login Route return object
const oldLoginRet = `res.json({ token, user: { id: user.id, username: user.username, gender: user.gender, age: user.age, is_vip: user.is_vip, exp: user.exp, game_rank: user.game_rank, is_verified: user.is_verified } });`;
const newLoginRet = `
    if (!user.email_verified) return res.status(403).json({ error: 'Email not verified. Please check your simulated email link.' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, email_verified: user.email_verified, gender: user.gender, age: user.age, is_vip: user.is_vip, exp: user.exp, game_rank: user.game_rank, is_verified: user.is_verified, bio: user.bio, play_role: user.play_role, avatar_id: user.avatar_id } });
`;
content = content.replace(oldLoginRet, newLoginRet);

// Update friend lists mapping to include bio/role/avatar
content = content.replace(
  `username: u.username, gender: u.gender, age: u.age, is_vip: u.is_vip, exp: u.exp, game_rank: u.game_rank, isOnline`,
  `username: u.username, gender: u.gender, age: u.age, is_vip: u.is_vip, exp: u.exp, game_rank: u.game_rank, bio: u.bio, play_role: u.play_role, avatar_id: u.avatar_id, isOnline`
);

fs.writeFileSync('server.js', content);
console.log('Server patched for Email and Profile!');
