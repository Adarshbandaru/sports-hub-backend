// server.js - Enhanced SportsHub Backend with Full Admin Panel Support
const jwt = require('jsonwebtoken');
require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({ 
  cloud_name: process.env.CLOUD_NAME, 
  api_key: process.env.API_KEY, 
  api_secret: process.env.API_SECRET 
});

// --- Imports ---
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const http = require('http');
const { WebSocketServer } = require('ws');
const { MongoClient, ObjectId } = require('mongodb');

// --- JWT Configuration ---
const JWT_SECRET = process.env.JWT_SECRET || 'sportsHub-fallback-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'sportsHub-refresh-secret-key-change-in-production';
const JWT_EXPIRES_IN = '15m';
const JWT_REFRESH_EXPIRES_IN = '7d';

// --- App Setup ---
const app = express();
const port = process.env.PORT || 3000;

// --- MongoDB Atlas Configuration ---
const MONGODB_URI = 'mongodb+srv://sportsHubAdmin:Adarsh6708@csports-hub-cluster.on9cz2d.mongodb.net/sports-hub-db?retryWrites=true&w=majority&appName=Csports-hub-cluster';
const DB_NAME = 'sports-hub-db';

let db;
let usersCollection;
let eventsCollection;
let chatMessagesCollection;
let adminsCollection;
let categoriesCollection;
let refreshTokensCollection;
let notificationsHistoryCollection;
let systemSettingsCollection;

// --- WebSocket Client Management ---
const notificationClients = new Map();

// --- Database Connection ---
async function connectToDatabase() {
    try {
        const client = new MongoClient(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        await client.connect();
        console.log('Successfully connected to MongoDB Atlas!');
        
        db = client.db(DB_NAME);
        usersCollection = db.collection('users');
        eventsCollection = db.collection('events');
        chatMessagesCollection = db.collection('chatMessages');
        adminsCollection = db.collection('admins');
        categoriesCollection = db.collection('categories');
        refreshTokensCollection = db.collection('refreshTokens');
        notificationsHistoryCollection = db.collection('notificationsHistory');
        systemSettingsCollection = db.collection('systemSettings');
        
        await createIndexes();
        await initializeDefaultEvents();
        await initializeDefaultAdmin();
        await initializeDefaultCategories();
        await initializeSystemSettings();
        
        return true;
    } catch (error) {
        console.error('Failed to connect to MongoDB Atlas:', error);
        process.exit(1);
    }
}

async function createIndexes() {
    try {
        await usersCollection.createIndex({ email: 1 }, { unique: true });
        await usersCollection.createIndex({ studentID: 1 }, { unique: true });
        await eventsCollection.createIndex({ id: 1 }, { unique: true });
        await chatMessagesCollection.createIndex({ teamName: 1 });
        await chatMessagesCollection.createIndex({ timestamp: 1 });
        await adminsCollection.createIndex({ email: 1 }, { unique: true });
        await refreshTokensCollection.createIndex({ token: 1 }, { unique: true });
        await refreshTokensCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await categoriesCollection.createIndex({ name: 1 }, { unique: true });
        await notificationsHistoryCollection.createIndex({ sentAt: 1 });
        await notificationsHistoryCollection.createIndex({ target: 1 });
        console.log('Database indexes created successfully');
    } catch (error) {
        console.log('Some indexes may already exist:', error.message);
    }
}

async function initializeDefaultAdmin() {
    try {
        const adminCount = await adminsCollection.countDocuments();
        if (adminCount === 0) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('admin123', salt);
            
            const defaultAdmin = {
                email: 'admin@college.edu',
                password: hashedPassword,
                fullName: 'SportsHub Administrator',
                role: 'super_admin',
                createdAt: new Date()
            };
            
            await adminsCollection.insertOne(defaultAdmin);
            console.log('Default admin created: admin@college.edu / admin123');
        }
    } catch (error) {
        console.error('Error creating default admin:', error);
    }
}

async function initializeDefaultCategories() {
    try {
        const categoryCount = await categoriesCollection.countDocuments();
        if (categoryCount === 0) {
            const defaultCategories = [
                { name: 'Cricket', icon: '🏏', createdAt: new Date() },
                { name: 'Football', icon: '⚽', createdAt: new Date() },
                { name: 'Badminton', icon: '🏸', createdAt: new Date() },
                { name: 'Table Tennis', icon: '🏓', createdAt: new Date() },
                { name: 'Basketball', icon: '🏀', createdAt: new Date() },
                { name: 'Volleyball', icon: '🏐', createdAt: new Date() }
            ];
            
            await categoriesCollection.insertMany(defaultCategories);
            console.log('Default categories created');
        }
    } catch (error) {
        console.error('Error creating default categories:', error);
    }
}

