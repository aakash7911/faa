const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); // JSON data read karne ke liye

// ==========================================
// 🗄️ IN-MEMORY DATABASE (Mock Data)
// Real project me ye MongoDB ya MySQL me hoga
// ==========================================

const db = {
    users: [
        {
            id: 1, email: "akash@dev.com", password: "password123", name: "Akash", role: "Full-Stack Developer", location: "Agra, UP", 
            bankAccount: "30450000100", ifscCode: "SBIN0001", panNumber: "ABCDE1234F", aadharNumber: "1234 5678 9012", uanNumber: "100111222",
            stats: { applied: 12, views: 45, saved: 5 }
        },
        {
            id: 2, email: "admin@jobgram.com", password: "admin", name: "Super Admin", role: "Admin", location: "Delhi, India",
            bankAccount: "", ifscCode: "", panNumber: "", aadharNumber: "", uanNumber: "",
            stats: { applied: 0, views: 0, saved: 0 }
        },
        {
            id: 3, email: "rahul@test.com", password: "123", name: "Rahul Singh", role: "Machine Operator", location: "Noida, UP",
            bankAccount: "98765432100", ifscCode: "HDFC0002", panNumber: "QWERT9876X", aadharNumber: "9876 5432 1098", uanNumber: "200333444",
            stats: { applied: 2, views: 10, saved: 1 }
        }
    ],
    jobs: {
        permanent: [],
        adhoc: []
    },
    payouts: [
        // Fake previous data to populate the Admin Dashboard
        { userId: 3, jobType: "Permanent", presentCount: "22 Days", calculatedSalary: 14500, status: "Cleared" },
        { userId: 1, jobType: "Adhoc", presentCount: "4 Shifts (12 Hrs)", calculatedSalary: 2400, status: "Pending" }
    ]
};

// ==========================================
// 🛡️ AUTHENTICATION MIDDLEWARE
// ==========================================
// Check karta hai ki token valid hai ya nahi
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(' ')[1];
        const userId = parseInt(token.replace('fake-token-', '')); // Extract ID from token
        
        const user = db.users.find(u => u.id === userId);
        if (user) {
            req.user = user; // Attach user to request
            next();
        } else {
            res.status(401).json({ success: false, message: "Invalid Token. User not found." });
        }
    } else {
        res.status(401).json({ success: false, message: "Unauthorized. No token provided." });
    }
};

// ==========================================
// 🚀 ROUTES / APIs
// ==========================================

// 1. Health Check
app.get('/', (req, res) => {
    res.send("🚀 JobGram Backend is LIVE!");
});

// 2. Login API
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = db.users.find(u => u.email === email && u.password === password);

    if (user) {
        // Real app me yahan JWT banta hai
        const token = `fake-token-${user.id}`;
        res.json({ success: true, message: "Login successful", token: token });
    } else {
        res.status(401).json({ success: false, message: "Invalid email or password" });
    }
});

// 3. Get User Profile API
app.get('/api/profile', authenticate, (req, res) => {
    // Password hide karke baaki data bhej do
    const { password, ...safeUserData } = req.user;
    res.json({ success: true, user: safeUserData });
});

// 4. Fetch Explore News (Mock API)
app.get('/api/news', authenticate, (req, res) => {
    res.json({ success: true, news: [{ title: "New IT Park opening in Agra", date: "Today" }] });
});

// 5. Jobs APIs (Get & Post)
app.get('/api/jobs/permanent', (req, res) => {
    res.json({ success: true, jobs: db.jobs.permanent });
});

app.post('/api/jobs/permanent', authenticate, (req, res) => {
    if(req.user.role !== 'Admin') return res.status(403).json({success: false, message: "Only admin can post jobs."});
    
    const newJob = { id: Date.now(), ...req.body, createdAt: new Date() };
    db.jobs.permanent.push(newJob);
    res.json({ success: true, message: "Permanent Job Posted Successfully", job: newJob });
});

app.get('/api/jobs/adhoc', (req, res) => {
    res.json({ success: true, jobs: db.jobs.adhoc });
});

app.post('/api/jobs/adhoc', authenticate, (req, res) => {
    if(req.user.role !== 'Admin') return res.status(403).json({success: false, message: "Only admin can post jobs."});
    
    const newJob = { id: Date.now(), ...req.body, createdAt: new Date() };
    db.jobs.adhoc.push(newJob);
    res.json({ success: true, message: "Adhoc Job Posted Successfully", job: newJob });
});

// 6. QR Punch Attendance API
app.post('/api/punch', authenticate, (req, res) => {
    const { qr_code } = req.body;
    
    // Yahan hum check karte ki QR database me valid hai ya nahi
    if(!qr_code) return res.status(400).json({ success: false, message: "Invalid QR Code" });

    // Log the punch (dummy logic: increment present count)
    // Real app me time calculate hota Punch IN aur Punch OUT ka
    let userPayout = db.payouts.find(p => p.userId === req.user.id);
    
    if(!userPayout) {
        // Naya record banao
        userPayout = { userId: req.user.id, jobType: "Adhoc", presentCount: "1 Shift (8 Hrs)", calculatedSalary: 400, status: "Pending" };
        db.payouts.push(userPayout);
    } else {
        // Update existing (Just logic simulation)
        userPayout.calculatedSalary += 400;
        userPayout.presentCount = parseInt(userPayout.presentCount) + 1 + " Shifts";
    }

    res.json({ success: true, message: "Attendance Marked Successfully via QR!" });
});

// 7. Get Work History (For User App)
app.get('/api/userdata/history', authenticate, (req, res) => {
    const { type } = req.query; // 'adhoc' or 'permanent'
    const history = db.payouts.filter(p => p.userId === req.user.id && p.jobType.toLowerCase() === type.toLowerCase());
    
    res.json({ success: true, history: history });
});

// 8. Admin Payouts & Billing API (For Excel Export)
app.get('/api/admin/payouts', authenticate, (req, res) => {
    if(req.user.role !== 'Admin') return res.status(403).json({success: false, message: "Admin access required."});

    // Combine Payout Data with User Bank Details
    const fullPayoutData = db.payouts.map(payout => {
        const user = db.users.find(u => u.id === payout.userId);
        return {
            name: user ? user.name : "Unknown",
            jobType: payout.jobType,
            presentCount: payout.presentCount,
            calculatedSalary: payout.calculatedSalary,
            status: payout.status,
            bankAccount: user ? user.bankAccount : "N/A",
            ifscCode: user ? user.ifscCode : "N/A",
            panNumber: user ? user.panNumber : "N/A",
            aadharNumber: user ? user.aadharNumber : "N/A",
            uanNumber: user ? user.uanNumber : "N/A"
        };
    });

    res.json({ success: true, payouts: fullPayoutData });
});

// ==========================================
// 🎧 START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 JobGram Secure Backend is running on port ${PORT}`);
});
