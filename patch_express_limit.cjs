const fs = require('fs');
let srvContent = fs.readFileSync('server.js', 'utf8');

srvContent = srvContent.replace("app.use(express.json());", "app.use(express.json({ limit: '10mb' }));");

fs.writeFileSync('server.js', srvContent);
console.log('server.js patched for 10mb json limit');
