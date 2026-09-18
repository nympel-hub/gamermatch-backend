const fs = require('fs');
let dbContent = fs.readFileSync('database.js', 'utf8');

dbContent = dbContent.replace(
  "CREATE TABLE IF NOT EXISTS user_ranks (user_id INTEGER, game VARCHAR(255), rank VARCHAR(255), PRIMARY KEY (user_id, game));",
  "CREATE TABLE IF NOT EXISTS user_ranks (user_id INTEGER, game VARCHAR(255), rank VARCHAR(255), role VARCHAR(255) DEFAULT 'Flex', PRIMARY KEY (user_id, game));"
);
dbContent = dbContent.replace(
  "CREATE TABLE IF NOT EXISTS user_ranks (user_id INTEGER, game TEXT, rank TEXT, PRIMARY KEY (user_id, game));",
  "CREATE TABLE IF NOT EXISTS user_ranks (user_id INTEGER, game TEXT, rank TEXT, role TEXT DEFAULT 'Flex', PRIMARY KEY (user_id, game));"
);

// PostgreSQL alter table for safety if it already exists
const pgAlter = `    await pool.query(\`
      ALTER TABLE user_ranks ADD COLUMN IF NOT EXISTS role VARCHAR(255) DEFAULT 'Flex';
    \`).catch(e => console.log('Notice: ' + e.message));`;

const pgTarget = `console.log("Connected to PostgreSQL Cloud Database successfully.");`;
if (dbContent.includes(pgTarget)) {
    dbContent = dbContent.replace(pgTarget, pgAlter + '\n    ' + pgTarget);
}

fs.writeFileSync('database.js', dbContent);
console.log('database.js patched for roles');
