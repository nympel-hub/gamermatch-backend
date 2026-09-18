const { io } = require("socket.io-client");

const URL = "http://localhost:3000";

// Bot 1
const socket1 = io(URL);
socket1.on("connect", () => {
  console.log("Bot 1 connected");
  
  // Fake auth
  socket1.emit('join_queue', {
    user: { id: 1, username: "Bot1", gender: "Male", is_vip: 0, play_role: "Flex" },
    prefs: { targetGender: "Any", targetGame: "Any", userRankForGame: "Unranked", targetRole: "Any" }
  });
});

socket1.on('match_found', (data) => {
  console.log("Bot 1 found match: ", data);
});

// Bot 2
setTimeout(() => {
  const socket2 = io(URL);
  socket2.on("connect", () => {
    console.log("Bot 2 connected");
    socket2.emit('join_queue', {
      user: { id: 2, username: "Bot2", gender: "Female", is_vip: 0, play_role: "Flex" },
      prefs: { targetGender: "Any", targetGame: "Any", userRankForGame: "Unranked", targetRole: "Any" }
    });
  });

  socket2.on('match_found', (data) => {
    console.log("Bot 2 found match: ", data);
    process.exit(0);
  });
}, 1000);
