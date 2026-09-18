const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// Replace boolean 1 with TRUE
content = content.replace('email_verified = 1', 'email_verified = TRUE');
content = content.replace('is_verified = 1', 'is_verified = TRUE');

// Replace isVip ternary 1 : 0 with true : false
content = content.replace("? 1 : 0", "? true : false");

// Replace hardcoded safeUser object
content = content.replace('email_verified: 1', 'email_verified: true');

fs.writeFileSync('server.js', content);
console.log('Server DB booleans patched for Postgres');
