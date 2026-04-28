require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

// ==========================================
// 1. MONGODB CONNECTION (Secure via .env)
// ==========================================
const MONGO_URI = process.env.MONGO_URI; 

if (!MONGO_URI) {
    console.error("❌ MONGO_URI is missing in Environment Variables!");
} else {
    mongoose.connect(MONGO_URI)
      .then(() => console.log('✅ MongoDB Connected Successfully!'))
      .catch(err => console.log('❌ MongoDB Connection Error: ', err));
}

// ==========================================
// 2. DATABASE SCHEMAS
// ==========================================
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true }, 
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, default: "Worker" }, 
    isVerified: { type: Boolean, default: false },
    otp: { type: String }, 
    assignedCompany: { type: String, default: "Not Assigned" }, 
    
    // Bank & Personal Data
    bankAccount: { type: String, default: "" },
    ifscCode: { type: String, default: "" },
    panNumber: { type: String, default: "" },
    aadharNumber: { type: String, default: "" },
    uanNumber: { type: String, default: "" },
});

const User = mongoose.model('User', UserSchema);

// ==========================================
// 3. EMAIL OTP SETUP (Secure via .env)
// ==========================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // e.g., your-email@gmail.com
        pass: process.env.EMAIL_PASS  // e.g., your-app-password
    }
});

// ==========================================
// 4. APIs: SIGNUP & OTP VERIFICATION
// ==========================================

// SIGNUP API
app.post('/api/signup', async (req, res) => {
    const { username, email, password, name } = req.body;

    try {
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            if (existingUser.username === username) {
                return res.status(400).json({ success: false, message: "Bhai ye Username pehle se kisi ne le liya hai, koi dusra try karo!" });
            }
            return res.status(400).json({ success: false, message: "Email already registered." });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            username, email, name,
            password: hashedPassword,
            otp: otp
        });

        await newUser.save();

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'JobGram - Verify Your Account',
            text: `Welcome to JobGram, ${name}! Your OTP for verification is: ${otp}`
        });

        res.json({ success: true, message: "Signup successful! Check email for OTP." });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error });
    }
});

// VERIFY OTP API
app.post('/api/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ success: false, message: "User not found." });

        if (user.otp === otp) {
            user.isVerified = true;
            user.otp = ""; 
            await user.save();
            res.json({ success: true, message: "Account verified successfully! You can login now." });
        } else {
            res.status(400).json({ success: false, message: "Invalid OTP." });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ==========================================
// 5. APIs: FORGOT & RESET PASSWORD
// ==========================================

// FORGOT PASSWORD
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ success: false, message: "Ye email hamare record me nahi hai." });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.otp = otp; 
        await user.save();

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'JobGram - Password Reset OTP',
            text: `Hello ${user.name},\n\nYour OTP to reset your password is: ${otp}\n\nAgar aapne ye request nahi ki hai, toh is email ko ignore karein.`
        });

        res.json({ success: true, message: "OTP sent to your email for password reset." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error while sending OTP." });
    }
});

// RESET PASSWORD
app.post('/api/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ success: false, message: "User not found." });

        if (user.otp === otp) {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            user.password = hashedPassword;
            user.otp = ""; 
            
            await user.save();
            res.json({ success: true, message: "Password reset successful! Ab aap naye password se login kar sakte hain." });
        } else {
            res.status(400).json({ success: false, message: "Invalid OTP. Kripya sahi OTP daalein." });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error while resetting password." });
    }
});

// ==========================================
// 6. LOGIN API
// ==========================================
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        
        if (!user) return res.status(400).json({ success: false, message: "Invalid Email." });
        if (!user.isVerified) return res.status(400).json({ success: false, message: "Please verify your account OTP first." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "Wrong Password." });

        // JWT_SECRET secure via .env
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

        res.json({ success: true, token, role: user.role, username: user.username });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ==========================================
// 7. ADMIN API: ASSIGN COMPANY TO USER
// ==========================================
app.post('/api/admin/assign-company', async (req, res) => {
    const { workerUsername, companyName } = req.body;

    try {
        const worker = await User.findOne({ username: workerUsername });
        if (!worker) return res.status(404).json({ success: false, message: "Worker not found with this username." });

        worker.assignedCompany = companyName;
        await worker.save();

        res.json({ success: true, message: `${worker.name} is successfully assigned to ${companyName}` });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Server Start
app.listen(PORT, () => {
    console.log(`🚀 JobGram Backend is running on port ${PORT}`);
});