async function initializeSystemSettings() {
    try {
        const settingsCount = await systemSettingsCollection.countDocuments();
        if (settingsCount === 0) {
            const defaultSettings = {
                appName: 'SportsHub',
                maxTeamSize: 11,
                emailDomain: '@college.edu',
                eventDuration: 2,
                minPasswordLength: 6,
                sessionTimeout: 30,
                requireEmailVerification: false,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            await systemSettingsCollection.insertOne(defaultSettings);
            console.log('Default system settings created');
        }
    } catch (error) {
        console.error('Error creating default settings:', error);
    }
}

async function initializeDefaultEvents() {
    try {
        const eventCount = await eventsCollection.countDocuments();
        if (eventCount === 0) {
            const defaultEvents = [
                {
                    id: 1,
                    name: "Cricket Intercollege Championship",
                    date: "2025-10-12",
                    location: "Main Cricket Ground",
                    time: "09:00 AM",
                    category: "Cricket",
                    emoji: "🏏",
                    difficulty: "Advanced",
                    description: "Annual intercollege cricket championship featuring top teams from across the region.",
                    team: {
                        name: "Warriors",
                        maxSlots: 11,
                        members: ["Aditya Kumar"],
                        requirements: {
                            minRegNumber: "2020",
                            minExperience: 2
                        }
                    },
                    createdAt: new Date()
                },
                {
                    id: 2,
                    name: "Annual Badminton Tournament",
                    date: "2025-11-08",
                    location: "Indoor Sports Hall",
                    time: "10:00 AM",
                    category: "Badminton",
                    emoji: "🏸",
                    difficulty: "Intermediate",
                    description: "Singles and doubles badminton tournament open to all skill levels.",
                    team: {
                        name: "Shuttlers",
                        maxSlots: 4,
                        members: ["Rahul Patel"],
                        requirements: {
                            minRegNumber: "2021",
                            minExperience: 1
                        }
                    },
                    createdAt: new Date()
                },
                {
                    id: 3,
                    name: "Football Premier League",
                    date: "2025-12-02",
                    location: "Central Stadium",
                    time: "03:30 PM",
                    category: "Football",
                    emoji: "⚽",
                    difficulty: "Expert",
                    description: "Professional-level football league with experienced players only.",
                    team: {
                        name: "Strikers United",
                        maxSlots: 11,
                        members: ["Krishna Rao"],
                        requirements: {
                            minRegNumber: "2019",
                            minExperience: 3
                        }
                    },
                    createdAt: new Date()
                },
                {
                    id: 4,
                    name: "Table Tennis Championship",
                    date: "2025-12-15",
                    location: "TT Arena",
                    time: "12:30 PM",
                    category: "Table Tennis",
                    emoji: "🏓",
                    difficulty: "Intermediate",
                    description: "Fast-paced table tennis tournament with singles and doubles categories.",
                    team: {
                        name: "Spin Masters",
                        maxSlots: 4,
                        members: ["Priya Jain"],
                        requirements: {
                            minRegNumber: "2021",
                            minExperience: 1
                        }
                    },
                    createdAt: new Date()
                }
            ];
            
            await eventsCollection.insertMany(defaultEvents);
            console.log('Default events initialized in database');
        }
    } catch (error) {
        console.error('Error initializing default events:', error);
    }
}

// --- IMPROVED JWT HELPER FUNCTIONS ---
function generateTokens(user) {
    const payload = {
        id: user._id.toString(),
        email: user.email,
        fullName: user.fullName,
        role: user.role || 'user'
    };
    
    const accessToken = jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN
    });
    
    const refreshToken = jwt.sign({ 
        id: user._id.toString(),
        tokenVersion: user.tokenVersion || 0 
    }, JWT_REFRESH_SECRET, {
        expiresIn: JWT_REFRESH_EXPIRES_IN
    });
    
    console.log('Tokens generated for user:', user.email);
    return { accessToken, refreshToken };
}

function verifyAccessToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return { success: true, data: decoded };
    } catch (error) {
        console.log('Access token verification failed:', error.message);
        return { success: false, error: error.message };
    }
}

function verifyRefreshToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
        return { success: true, data: decoded };
    } catch (error) {
        console.log('Refresh token verification failed:', error.message);
        return { success: false, error: error.message };
    }
}

async function storeRefreshToken(userId, token) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    try {
        await refreshTokensCollection.insertOne({
            userId: userId,
            token: token,
            createdAt: new Date(),
            expiresAt: expiresAt
        });
    } catch (error) {
        console.error('Error storing refresh token:', error);
    }
}

async function removeRefreshToken(token) {
    try {
        await refreshTokensCollection.deleteOne({ token });
    } catch (error) {
        console.error('Error removing refresh token:', error);
    }
}

async function isRefreshTokenValid(token) {
    try {
        const storedToken = await refreshTokensCollection.findOne({ token });
        return !!storedToken;
    } catch (error) {
        console.error('Error checking refresh token validity:', error);
        return false;
    }
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }
    
    const result = verifyAccessToken(token);
    if (!result.success) {
        if (result.error.includes('expired')) {
            return res.status(401).json({ message: 'Token expired', code: 'TOKEN_EXPIRED' });
        }
        return res.status(403).json({ message: 'Invalid token' });
    }
    
    req.user = result.data;
    next();
}

function authenticateAdmin(req, res, next) {
    authenticateToken(req, res, () => {
        if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }
        next();
    });
}

