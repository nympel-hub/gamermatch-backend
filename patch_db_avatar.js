const fs = require('fs');
let content = fs.readFileSync('database.js', 'utf8');

if (!content.includes('avatar_url')) {
  content = content.replace('avatar_id INTEGER DEFAULT 1', 'avatar_id INTEGER DEFAULT 1,\n      avatar_url TEXT');
  content = content.replace('await db.exec("ALTER TABLE users ADD COLUMN avatar_id INTEGER DEFAULT 1");', 'await db.exec("ALTER TABLE users ADD COLUMN avatar_id INTEGER DEFAULT 1");\n      await db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT");');
  fs.writeFileSync('database.js', content);
  console.log('database.js patched for avatar_url');
} else {
  console.log('avatar_url already exists in database.js');
}
