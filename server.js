// server.js - SportsHub Backend with MongoDB Atlas & Admin Panel

// --- Imports ---
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const http = require('http');
const { WebSocketServer } = require('ws');
const { MongoClient, ObjectId } = require('mongodb');

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
        
        // Create indexes for better performance
        await createIndexes();
        
        // Initialize default data
        await initializeDefaultEvents();
        await initializeDefaultAdmin();
        
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

// --- Middleware ---
app.use(cors({
    origin: [
        'http://localhost:3000',
        'https://sportsmanagementsystem.netlify.app',
        'https://sportsmanagementsystem.netlify.app/'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
    credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../sports-hub-frontend')));

// --- Regular API Endpoints (User-facing) ---

// Get all events
app.get('/api/events', async (req, res) => {
    try {
        const events = await eventsCollection.find({}).sort({ id: 1 }).toArray();
        
        // Ensure all events have proper IDs
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

// Register new user
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, studentID, email, password } = req.body;
        
        // Validate required fields
        if (!fullName || !studentID || !email || !password) {
            return res.status(400).json({ message: "All fields are required." });
        }
        
        // Check if user already exists
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
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create new user
        const newUser = {
            fullName,
            studentID,
            email,
            password: hashedPassword,
            mobileNumber: "",
            avatarUrl: null,
            joinedTeams: [],
            notifications: [{
                icon: "🏆",
                title: `Welcome ${fullName}!`,
                body: "Your account has been created successfully. Explore events and join the fun.",
                timestamp: new Date()
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
        
        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required." });
        }
        
        // Find user by email
        const user = await usersCollection.findOne({ email: email });
        if (!user) {
            return res.status(400).json({ message: "Invalid credentials." });
        }
        
        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials." });
        }
        
        // Update last login and add welcome notification
        await usersCollection.updateOne(
            { _id: user._id },
            { 
                $set: { lastLogin: new Date() },
                $push: {
                    notifications: {
                        $each: [{
                            icon: "🏆",
                            title: `Welcome back, ${user.fullName}!`,
                            body: "Ready to join some exciting tournaments?",
                            timestamp: new Date()
                        }],
                        $slice: -10 // Keep only last 10 notifications
                    }
                }
            }
        );
        
        // Return user data (excluding password)
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
        
        res.status(200).json({ message: "Login successful!", user: userToReturn });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: "Server error during login." });
    }
});

// Join event team - FIXED VERSION
app.post('/api/events/:eventId/join', async (req, res) => {
    try {
        const { eventId } = req.params;
        const { userFullName, userRegNumber, userExperience } = req.body;
        
        // Enhanced debugging
        console.log('Join request - Event ID:', eventId);
        console.log('Join request - User:', userFullName);
        console.log('Join request - RegNumber:', userRegNumber);
        console.log('Join request - Experience:', userExperience);
        
        // Validate required fields
        if (!userFullName || !userRegNumber || userExperience === undefined) {
            return res.status(400).json({ message: 'All fields are required.' });
        }
        
        // Convert eventId to integer and find the event
        const eventIdInt = parseInt(eventId);
        if (isNaN(eventIdInt)) {
            return res.status(400).json({ message: 'Invalid event ID format.' });
        }
        
        const event = await eventsCollection.findOne({ id: eventIdInt });
        console.log('Found event:', event ? event.name : 'No event found');
        
        if (!event) {
            return res.status(404).json({ message: 'Event not found.' });
        }
        
        if (!event.team) {
            return res.status(404).json({ message: 'Team information not found for this event.' });
        }
        
        // Check if user is already in the team
        if (event.team.members.includes(userFullName)) {
            return res.status(400).json({ message: 'You are already a member of this team.' });
        }
        
        // Validate requirements
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
        
        // Add user to team
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
        
        // Update user's joined teams
        const userUpdateResult = await usersCollection.updateOne(
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
app.post('/api/teams/leave', async (req, res) => {
    try {
        const { userFullName, teamName } = req.body;
        
        // Validate required fields
        if (!userFullName || !teamName) {
            return res.status(400).json({ message: "User name and team name are required." });
        }
        
        // Find and update the event
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
        
        // Remove team from user's joined teams
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
app.post('/api/profile/update', async (req, res) => {
    try {
        const { email, fullName, mobileNumber } = req.body;
        
        // Validate required fields
        if (!email || !fullName) {
            return res.status(400).json({ message: "Email and full name are required." });
        }
        
        const updateResult = await usersCollection.findOneAndUpdate(
            { email: email },
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
        
        console.log("Profile updated for:", email);
        res.status(200).json({ message: "Profile updated successfully!", user: userToReturn });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: "Failed to update profile." });
    }
});

// Get chat messages for a team
app.get('/api/chat/:teamName', async (req, res) => {
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

// --- ADMIN API ENDPOINTS ---

// Admin login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required." });
        }
        
        // Find admin by email
        const admin = await adminsCollection.findOne({ email: email });
        if (!admin) {
            return res.status(400).json({ message: "Invalid admin credentials." });
        }
        
        // Verify password
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid admin credentials." });
        }
        
        // Update last login
        await adminsCollection.updateOne(
            { _id: admin._id },
            { $set: { lastLogin: new Date() } }
        );
        
        // Return admin data (excluding password)
        const adminToReturn = {
            id: admin._id,
            email: admin.email,
            fullName: admin.fullName,
            role: admin.role
        };
        
        console.log('Admin logged in:', admin.email);
        res.status(200).json({ message: "Admin login successful!", admin: adminToReturn });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ message: "Server error during admin login." });
    }
});

// Get all users (Admin only)
app.get('/api/admin/users', async (req, res) => {
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
app.get('/api/admin/events', async (req, res) => {
    try {
        const events = await eventsCollection.find({}).sort({ id: 1 }).toArray();
        res.json(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ message: 'Failed to fetch events' });
    }
});

// Serve admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../sports-hub-frontend/admin.html'));
});

// Create new event (Admin only)
app.post('/api/admin/events', async (req, res) => {
    try {
        const { name, date, time, location, category, difficulty, emoji, teamName, maxSlots, minRegYear, minExperience } = req.body;
        
        // Validate required fields
        if (!name || !date || !time || !location || !category || !difficulty || !teamName || !maxSlots || !minRegYear || minExperience === undefined) {
            return res.status(400).json({ message: "All fields are required." });
        }
        
        // Get the next event ID
        const lastEvent = await eventsCollection.findOne({}, { sort: { id: -1 } });
        const nextId = lastEvent ? lastEvent.id + 1 : 1;
        
        const newEvent = {
            id: nextId,
            name,
            date,
            time,
            location,
            category,
            difficulty,
            emoji: emoji || "🏆",
            team: {
                name: teamName,
                maxSlots: parseInt(maxSlots),
                members: [],
                requirements: {
                    minRegNumber: minRegYear,
                    minExperience: parseInt(minExperience)
                }
            },
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        const result = await eventsCollection.insertOne(newEvent);
        console.log('New event created:', result.insertedId);
        
        res.status(201).json({ message: "Event created successfully!", eventId: nextId });
    } catch (error) {
        console.error('Create event error:', error);
        res.status(500).json({ message: "Failed to create event." });
    }
});

// Delete event (Admin only)
app.delete('/api/admin/events/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        
        const eventIdInt = parseInt(eventId);
        if (isNaN(eventIdInt)) {
            return res.status(400).json({ message: 'Invalid event ID format.' });
        }
        
        // Find the event first to get team name for cleanup
        const event = await eventsCollection.findOne({ id: eventIdInt });
        if (!event) {
            return res.status(404).json({ message: 'Event not found.' });
        }
        
        // Remove event from database
        const deleteResult = await eventsCollection.deleteOne({ id: eventIdInt });
        
        if (deleteResult.deletedCount === 0) {
            return res.status(404).json({ message: 'Event not found.' });
        }
        
        // Clean up user's joined teams
        if (event.team) {
            await usersCollection.updateMany(
                { "joinedTeams.teamName": event.team.name },
                { 
                    $pull: { joinedTeams: { teamName: event.team.name } },
                    $set: { updatedAt: new Date() }
                }
            );
        }
        
        console.log('Event deleted:', eventId);
        res.json({ message: 'Event deleted successfully!' });
    } catch (error) {
        console.error('Delete event error:', error);
        res.status(500).json({ message: 'Failed to delete event.' });
    }
});

// Send notifications (Admin only)
app.post('/api/admin/notifications/send', async (req, res) => {
    try {
        const { title, message, icon, target, specificEmail } = req.body;
        
        // Validate required fields
        if (!title || !message) {
            return res.status(400).json({ message: "Title and message are required." });
        }
        
        let sentCount = 0;
        
        const notification = {
            icon: icon || "📢",
            title,
            body: message,
            timestamp: new Date()
        };
        
        switch (target) {
            case 'all':
                // Send to all users
                const updateResult = await usersCollection.updateMany(
                    {},
                    {
                        $push: {
                            notifications: {
                                $each: [notification],
                                $slice: -10
                            }
                        },
                        $set: { updatedAt: new Date() }
                    }
                );
                sentCount = updateResult.matchedCount;
                break;
                
            case 'team-members':
                // Send to users who have joined teams
                const teamUpdateResult = await usersCollection.updateMany(
                    { "joinedTeams.0": { $exists: true } },
                    {
                        $push: {
                            notifications: {
                                $each: [notification],
                                $slice: -10
                            }
                        },
                        $set: { updatedAt: new Date() }
                    }
                );
                sentCount = teamUpdateResult.matchedCount;
                break;
                
            case 'specific':
                // Send to specific user
                if (!specificEmail) {
                    return res.status(400).json({ message: 'Specific email is required.' });
                }
                
                const specificUpdateResult = await usersCollection.updateOne(
                    { email: specificEmail },
                    {
                        $push: {
                            notifications: {
                                $each: [notification],
                                $slice: -10
                            }
                        },
                        $set: { updatedAt: new Date() }
                    }
                );
                
                if (specificUpdateResult.matchedCount === 0) {
                    return res.status(404).json({ message: 'User not found with this email.' });
                }
                
                sentCount = specificUpdateResult.matchedCount;
                break;
                
            default:
                return res.status(400).json({ message: 'Invalid target specified.' });
        }
        
        console.log(`Notification sent to ${sentCount} users`);
        res.json({ message: 'Notification sent successfully!', sentCount });
        
    } catch (error) {
        console.error('Send notification error:', error);
        res.status(500).json({ message: 'Failed to send notification.' });
    }
});

// Save chat message
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

// Root endpoint - API status
app.get('/', (req, res) => {
    res.json({ 
        message: 'SportsHub Backend API', 
        status: 'Running',
        version: '1.0.0',
        timestamp: new Date(),
        endpoints: {
            events: '/api/events',
            auth: {
                register: 'POST /api/register',
                login: 'POST /api/login'
            },
            admin: '/admin',
            health: '/health'
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

// Serve admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../sports-hub-frontend/admin.html'));
});

// API documentation endpoint
app.get('/api', (req, res) => {
    res.json({
        message: 'SportsHub API Documentation',
        version: '1.0.0',
        endpoints: {
            'GET /api/events': 'Get all events',
            'POST /api/register': 'Register new user',
            'POST /api/login': 'User login',
            'POST /api/events/:id/join': 'Join event team',
            'POST /api/teams/leave': 'Leave team',
            'POST /api/profile/update': 'Update user profile',
            'GET /api/chat/:teamName': 'Get chat messages',
            'POST /api/admin/login': 'Admin login',
            'GET /api/admin/users': 'Get all users (admin)',
            'GET /api/admin/events': 'Get all events (admin)',
            'POST /api/admin/events': 'Create event (admin)',
            'DELETE /api/admin/events/:id': 'Delete event (admin)',
            'POST /api/admin/notifications/send': 'Send notifications (admin)'
        }
    });
});

// Catch all handler - should be last
app.get('*', (req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found', 
        message: 'Visit / for API info or /health for status check',
        availableRoutes: ['/', '/api', '/health', '/admin']
    });
});

// --- Server Setup with WebSocket ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');
    ws.teamName = null;
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'join') {
                ws.teamName = data.teamName;
                console.log(`Client joined team chat: ${ws.teamName}`);
                
                // Send recent chat history to the newly joined client
                try {
                    const recentMessages = await chatMessagesCollection
                        .find({ teamName: ws.teamName })
                        .sort({ timestamp: -1 })
                        .limit(50)
                        .toArray();
                    
                    // Send messages in chronological order
                    recentMessages.reverse().forEach(msg => {
                        ws.send(JSON.stringify({
                            type: 'message',
                            sender: msg.sender,
                            text: msg.text,
                            timestamp: msg.timestamp
                        }));
                    });
                } catch (error) {
                    console.error('Error loading chat history:', error);
                }
            }
            
            if (data.type === 'message') {
                // Save message to database
                const savedMessage = await saveChatMessage({
                    teamName: ws.teamName,
                    sender: data.sender,
                    text: data.text
                });
                
                if (savedMessage) {
                    // Broadcast message to all clients in the same team
                    wss.clients.forEach((client) => {
                        if (client.readyState === ws.OPEN && client.teamName === ws.teamName) {
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
            console.error('WebSocket message error:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// --- Error Handling ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// --- Start Server ---
async function startServer() {
    try {
        // Connect to database first
        await connectToDatabase();
        
        // Start the server
        server.listen(port, () => {
            console.log(`🚀 SportsHub Server running on port ${port}`);
            console.log(`📊 Database: Connected to MongoDB Atlas`);
            console.log(`💬 WebSocket: Real-time chat enabled`);
            console.log(`🛡️ Admin Panel: Access at /admin`);
            console.log(`🔑 Default Admin: admin@college.edu / admin123`);
            console.log(`🏆 Ready for sports management!`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Start the application
startServer();