// --- Middleware ---
app.use(cors({
    origin: [
        'http://localhost:3000',
        'https://sportsmanagementsystem.netlify.app'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
    credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../sports-hub-frontend')));

// --- NOTIFICATION FUNCTIONS ---
function sendRealTimeNotification(userEmail, notification) {
    const client = notificationClients.get(userEmail);
    if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
            type: 'notification',
            notification: notification
        }));
        console.log(`Real-time notification sent to: ${userEmail}`);
        return true;
    }
    return false;
}

async function saveNotificationHistory(notificationData, sentCount, targetUsers) {
    try {
        const historyRecord = {
            title: notificationData.title,
            message: notificationData.message,
            icon: notificationData.icon,
            target: notificationData.target,
            priority: notificationData.priority || 'normal',
            sentCount: sentCount,
            targetUsers: targetUsers,
            sentAt: new Date(),
            sentBy: notificationData.sentBy || 'System'
        };
        
        await notificationsHistoryCollection.insertOne(historyRecord);
    } catch (error) {
        console.error('Error saving notification history:', error);
    }
}

// --- API Routes ---
app.get('/', (req, res) => {
    res.json({ 
        message: 'SportsHub Backend API', 
        status: 'Running',
        version: '3.0.0',
        timestamp: new Date(),
        endpoints: {
            events: '/api/events',
            auth: {
                register: 'POST /api/register',
                login: 'POST /api/login',
                refresh: 'POST /api/auth/refresh',
                logout: 'POST /api/logout'
            },
            admin: '/api/admin/*',
            health: '/health'
        }
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

// Register new user
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, studentID, email, password } = req.body;
        
        if (!fullName || !studentID || !email || !password) {
            return res.status(400).json({ message: "All fields are required." });
        }
        
        const existingUser = await usersCollection.findOne({
            $or: [{ email: email }, { studentID: studentID }]
        });
        
        if (existingUser) {
            if (existingUser.email === email) {
                return res.status(400).json({ message: "User with this email already exists." });
            } else {
                return res.status(400).json({ message: "User with this student ID already exists." });
            }
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const newUser = {
            fullName,
            studentID,
            email,
            password: hashedPassword,
            mobileNumber: "",
            avatarUrl: null,
            joinedTeams: [],
            tokenVersion: 0,
            status: 'active',
            notifications: [{
                icon: "🎉",
                title: `Welcome ${fullName}!`,
                body: "Your account has been created successfully. Explore events and join the fun.",
                timestamp: new Date(),
                read: false
            }],
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        const result = await usersCollection.insertOne(newUser);
        console.log('New user registered:', result.insertedId);
        
        res.status(201).json({ message: "User registered successfully!" });
    } catch (error) {
        console.error('Registration error:', error);
        
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({ 
                message: `User with this ${field} already exists.` 
            });
        }
        
        res.status(500).json({ message: "Server error during registration." });
    }
});

// Login user
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required." });
        }
        
        const user = await usersCollection.findOne({ email: email });
        if (!user) {
            return res.status(400).json({ message: "Invalid credentials." });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials." });
        }
        
        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user);
        
        // Store refresh token
        await storeRefreshToken(user._id.toString(), refreshToken);
        
        await usersCollection.updateOne(
            { _id: user._id },
            { 
                $set: { lastLogin: new Date() },
                $push: {
                    notifications: {
                        $each: [{
                            icon: "👋",
                            title: `Welcome back, ${user.fullName}!`,
                            body: "Ready to join some exciting tournaments?",
                            timestamp: new Date(),
                            read: false
                        }],
                        $slice: -10
                    }
                }
            }
        );
        
        const userToReturn = {
            id: user._id,
            fullName: user.fullName,
            email: user.email,
            studentID: user.studentID,
            mobileNumber: user.mobileNumber || "",
            avatarUrl: user.avatarUrl,
            joinedTeams: user.joinedTeams || [],
            notifications: user.notifications || []
        };
        
        res.status(200).json({ 
            message: "Login successful!", 
            user: userToReturn,
            accessToken: accessToken,
            refreshToken: refreshToken
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: "Server error during login." });
    }
});

// Token refresh endpoint
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(401).json({ message: 'Refresh token required' });
        }
        
        const verifyResult = verifyRefreshToken(refreshToken);
        if (!verifyResult.success) {
            return res.status(403).json({ message: 'Invalid refresh token' });
        }
        
        const isValid = await isRefreshTokenValid(refreshToken);
        if (!isValid) {
            return res.status(403).json({ message: 'Refresh token not found or expired' });
        }
        
        const user = await usersCollection.findOne({ _id: new ObjectId(verifyResult.data.id) });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        if (user.tokenVersion !== verifyResult.data.tokenVersion) {
            return res.status(403).json({ message: 'Token version mismatch' });
        }
        
        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
        
        await removeRefreshToken(refreshToken);
        await storeRefreshToken(user._id.toString(), newRefreshToken);
        
        res.json({
            accessToken: accessToken,
            refreshToken: newRefreshToken
        });
        
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ message: 'Failed to refresh token' });
    }
});

