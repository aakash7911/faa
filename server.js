const express = require('express');
const cors = require('cors');

const app = express();
// Cloud platforms (jaise Render) apna khud ka PORT dete hain, isliye ye line zaroori hai
const PORT = process.env.PORT || 3000;

// CORS allow karta hai ki aapka GitHub Pages wala frontend is server se data le sake
app.use(cors());
app.use(express.json());

// Server check karne ke liye ek simple route
app.get('/', (req, res) => {
    res.send("🚀 JobPortal Backend is Running Live!");
});

// Real life mein ye data MongoDB ya MySQL se aayega
const usersDB = [
    {
        id: 1,
        email: "akash@dev.com",
        password: "123456",
        name: "Akash",
        location: "Agra, Uttar Pradesh",
        role: "Full-Stack Developer",
        stats: { applied: 42, views: 312, saved: 15 }
    }
];

// --- LOGIN API ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = usersDB.find(u => u.email === email && u.password === password);

    if (user) {
        res.json({ success: true, token: `token-secret-${user.id}` });
    } else {
        res.status(401).json({ success: false, message: "Invalid email or password" });
    }
});

// --- PROFILE API ---
app.get('/api/profile', (req, res) => {
    const authHeader = req.headers['authorization'];

    if (authHeader && authHeader.startsWith("Bearer token-secret-")) {
        const userId = parseInt(authHeader.split('-')[2]);
        const user = usersDB.find(u => u.id === userId);

        if (user) {
            const { password, ...safeUserData } = user; // Password hata do response se
            res.json({ success: true, user: safeUserData });
        } else {
            res.status(404).json({ success: false, message: "User not found" });
        }
    } else {
        res.status(403).json({ success: false, message: "Unauthorized access" });
    }
});

// Server Start Karein
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
