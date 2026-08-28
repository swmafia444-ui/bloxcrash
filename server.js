const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// DISCORD WEBHOOKS
const LOGIN_WEBHOOK_URL = 'https://discord.com/api/webhooks/1536722566297686068/RnxgbLiEFxlpnXHXBl8-c66AM96wDGnZDVmYLQY91fj_mx4Yx8WO7zljDsKVgz87zeGt';
const GAME_WEBHOOK_URL = 'https://discord.com/api/webhooks/1535804987920097281/KVu43cJYTqIGe2QRoSv76C4hS94BF4TY_u85XDtU4FOFuOv4NDHOFMmJ1PRHrUOGqmL3';

// GLOBAL SERVER STATE
let publicMatches = [];
let chatHistory = [
    { username: "System", avatar: "https://cdn-icons-png.flaticon.com/512/616/616408.png", msg: "Welcome to PetDuel!", time: "12:00 PM" }
];

// WEBHOOK LOGGERS
async function sendLoginWebhook(userData) {
    try {
        const payload = {
            username: "Roblox Auth Logs",
            avatar_url: "https://cdn-icons-png.flaticon.com/512/616/616408.png",
            embeds: [{
                title: "🔓 User Login Verified",
                color: 3066993,
                fields: [
                    { name: "Username", value: `**${userData.username}**`, inline: true },
                    { name: "User ID", value: `\`${userData.id}\``, inline: true },
                    { name: "Profile", value: `[View Profile](https://www.roblox.com/users/${userData.id}/profile)`, inline: false }
                ],
                thumbnail: { url: userData.avatarUrl },
                timestamp: new Date().toISOString()
            }]
        };
        await fetch(LOGIN_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch (err) { console.error('Login Webhook Error:', err); }
}

async function sendGameWebhook(gameData) {
    try {
        const petNames = gameData.totalPets.map(p => p.name).join(', ');
        const payload = {
            username: "PetDuel Coinflip Logs",
            avatar_url: "https://cdn-icons-png.flaticon.com/512/616/616408.png",
            embeds: [{
                title: "🎲 Coinflip Duel Completed!",
                color: 16107615,
                fields: [
                    { name: "🏆 Winner", value: `**${gameData.winner}**`, inline: true },
                    { name: "💀 Loser", value: `**${gameData.loser}**`, inline: true },
                    { name: "🪙 Result", value: `\`${gameData.outcome.toUpperCase()}\``, inline: true },
                    { name: "💰 Total Pot Value", value: `**${gameData.totalValue.toLocaleString()} R$**`, inline: true },
                    { name: "📦 Items Pot", value: petNames.length > 200 ? petNames.substring(0, 200) + '...' : petNames, inline: false }
                ],
                timestamp: new Date().toISOString()
            }]
        };
        await fetch(GAME_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch (err) { console.error('Game Webhook Error:', err); }
}

// CHAT API
app.get('/api/chat', (req, res) => res.json(chatHistory));
app.post('/api/chat', (req, res) => {
    const { username, avatar, msg } = req.body;
    if (!username || !msg) return res.status(400).json({ error: "Invalid data" });
    const newMsg = { username, avatar, msg, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    chatHistory.push(newMsg);
    if (chatHistory.length > 100) chatHistory.shift();
    res.json({ success: true, chat: newMsg });
});

// MATCHES API
app.get('/api/matches', (req, res) => res.json(publicMatches));

app.post('/api/matches/create', (req, res) => {
    const { creator, creatorAvatar, side, pets, totalValue, minRange, maxRange, petLimit } = req.body;
    if (!creator || !pets || pets.length === 0) return res.status(400).json({ error: "Invalid match data" });

    const newMatch = {
        id: "MATCH-" + Math.floor(100000 + Math.random() * 900000),
        creator,
        creatorAvatar,
        side,
        pets,
        totalValue,
        minRange,
        maxRange,
        petLimit: petLimit || 50,
        createdAt: Date.now()
    };

    publicMatches.unshift(newMatch);
    res.json({ success: true, match: newMatch });
});

app.post('/api/matches/cancel', (req, res) => {
    const { matchId, username } = req.body;
    const matchIndex = publicMatches.findIndex(m => m.id === matchId && m.creator.toLowerCase() === username.toLowerCase());
    
    if (matchIndex === -1) return res.status(400).json({ error: "Match not found or unauthorized" });

    const canceledMatch = publicMatches.splice(matchIndex, 1)[0];
    res.json({ success: true, returnedPets: canceledMatch.pets });
});

app.post('/api/matches/resolve', async (req, res) => {
    const { matchId, joiner, joinerAvatar, joinerPets, joinerValue } = req.body;
    const matchIndex = publicMatches.findIndex(m => m.id === matchId);

    if (matchIndex === -1) return res.status(404).json({ error: "Match no longer exists" });

    const match = publicMatches[matchIndex];
    if (joinerPets.length > match.petLimit) {
        return res.status(400).json({ error: `Pet limit exceeded. Maximum ${match.petLimit} pets allowed.` });
    }

    const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
    const creatorWon = match.side === outcome;
    const winner = creatorWon ? match.creator : joiner;
    const loser = creatorWon ? joiner : match.creator;
    const totalPets = [...match.pets, ...joinerPets];
    const totalValue = match.totalValue + joinerValue;

    publicMatches.splice(matchIndex, 1);
    sendGameWebhook({ winner, loser, outcome, totalValue, totalPets });

    res.json({ success: true, outcome, winner, loser, totalPets, totalValue });
});

// ROBLOX AUTH API
app.get('/api/roblox/user/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const response = await fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=10`);
        const data = await response.json();
        
        if (!data.data || data.data.length === 0) return res.status(404).json({ error: 'Roblox user not found.' });

        const exactMatch = data.data.find(u => u.name.toLowerCase() === username.toLowerCase()) || data.data[0];
        const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${exactMatch.id}&size=150x150&format=Png&isCircular=true`);
        const thumbData = await thumbRes.json();
        const avatarUrl = thumbData.data?.[0]?.imageUrl || 'https://via.placeholder.com/150';

        const detailRes = await fetch(`https://users.roblox.com/v1/users/${exactMatch.id}`);
        const detailData = await detailRes.json();

        res.json({ id: exactMatch.id, username: detailData.name, displayName: detailData.displayName, avatarUrl });
    } catch (err) { res.status(500).json({ error: 'Roblox API Error' }); }
});

app.post('/api/roblox/verify-bio', async (req, res) => {
    try {
        const { userId, code } = req.body;
        const response = await fetch(`https://users.roblox.com/v1/users/${userId}`);
        const data = await response.json();

        if (data.description && data.description.includes(code)) {
            const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`);
            const thumbData = await thumbRes.json();
            const avatarUrl = thumbData.data?.[0]?.imageUrl || 'https://via.placeholder.com/150';

            const userInfo = { id: userId, username: data.name, avatarUrl };
            sendLoginWebhook(userInfo);
            return res.json({ success: true, user: userInfo });
        } else {
            return res.status(400).json({ error: `Verification code "${code}" not found in bio.` });
        }
    } catch (err) { res.status(500).json({ error: 'Bio verification failed.' }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