// Logout
app.post('/api/logout', authenticateToken, async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (refreshToken) {
            await removeRefreshToken(refreshToken);
        }
        
        console.log(`User ${req.user.fullName} logged out`);
        res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ message: 'Failed to logout' });
    }
});

// Avatar upload
app.post('/api/profile/avatar-upload', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }

        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: "sports-hub-avatars"
        });
        
        await usersCollection.updateOne(
            { email: req.user.email },
            { $set: { avatarUrl: result.secure_url } }
        );

        console.log(`Avatar updated for ${req.user.email}`);
        res.status(200).json({ 
            message: "Avatar updated successfully!", 
            avatarUrl: result.secure_url
        });

    } catch (error) {
        console.error('Avatar upload error:', error);
        res.status(500).json({ message: 'Failed to upload avatar.' });
    }
});

// Mark notifications as read
app.post('/api/notifications/mark-read', authenticateToken, async (req, res) => {
    try {
        const result = await usersCollection.updateOne(
            { email: req.user.email },
            { $set: { "notifications.$[].read": true } }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        
        console.log(`Marked notifications as read for ${req.user.email}`);
        res.status(200).json({ message: 'Notifications marked as read.' });
    } catch (error) {
        console.error('Error marking notifications as read:', error);
        res.status(500).json({ message: 'Failed to mark notifications as read.' });
    }
});

// Get all events
app.get('/api/events', async (req, res) => {
    try {
        const events = await eventsCollection.find({}).sort({ id: 1 }).toArray();
        
        const eventsWithIds = events.map((event, index) => {
            if (!event.id && event.id !== 0) {
                console.warn(`Event missing ID, assigning ID: ${index + 1}`, event.name);
                event.id = index + 1;
            }
            return event;
        });
        
        console.log(`Returning ${eventsWithIds.length} events to frontend`);
        res.json(eventsWithIds);
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ message: 'Failed to fetch events' });
    }
});

// Join event team
app.post('/api/events/:eventId/join', authenticateToken, async (req, res) => {
    try {
        const { eventId } = req.params;
        const { userRegNumber, userExperience } = req.body;
        
        const userFullName = req.user.fullName;
        
        console.log('Join request - Event ID:', eventId);
        console.log('Join request - User from token:', userFullName);
        
        if (!userRegNumber || userExperience === undefined) {
            return res.status(400).json({ message: 'Registration number and experience are required.' });
        }
        
        const eventIdInt = parseInt(eventId);
        if (isNaN(eventIdInt)) {
            return res.status(400).json({ message: 'Invalid event ID format.' });
        }
        
        const event = await eventsCollection.findOne({ id: eventIdInt });
        
        if (!event) {
            return res.status(404).json({ message: 'Event not found.' });
        }
        
        if (!event.team) {
            return res.status(404).json({ message: 'Team information not found for this event.' });
        }
        
        if (event.team.members.includes(userFullName)) {
            return res.status(400).json({ message: 'You are already a member of this team.' });
        }
        
        const { requirements } = event.team;
        const userRegYear = parseInt(userRegNumber.substring(0, 4));
        const minRegYear = parseInt(requirements.minRegNumber);
        
        if (userRegYear > minRegYear) {
            return res.status(400).json({ 
                message: `Application rejected. Minimum registration year is ${requirements.minRegNumber}.` 
            });
        }
        
        if (userExperience < requirements.minExperience) {
            return res.status(400).json({ 
                message: `Application rejected. Minimum ${requirements.minExperience} years of experience required.` 
            });
        }
        
        if (event.team.members.length >= event.team.maxSlots) {
            return res.status(400).json({ message: 'Sorry, this team is full.' });
        }
        
        const updateResult = await eventsCollection.updateOne(
            { id: eventIdInt },
            { 
                $push: { "team.members": userFullName },
                $set: { updatedAt: new Date() }
            }
        );
        
        if (updateResult.matchedCount === 0) {
            return res.status(404).json({ message: 'Failed to update event.' });
        }
        
        await usersCollection.updateOne(
            { fullName: userFullName },
            { 
                $push: { 
                    joinedTeams: {
                        eventId: eventIdInt,
                        eventName: event.name,
                        teamName: event.team.name,
                        emoji: event.emoji,
                        joinedAt: new Date()
                    }
                },
                $set: { updatedAt: new Date() }
            }
        );
        
        console.log(`${userFullName} successfully joined ${event.team.name}`);
        res.json({ message: `Successfully joined ${event.team.name}!` });
        
    } catch (error) {
        console.error('Join team error:', error);
        res.status(500).json({ message: 'Failed to join team. Please try again.' });
    }
});

// Leave team
app.post('/api/teams/leave', authenticateToken, async (req, res) => {
    try {
        const { teamName } = req.body;
        const userFullName = req.user.fullName;
        
        if (!teamName) {
            return res.status(400).json({ message: "Team name is required." });
        }
        
        const updateResult = await eventsCollection.updateOne(
            { "team.name": teamName },
            { 
                $pull: { "team.members": userFullName },
                $set: { updatedAt: new Date() }
            }
        );
        
        if (updateResult.matchedCount === 0) {
            return res.status(404).json({ message: 'Team not found.' });
        }
        
        if (updateResult.modifiedCount === 0) {
            return res.status(400).json({ message: 'You were not a member of this team.' });
        }
        
        await usersCollection.updateOne(
            { fullName: userFullName },
            { 
                $pull: { joinedTeams: { teamName: teamName } },
                $set: { updatedAt: new Date() }
            }
        );
        
        console.log(`${userFullName} left ${teamName}`);
        res.json({ message: `You have left ${teamName}.` });
    } catch (error) {
        console.error('Leave team error:', error);
        res.status(500).json({ message: 'Failed to leave team.' });
    }
});

