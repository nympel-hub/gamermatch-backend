const fs = require('fs');
let srvContent = fs.readFileSync('server.js', 'utf8');

// Update get_ranks
srvContent = srvContent.replace(
  "SELECT game, rank FROM user_ranks",
  "SELECT game, rank, role FROM user_ranks"
);

// Update update_rank
const targetUpdateRank = `app.post('/api/update_rank', async (req, res) => {
    const { userId, game, rank } = req.body;`;

const newUpdateRank = `app.post('/api/update_rank', async (req, res) => {
    const { userId, game, rank, role } = req.body;`;

srvContent = srvContent.replace(targetUpdateRank, newUpdateRank);

const targetInsertRank = `if (existing) {
        await db.run('UPDATE user_ranks SET rank = ? WHERE user_id = ? AND game = ?', [rank, userId, game]);
      } else {
        await db.run('INSERT INTO user_ranks (user_id, game, rank) VALUES (?, ?, ?)', [userId, game, rank]);
      }`;

const newInsertRank = `if (existing) {
        await db.run('UPDATE user_ranks SET rank = ?, role = ? WHERE user_id = ? AND game = ?', [rank, role || 'Flex', userId, game]);
      } else {
        await db.run('INSERT INTO user_ranks (user_id, game, rank, role) VALUES (?, ?, ?, ?)', [userId, game, rank, role || 'Flex']);
      }`;

srvContent = srvContent.replace(targetInsertRank, newInsertRank);

fs.writeFileSync('server.js', srvContent);
console.log('server.js patched for game roles');
