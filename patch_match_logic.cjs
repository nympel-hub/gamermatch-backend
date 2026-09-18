const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const oldCheck = `    const checkMatchPrefs = (matcher, target) => {
      // 1. เช็คว่าเกมที่เล่น ต้องตรงกัน (ถ้าเป็น Any ก็จะเจอแต่คนที่สุ่ม Any เหมือนกัน)
      if (matcher.prefs.targetGame !== target.prefs.targetGame) return false;
      
      // 2. เช็คว่า Rank ต้องเท่ากันเป๊ะๆ ในเกมนั้น
      if (matcher.prefs.targetGame !== 'Any') {
         if (matcher.prefs.userRankForGame !== target.prefs.userRankForGame) return false;
      }
      
      // 3. เช็คเงื่อนไข VIP (เพศ)
      if (!matcher.user.is_vip) return true;
      if (matcher.prefs.targetGender === 'Any') return true;
      return target.user.gender === matcher.prefs.targetGender;
    };`;

const newCheck = `    const checkMatchPrefs = (matcher, target) => {
      if (matcher.user.id === target.user.id) return false; // Prevent matching with self across tabs

      if (matcher.prefs.targetGame !== target.prefs.targetGame) return false;
      
      if (matcher.prefs.targetGame !== 'Any') {
         if (matcher.prefs.userRankForGame !== target.prefs.userRankForGame) return false;
      }
      
      if (!matcher.user.is_vip) return true;
      
      if (matcher.prefs.targetGender !== 'Any' && target.user.gender !== matcher.prefs.targetGender) return false;
      if (matcher.prefs.targetRole !== 'Any' && target.user.play_role !== matcher.prefs.targetRole) return false;
      
      return true;
    };`;

content = content.replace(oldCheck, newCheck);

// Also we need to fix the lobby match logic because in step 1 of tryMatch, lobby matching calls checkMatchPrefs(solo, lobby), but lobby is constructed differently:
// checkMatchPrefs(solo, { prefs: lobby.prefs, user: lobby.users[0].profile })
// Let's ensure this is correct. Yes, lobby.users[0].profile is the host.

fs.writeFileSync('server.js', content);
console.log("Patched matchmaking logic.");