// Update user profile
app.post('/api/profile/update', authenticateToken, async (req, res) => {
    try {
        const { fullName, mobileNumber } = req.body;
        
        if (!fullName) {
            return res.status(400).json({ message: "Full name is required." });
        }
        
        const updateResult = await usersCollection.findOneAndUpdate(
            { email: req.user.email },
            { 
                $set: { 
                    fullName: fullName,
                    mobileNumber: mobileNumber || "",
                    updatedAt: new Date()
                }
            },
            { returnDocument: 'after' }
        );
        
        if (!updateResult.value) {
            return res.status(404).json({ message: "User not found." });
        }
        
        const user = updateResult.value;
        const userToReturn = {
            id: user._id,
            fullName: user.fullName,
            email: user.email,
            studentID: user.studentID,
            mobileNumber: user.mobileNumber
        };
        
        console.log("Profile updated for:", req.user.email);
        res.status(200).json({ message: "Profile updated successfully!", user: userToReturn });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: "Failed to update profile." });
    }
});

// Get chat messages for a team
app.get('/api/chat/:teamName', authenticateToken, async (req, res) => {
    try {
        const { teamName } = req.params;
        const messages = await chatMessagesCollection
            .find({ teamName: teamName })
            .sort({ timestamp: 1 })
            .limit(100)
            .toArray();
        
        res.json(messages);
    } catch (error) {
        console.error('Error fetching chat messages:', error);
        res.status(500).json({ message: 'Failed to fetch chat messages' });
    }
});

// --- ENHANCED ADMIN ROUTES ---
app.get('/admin', (req, res) => {
    res.send(`
        <html>
            <head><title>SportsHub Admin</title></head>
            <body>
                <h1>SportsHub Admin Panel</h1>
                <p>Admin functionality available via API endpoints.</p>
                <p>Default Admin: admin@college.edu / admin123</p>
            </body>
        </html>
    `);
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required." });
        }
        
        const admin = await adminsCollection.findOne({ email: email });
        if (!admin) {
            return res.status(400).json({ message: "Invalid admin credentials." });
        }
        
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid admin credentials." });
        }
        
        const { accessToken, refreshToken } = generateTokens(admin);
        await storeRefreshToken(admin._id.toString(), refreshToken);
        
        await adminsCollection.updateOne(
            { _id: admin._id },
            { $set: { lastLogin: new Date() } }
        );
        
        const adminToReturn = {
            id: admin._id,
            email: admin.email,
            fullName: admin.fullName,
            role: admin.role
        };
        
        console.log('Admin logged in:', admin.email);
        res.status(200).json({ 
            message: "Admin login successful!", 
            admin: adminToReturn,
            accessToken: accessToken,
            refreshToken: refreshToken
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ message: "Server error during admin login." });
    }
});

// Get all users (Admin only)
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const users = await usersCollection
            .find({}, { projection: { password: 0 } })
            .sort({ createdAt: -1 })
            .toArray();
        
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Failed to fetch users' });
    }
});

// Get all events (Admin only)
app.get('/api/admin/events', authenticateAdmin, async (req, res) => {
    try {
        const events = await eventsCollection.find({}).sort({ id: 1 }).toArray();
        res.json(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ message: 'Failed to fetch events' });
    }
});

// Create new event (Admin only)
app.post('/api/admin/events', authenticateAdmin, async (req, res) => {
    try {
        const eventData = req.body;
        
        if (!eventData.name || !eventData.teamName) {
            return res.status(400).json({ message: 'Event Name and Team Name are required.' });
        }

        // Get next event ID
        const lastEvent = await eventsCollection.findOne({}, { sort: { id: -1 } });
        const nextId = lastEvent ? lastEvent.id + 1 : 1;

        const newEvent = {
            id: nextId,
            name: eventData.name,
            date: eventData.date,
            location: eventData.location,
            time: eventData.time,
            category: eventData.category,
            emoji: eventData.emoji,
            difficulty: eventData.difficulty,
            description: eventData.description || '',
            team: {
                name: eventData.teamName,
                maxSlots: parseInt(eventData.maxSlots),
                members: [],
                requirements: {
                    minRegNumber: eventData.minRegYear,
                    minExperience: parseInt(eventData.minExperience)
                }
            },
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await eventsCollection.insertOne(newEvent);
        console.log('Admin created new event:', newEvent.name);
        res.status(201).json({ message: 'Event created successfully!', event: newEvent });

    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).json({ message: 'Failed to create event.' });
    }
});

