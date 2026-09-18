const fs = require('fs');
let content = fs.readFileSync('database.js', 'utf8');

const targetStr = `  // สำหรับ Postgres คำสั่ง INSERT ต้องเติม RETURNING id เพื่อดึง ID ล่าสุดกลับมา
  if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
    pgSql += ' RETURNING id';
  }`;

const replacementStr = `  // สำหรับ Postgres คำสั่ง INSERT ต้องเติม RETURNING id เฉพาะตารางที่มี id (users, dms)
  if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
    if (pgSql.includes('INTO users') || pgSql.includes('INTO dms')) {
      pgSql += ' RETURNING id';
    }
  }`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync('database.js', content);
    console.log('database.js patched successfully for RETURNING id');
} else {
    console.log('Target string not found in database.js');
}
