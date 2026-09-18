const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function initDB() {
  const db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT, 
      gender TEXT,
      age INTEGER,
      is_vip BOOLEAN DEFAULT 0,
      exp INTEGER DEFAULT 0,
      is_verified BOOLEAN DEFAULT 0,
      game_rank TEXT,
      email TEXT,
      email_verified BOOLEAN DEFAULT 0,
      email_token TEXT,
      bio TEXT,
      play_role TEXT,
      avatar_id INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS friends (
      user_id INTEGER,
      friend_id INTEGER,
      PRIMARY KEY (user_id, friend_id)
    );

    CREATE TABLE IF NOT EXISTS user_ranks (
      user_id INTEGER,
      game TEXT,
      rank TEXT,
      PRIMARY KEY (user_id, game)
    );

    CREATE TABLE IF NOT EXISTS dms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER,
      receiver_id INTEGER,
      message TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const columnsInfo = await db.all("PRAGMA table_info(users)");
  const hasPassword = columnsInfo.some(col => col.name === 'password');
  const hasEmail = columnsInfo.some(col => col.name === 'email');
  
  if (!hasPassword) {
      await db.exec("ALTER TABLE users ADD COLUMN password TEXT");
  }
  
  // Upgrade schema if needed
  if (!hasEmail) {
      await db.exec("ALTER TABLE users ADD COLUMN email TEXT");
      await db.exec("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 0");
      await db.exec("ALTER TABLE users ADD COLUMN email_token TEXT");
      await db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT 'I love gaming!'");
      await db.exec("ALTER TABLE users ADD COLUMN play_role TEXT DEFAULT 'Flex'");
      await db.exec("ALTER TABLE users ADD COLUMN avatar_id INTEGER DEFAULT 1");
      console.log("Database updated: Added Email and Profile columns.");
  }

  return db;
}

module.exports = { initDB };