// Update event (Admin only)
app.put('/api/admin/events/:eventId', authenticateAdmin, async (req, res) => {
    try {
        const eventId = parseInt(req.params.eventId);
        const eventData = req.body;
        
        if (isNaN(eventId)) {
            return res.status(400).json({ message: 'Invalid Event ID.' });
        }

        if (!eventData.name || !eventData.teamName) {
            return res.status(400).json({ message: 'Event Name and Team Name are required.' });
        }

        // Get existing event to preserve team members
        const existingEvent = await eventsCollection.findOne({ id: eventId });
        if (!existingEvent) {
            return res.status(404).json({ message: 'Event not found.' });
        }

        const updatedEvent = {
            name: eventData.name,
            date: eventData.date,
            location: eventData.location,
            time: eventData.time,
            category: eventData.category,
            emoji: eventData.emoji,
            difficulty: eventData.difficulty,
            description: eventData.description || '',
            team: {
                name: eventData.teamName,
                maxSlots: parseInt(eventData.maxSlots),
                members: existingEvent.team ? existingEvent.team.members : [],
                requirements: {
                    minRegNumber: eventData.minRegYear,
                    minExperience: parseInt(eventData.minExperience)
                }
            },
            updatedAt: new Date()
        };

        const result = await eventsCollection.updateOne(
            { id: eventId },
            { $set: updatedEvent }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Event not found.' });
        }

        console.log('Admin updated event:', eventData.name);
        res.status(200).json({ message: 'Event updated successfully!' });

    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).json({ message: 'Failed to update event.' });
    }
});

// Delete event (Admin only)
app.delete('/api/admin/events/:eventId', authenticateAdmin, async (req, res) => {
    try {
        const eventId = parseInt(req.params.eventId);
        if (isNaN(eventId)) {
            return res.status(400).json({ message: 'Invalid Event ID.' });
        }

        // First get the event to find team members
        const event = await eventsCollection.findOne({ id: eventId });
        if (!event) {
            return res.status(404).json({ message: 'Event not found.' });
        }

        // Remove this event from users' joinedTeams
        if (event.team && event.team.members.length > 0) {
            await usersCollection.updateMany(
                { "joinedTeams.eventId": eventId },
                { $pull: { joinedTeams: { eventId: eventId } } }
            );
        }

        // Delete the event
        const result = await eventsCollection.deleteOne({ id: eventId });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Event not found.' });
        }
        
        console.log('Admin deleted event with ID:', eventId);
        res.status(200).json({ message: 'Event deleted successfully.' });

    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({ message: 'Failed to delete event.' });
    }
});

// Update user (Admin only)
app.put('/api/admin/users/:userId', authenticateAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const userData = req.body;
        
        if (!ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Invalid User ID.' });
        }

        const updateData = {
            fullName: userData.fullName,
            studentID: userData.studentID,
            email: userData.email,
            mobileNumber: userData.mobileNumber || '',
            status: userData.status || 'active',
            updatedAt: new Date()
        };

        const result = await usersCollection.updateOne(
            { _id: new ObjectId(userId) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        console.log('Admin updated user:', userData.fullName);
        res.status(200).json({ message: 'User updated successfully!' });

    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'Failed to update user.' });
    }
});

// Delete user (Admin only)
app.delete('/api/admin/users/:userId', authenticateAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Invalid User ID.' });
        }

        // Get user first to find their full name
        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Remove user from all teams
        await eventsCollection.updateMany(
            { "team.members": user.fullName },
            { $pull: { "team.members": user.fullName } }
        );

        // Delete the user
        const result = await usersCollection.deleteOne({ _id: new ObjectId(userId) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        
        console.log('Admin deleted user:', user.fullName);
        res.status(200).json({ message: 'User deleted successfully.' });

    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ message: 'Failed to delete user.' });
    }
});

// Reset user password (Admin only)
app.post('/api/admin/users/:userId/reset-password', authenticateAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Invalid User ID.' });
        }

        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Generate temporary password
        const tempPassword = 'temp' + Math.random().toString(36).substring(2, 8);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(tempPassword, salt);

        await usersCollection.updateOne(
            { _id: new ObjectId(userId) },
            { 
                $set: { 
                    password: hashedPassword,
                    tokenVersion: (user.tokenVersion || 0) + 1, // Invalidate all existing tokens
                    updatedAt: new Date()
                }
            }
        );

        // In a real app, you would send this password via email
        console.log(`Password reset for ${user.email}: ${tempPassword}`);
        
        res.status(200).json({ 
            message: 'Password reset successfully! Temporary password sent to user email.',
            tempPassword: tempPassword // Remove this in production
        });

    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ message: 'Failed to reset password.' });
    }
});

// Get all categories (Admin only)
app.get('/api/admin/categories', authenticateAdmin, async (req, res) => {
    try {
        const categories = await categoriesCollection.find({}).sort({ name: 1 }).toArray();
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Failed to fetch categories' });
    }
});

