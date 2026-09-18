const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const fs = require('fs');

async function initDB() {
  const db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  // ในช่วงพัฒนาระบบ เราจะสร้างตารางใหม่เพื่อให้รองรับช่อง Password
  // หมายเหตุ: การใช้ CREATE TABLE IF NOT EXISTS หากมีตารางเดิมอยู่แล้ว มันจะไม่สร้าง column ใหม่
  // ดังนั้นเราจะเพิ่มระบบตรวจสอบและ Alter Table หากยังไม่มีช่องรหัสผ่าน
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT, 
      gender TEXT,
      age INTEGER,
      is_vip BOOLEAN DEFAULT 0,
      exp INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS friends (
      user_id INTEGER,
      friend_id INTEGER,
      PRIMARY KEY (user_id, friend_id)
    );
  `);

  // ตรวจสอบว่าตาราง users มีคอลัมน์ password หรือยัง (สำหรับฐานข้อมูลเก่าที่สร้างไปก่อนหน้า)
  const columnsInfo = await db.all("PRAGMA table_info(users)");
  const hasPassword = columnsInfo.some(col => col.name === 'password');
  
  if (!hasPassword) {
      await db.exec("ALTER TABLE users ADD COLUMN password TEXT");
      console.log("Database updated: Added password column.");
  }

  return db;
}

module.exports = { initDB };
