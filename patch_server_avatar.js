const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// Replace all occurrences of avatar_id with avatar_id, avatar_url in SELECTs
content = content.replace(/avatar_id FROM users/g, 'avatar_id, avatar_url FROM users');
content = content.replace(/avatar_id: user\.avatar_id \}/g, 'avatar_id: user.avatar_id, avatar_url: user.avatar_url }');
content = content.replace(/avatar_id: u\.avatar_id/g, 'avatar_id: u.avatar_id, avatar_url: u.avatar_url');

// Update /api/update_profile route
const oldUpdateProfile = `app.post('/api/update_profile', async (req, res) => {
  const { userId, bio, playRole, avatarId } = req.body;
  try {
    await db.run('UPDATE users SET bio = ?, play_role = ?, avatar_id = ? WHERE id = ?', [bio, playRole, avatarId, userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});`;

const newUpdateProfile = `app.post('/api/update_profile', async (req, res) => {
  const { userId, bio, playRole, avatarUrl } = req.body;
  try {
    await db.run('UPDATE users SET bio = ?, play_role = ?, avatar_url = ? WHERE id = ?', [bio, playRole, avatarUrl, userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});`;

content = content.replace(oldUpdateProfile, newUpdateProfile);

fs.writeFileSync('server.js', content);
console.log('server.js patched for avatar_url');