// Create category (Admin only)
app.post('/api/admin/categories', authenticateAdmin, async (req, res) => {
    try {
        const { name, icon } = req.body;
        
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Category name is required.' });
        }

        const newCategory = {
            name: name.trim(),
            icon: icon || '🏷️',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await categoriesCollection.insertOne(newCategory);
        console.log('Admin created category:', name);
        res.status(201).json({ message: 'Category created successfully!', category: newCategory });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Category with this name already exists.' });
        }
        console.error('Error creating category:', error);
        res.status(500).json({ message: 'Failed to create category.' });
    }
});

// Update category (Admin only)
app.put('/api/admin/categories/:categoryId', authenticateAdmin, async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { name, icon } = req.body;
        
        if (!ObjectId.isValid(categoryId)) {
            return res.status(400).json({ message: 'Invalid Category ID.' });
        }

        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Category name is required.' });
        }

        const result = await categoriesCollection.updateOne(
            { _id: new ObjectId(categoryId) },
            { 
                $set: { 
                    name: name.trim(), 
                    icon: icon || '🏷️',
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Category not found.' });
        }

        console.log('Admin updated category:', name);
        res.status(200).json({ message: 'Category updated successfully!' });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Category with this name already exists.' });
        }
        console.error('Error updating category:', error);
        res.status(500).json({ message: 'Failed to update category.' });
    }
});

// Delete category (Admin only)
app.delete('/api/admin/categories/:categoryId', authenticateAdmin, async (req, res) => {
    try {
        const { categoryId } = req.params;
        
        if (!ObjectId.isValid(categoryId)) {
            return res.status(400).json({ message: 'Invalid Category ID.' });
        }

        const result = await categoriesCollection.deleteOne({ _id: new ObjectId(categoryId) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Category not found.' });
        }
        
        console.log('Admin deleted category with ID:', categoryId);
        res.status(200).json({ message: 'Category deleted successfully.' });

    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({ message: 'Failed to delete category.' });
    }
});

// Send notifications (Admin only)
app.post('/api/admin/notifications/send', authenticateAdmin, async (req, res) => {
    try {
        const { title, message, icon, target, priority, specificEmail, bulkEmails, scheduled, scheduleDateTime } = req.body;

        if (!title || !message || !icon || !target) {
            return res.status(400).json({ message: 'Missing required notification fields.' });
        }

        const newNotification = {
            icon,
            title,
            body: message,
            priority: priority || 'normal',
            timestamp: scheduled && scheduleDateTime ? new Date(scheduleDateTime) : new Date(),
            read: false
        };

        let targetQuery = {};
        let targetUsers = [];
        
        if (target === 'all') {
            targetQuery = {};
            const users = await usersCollection.find({}, { projection: { email: 1 } }).toArray();
            targetUsers = users.map(user => user.email);
        } else if (target === 'team-members') {
            targetQuery = { "joinedTeams.0": { $exists: true } };
            const users = await usersCollection.find(targetQuery, { projection: { email: 1 } }).toArray();
            targetUsers = users.map(user => user.email);
        } else if (target === 'non-team-members') {
            targetQuery = { $or: [{ joinedTeams: { $exists: false } }, { joinedTeams: { $size: 0 } }] };
            const users = await usersCollection.find(targetQuery, { projection: { email: 1 } }).toArray();
            targetUsers = users.map(user => user.email);
        } else if (target === 'specific') {
            if (!specificEmail) {
                return res.status(400).json({ message: 'Specific user email is required.' });
            }
            targetQuery = { email: specificEmail };
            targetUsers = [specificEmail];
        } else if (target === 'bulk') {
            if (!bulkEmails) {
                return res.status(400).json({ message: 'Bulk emails are required.' });
            }
            const emails = bulkEmails.split(',').map(email => email.trim()).filter(email => email);
            targetQuery = { email: { $in: emails } };
            targetUsers = emails;
        }

        // If scheduled, save the notification for later processing
        if (scheduled && scheduleDateTime) {
            // In a real app, you would use a job queue like Bull or Agenda
            // For now, we'll just save it and process immediately
            console.log(`Notification scheduled for ${scheduleDateTime}`);
        }

        const result = await usersCollection.updateMany(targetQuery, {
            $push: {
                notifications: {
                    $each: [newNotification],
                    $slice: -10
                }
            }
        });

        // Send real-time notifications
        let realTimeDelivered = 0;
        targetUsers.forEach(email => {
            if (sendRealTimeNotification(email, newNotification)) {
                realTimeDelivered++;
            }
        });

        // Save notification history
        await saveNotificationHistory({
            title,
            message,
            icon,
            target,
            priority,
            sentBy: req.user.fullName
        }, result.modifiedCount, targetUsers);

        console.log(`Notification sent to ${result.modifiedCount} users (${realTimeDelivered} real-time)`);
        res.status(200).json({ 
            message: 'Notification sent successfully!', 
            sentCount: result.modifiedCount,
            realTimeDelivered: realTimeDelivered
        });

    } catch (error) {
        console.error('Error sending notification:', error);
        res.status(500).json({ message: 'Failed to send notification.' });
    }
});

// Get notification history (Admin only)
app.get('/api/admin/notifications/history', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        
        const notifications = await notificationsHistoryCollection
            .find({})
            .sort({ sentAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .toArray();
        
        const total = await notificationsHistoryCollection.countDocuments();
        
        res.json({
            notifications,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching notification history:', error);
        res.status(500).json({ message: 'Failed to fetch notification history.' });
    }
});

// Get system settings (Admin only)
app.get('/api/admin/settings', authenticateAdmin, async (req, res) => {
    try {
        const settings = await systemSettingsCollection.findOne({});
        res.json(settings || {});
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ message: 'Failed to fetch settings.' });
    }
});

// Update system settings (Admin only)
app.put('/api/admin/settings', authenticateAdmin, async (req, res) => {
    try {
        const settingsData = req.body;
        
        const result = await systemSettingsCollection.updateOne(
            {},
            { 
                $set: {
                    ...settingsData,
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );

        console.log('Admin updated system settings');
        res.status(200).json({ message: 'Settings updated successfully!' });

    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ message: 'Failed to update settings.' });
    }
});

// Get dashboard analytics (Admin only)
app.get('/api/admin/analytics', authenticateAdmin, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);

        const analytics = {
            totalUsers: await usersCollection.countDocuments(),
            totalEvents: await eventsCollection.countDocuments(),
            totalCategories: await categoriesCollection.countDocuments(),
            newUsersToday: await usersCollection.countDocuments({
                createdAt: { $gte: today }
            }),
            newUsersThisMonth: await usersCollection.countDocuments({
                createdAt: { $gte: thisMonth }
            }),
            eventsThisMonth: await eventsCollection.countDocuments({
                createdAt: { $gte: thisMonth }
            }),
            notificationsSentToday: await notificationsHistoryCollection.countDocuments({
                sentAt: { $gte: today }
            }),
            notificationsThisMonth: await notificationsHistoryCollection.countDocuments({
                sentAt: { $gte: thisMonth }
            })
        };

        // Calculate team statistics
        const events = await eventsCollection.find({}).toArray();
        let activeTeams = 0;
        let totalRegistrations = 0;
        let fullTeams = 0;

        events.forEach(event => {
            if (event.team && event.team.members.length > 0) {
                activeTeams++;
                totalRegistrations += event.team.members.length;
                if (event.team.members.length >= event.team.maxSlots) {
                    fullTeams++;
                }
            }
        });

        analytics.activeTeams = activeTeams;
        analytics.totalRegistrations = totalRegistrations;
        analytics.teamCompletionRate = activeTeams > 0 ? Math.round((fullTeams / activeTeams) * 100) : 0;

        res.json(analytics);
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ message: 'Failed to fetch analytics.' });
    }
});

