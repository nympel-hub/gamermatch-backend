const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { Pool } = require('pg');

let isPostgres = !!process.env.DATABASE_URL;
let dbInstance;

// ฟังก์ชันแปลงคำสั่ง SQL จากแบบ SQLite (?) ไปเป็น PostgreSQL ($1, $2) อัตโนมัติ
function convertQuery(sql, params) {
  if (!isPostgres) return { sql, params };
  let i = 1;
  let pgSql = sql.replace(/\?/g, () => `$${i++}`);
  // สำหรับ Postgres คำสั่ง INSERT ต้องเติม RETURNING id เฉพาะตารางที่มี id (users, dms)
  if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
    if (pgSql.includes('INTO users') || pgSql.includes('INTO dms')) {
      pgSql += ' RETURNING id';
    }
  }
  return { sql: pgSql, params };
}

async function initDB() {
  if (isPostgres) {
    console.log("Initializing PostgreSQL Database...");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE,
        password VARCHAR(255), 
        gender VARCHAR(50),
        age INTEGER,
        is_vip BOOLEAN DEFAULT false,
        exp INTEGER DEFAULT 0,
        is_verified BOOLEAN DEFAULT false,
        game_rank VARCHAR(255),
        email VARCHAR(255),
        email_verified BOOLEAN DEFAULT false,
        email_token VARCHAR(255),
        bio TEXT DEFAULT 'I love gaming!',
        play_role VARCHAR(100) DEFAULT 'Flex',
        avatar_id INTEGER DEFAULT 1,
        avatar_url TEXT
      );
      
      CREATE TABLE IF NOT EXISTS friends (
        user_id INTEGER,
        friend_id INTEGER,
        PRIMARY KEY (user_id, friend_id)
      );

      CREATE TABLE IF NOT EXISTS user_ranks (
        user_id INTEGER,
        game VARCHAR(255),
        rank VARCHAR(255),
        PRIMARY KEY (user_id, game)
      );

      CREATE TABLE IF NOT EXISTS dms (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER,
        receiver_id INTEGER,
        message TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    dbInstance = {
      async get(sql, params) {
        const { sql: pgSql, params: pgParams } = convertQuery(sql, params);
        const res = await pool.query(pgSql, pgParams);
        return res.rows[0];
      },
      async all(sql, params) {
        const { sql: pgSql, params: pgParams } = convertQuery(sql, params);
        const res = await pool.query(pgSql, pgParams);
        return res.rows;
      },
      async run(sql, params) {
        const { sql: pgSql, params: pgParams } = convertQuery(sql, params);
        const res = await pool.query(pgSql, pgParams);
        return { lastID: res.rows[0] ? res.rows[0].id : 0 };
      }
    };
    
        await pool.query(`
      ALTER TABLE user_ranks ADD COLUMN IF NOT EXISTS role VARCHAR(255) DEFAULT 'Flex';
    `).catch(e => console.log('Notice: ' + e.message));
    console.log("Connected to PostgreSQL Cloud Database successfully.");
    return dbInstance;
    
  } else {
    console.log("Initializing local SQLite Database...");
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
        bio TEXT DEFAULT 'I love gaming!',
        play_role TEXT DEFAULT 'Flex',
        avatar_id INTEGER DEFAULT 1,
        avatar_url TEXT
      );
      CREATE TABLE IF NOT EXISTS friends (user_id INTEGER, friend_id INTEGER, PRIMARY KEY (user_id, friend_id));
      CREATE TABLE IF NOT EXISTS user_ranks (user_id INTEGER, game TEXT, rank TEXT, role TEXT DEFAULT 'Flex', PRIMARY KEY (user_id, game));
      CREATE TABLE IF NOT EXISTS dms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER, receiver_id INTEGER, message TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Upgrade schema for existing SQLite DBs
    const columnsInfo = await db.all("PRAGMA table_info(users)");
    if (!columnsInfo.some(col => col.name === 'password')) await db.exec("ALTER TABLE users ADD COLUMN password TEXT");
    if (!columnsInfo.some(col => col.name === 'email')) {
        await db.exec("ALTER TABLE users ADD COLUMN email TEXT");
        await db.exec("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 0");
        await db.exec("ALTER TABLE users ADD COLUMN email_token TEXT");
        await db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT 'I love gaming!'");
        await db.exec("ALTER TABLE users ADD COLUMN play_role TEXT DEFAULT 'Flex'");
        await db.exec("ALTER TABLE users ADD COLUMN avatar_id INTEGER DEFAULT 1");
        await db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT");
    }

    dbInstance = db;
    return dbInstance;
  }
}

module.exports = { initDB };