// Save chat message function
async function saveChatMessage(messageData) {
    try {
        const message = {
            teamName: messageData.teamName,
            sender: messageData.sender,
            text: messageData.text,
            timestamp: new Date()
        };
        
        await chatMessagesCollection.insertOne(message);
        return message;
    } catch (error) {
        console.error('Error saving chat message:', error);
        return null;
    }
}

// --- WebSocket Setup ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    if (url.pathname === '/notifications') {
        handleNotificationConnection(ws);
    } else {
        handleChatConnection(ws);
    }
});

function handleNotificationConnection(ws) {
    console.log('New notification WebSocket client connected');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'register' && data.userEmail) {
                notificationClients.set(data.userEmail, ws);
                console.log(`Notification client registered for: ${data.userEmail}`);
            }
        } catch (error) {
            console.error('Notification WebSocket message error:', error);
        }
    });
    
    ws.on('close', () => {
        for (const [email, connection] of notificationClients.entries()) {
            if (connection === ws) {
                notificationClients.delete(email);
                console.log(`Notification client disconnected: ${email}`);
                break;
            }
        }
    });
}

function handleChatConnection(ws) {
    console.log('New chat WebSocket client connected');
    ws.teamName = null;
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'join') {
                ws.teamName = data.teamName;
                console.log(`Client joined team chat: ${ws.teamName}`);
            }
            
            if (data.type === 'message') {
                const savedMessage = await saveChatMessage({
                    teamName: ws.teamName,
                    sender: data.sender,
                    text: data.text
                });
                
                if (savedMessage) {
                    wss.clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN && client.teamName === ws.teamName) {
                            client.send(JSON.stringify({
                                type: 'message',
                                sender: savedMessage.sender,
                                text: savedMessage.text,
                                timestamp: savedMessage.timestamp
                            }));
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Chat WebSocket message error:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('Chat WebSocket client disconnected');
    });
}

// --- Error Handling ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// --- Start Server ---
async function startServer() {
    try {
        await connectToDatabase();
        
        server.listen(port, () => {
            console.log(`🚀 Enhanced SportsHub Server running on port ${port}`);
            console.log(`📊 Database: Connected to MongoDB Atlas`);
            console.log(`💬 WebSocket: Real-time chat enabled`);
            console.log(`🔔 Notifications: Real-time delivery enabled`);
            console.log(`🔐 JWT: Access/Refresh token authentication enabled`);
            console.log(`🛡️ Admin Panel: Full CRUD operations enabled`);
            console.log(`📈 Analytics: Dashboard metrics enabled`);
            console.log(`🏆 Ready for enhanced sports management!`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
