import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';

// Import routes
import authRoutes from './routes/authRoutes.js';
import carRoutes from './routes/carRoutes.js';
import chatRoutes from './routes/chatRoutes.js';

// Import models for socket handlers
import Chat from './models/Chat.js';
import Message from './models/Message.js';
import User from './models/User.js';
import { sendNewMessageEmail } from './utils/emailService.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const httpServer = createServer(app);

// Allowed Origins for CORS
const allowedOrigins = [
  process.env.CLIENT_URL,
  'https://atlasautos-one.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174'
].filter(Boolean);

const corsOriginCheck = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (
    allowedOrigins.includes(origin) ||
    origin.endsWith('.vercel.app') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1')
  ) {
    return callback(null, true);
  }
  callback(null, true);
};

// Initialize Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: corsOriginCheck,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: corsOriginCheck,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      dbName: 'atlasautos'
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

connectDB();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/cars', carRoutes);
app.use('/api/chat', chatRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'AtlasAutos API is running',
    timestamp: new Date().toISOString()
  });
});

// Socket.io connection handling
const connectedUsers = new Map(); // userId -> socketId

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // User joins with their userId
  socket.on('join', (userId) => {
    connectedUsers.set(userId, socket.id);
    socket.userId = userId;
    console.log(`User ${userId} joined with socket ${socket.id}`);
  });

  // Join a chat room
  socket.on('join-chat', (chatId) => {
    socket.join(chatId);
    console.log(`Socket ${socket.id} joined chat room: ${chatId}`);
  });

  // Leave a chat room
  socket.on('leave-chat', (chatId) => {
    socket.leave(chatId);
    console.log(`Socket ${socket.id} left chat room: ${chatId}`);
  });

  // Handle typing indicator
  socket.on('typing', ({ chatId, isTyping }) => {
    socket.to(chatId).emit('typing', {
      userId: socket.userId,
      isTyping
    });
  });

  // Handle new message
  socket.on('send-message', async (data) => {
    try {
      const { chatId, content, senderId } = data;
      console.log(`[SOCKET] send-message received: chatId=${chatId}, senderId=${senderId}, content="${content}"`);
      console.log(`[SOCKET] socket.userId=${socket.userId}`);

      // Verify sender matches socket user
      if (senderId !== socket.userId) {
        console.error(`[SOCKET] UNAUTHORIZED: senderId=${senderId} !== socket.userId=${socket.userId}`);
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      // Get chat details
      const chat = await Chat.findById(chatId)
        .populate('car', 'brand model year price')
        .populate('buyer', 'fullName email profilePhoto')
        .populate('seller', 'fullName dealershipName email profilePhoto');

      if (!chat) {
        console.error(`[SOCKET] Chat not found: ${chatId}`);
        socket.emit('error', { message: 'Chat not found' });
        return;
      }

      // Figure out if sender is buyer or seller
      const isBuyer = chat.buyer._id.toString() === senderId;
      console.log(`[SOCKET] isBuyer=${isBuyer}, buyer._id=${chat.buyer._id}, seller._id=${chat.seller._id}`);

      console.log('[SOCKET] Saving message to MongoDB...');
      const message = await Message.create({
        chat: chatId,
        sender: senderId,
        content: content.trim(),
        status: 'sent'
      });
      const populatedMessage = await Message.findById(message._id).populate('sender', 'fullName profilePhoto');
      console.log('[SOCKET] MongoDB save SUCCESS:', message._id);

      // Update chat
      chat.lastMessage = content.trim();
      chat.lastMessageAt = new Date();
      chat.lastMessageSender = senderId;

      // Increment unread count for recipient
      if (isBuyer) {
        chat.unreadCountSeller += 1;
      } else {
        chat.unreadCountBuyer += 1;
      }

      await chat.save();

      // Emit message to all users in the chat room
      io.to(chatId).emit('new-message', populatedMessage);

      // Emit updated chat to recipient socket if online
      const recipientId = isBuyer ? chat.seller._id.toString() : chat.buyer._id.toString();
      const recipientSocketId = connectedUsers.get(recipientId);

      if (recipientSocketId) {
        // Recipient is online, update their conversation list
        io.to(recipientSocketId).emit('new-conversation', {
          chat: await Chat.findById(chatId)
            .populate('car', 'brand model year coverPhoto price')
            .populate('buyer', 'fullName profilePhoto')
            .populate('seller', 'fullName dealershipName profilePhoto')
        });
      }

      // Process email notification immediately for every message (instant delivery mode for testing)
      const recipient = isBuyer ? chat.seller : chat.buyer;
      const sender = isBuyer ? chat.buyer : chat.seller;
      const recipientUser = await User.findById(recipient._id);

      if (recipientUser && recipientUser.email) {
        try {
          const senderName = isBuyer 
            ? sender.fullName 
            : (sender.dealershipName || sender.fullName);
          const senderRole = isBuyer ? 'buyer' : 'seller';
          const carName = chat.car ? `${chat.car.year} ${chat.car.brand} ${chat.car.model}` : 'Vehicle Listing';
          const carPriceFormatted = chat.car?.price ? `₦${chat.car.price.toLocaleString()}` : '';
          const chatLink = recipientUser.role === 'seller'
            ? `${process.env.CLIENT_URL}/seller/messages`
            : `${process.env.CLIENT_URL}/chat/${chatId}`;

          console.log(`[SOCKET EMAIL] Instant dispatching Resend email to ${recipient.email} from ${senderName}...`);
          await sendNewMessageEmail(
            recipient.email,
            recipient.fullName,
            senderName,
            carName,
            chatLink,
            content.trim(),
            senderRole,
            carPriceFormatted
          );

          if (!recipientUser.lastEmailNotification) {
            recipientUser.lastEmailNotification = new Map();
          }
          recipientUser.lastEmailNotification.set(chatId.toString(), new Date());
          await recipientUser.save();
        } catch (emailError) {
          console.error('Email notification failed:', emailError);
        }
      }

      // Update unread count for recipient
      if (recipientSocketId) {
        const unreadChats = await Chat.find({
          $or: [
            { buyer: recipientId, unreadCountBuyer: { $gt: 0 } },
            { seller: recipientId, unreadCountSeller: { $gt: 0 } }
          ]
        });

        const totalUnread = unreadChats.reduce((sum, c) => {
          const isBuyerRecipient = c.buyer.toString() === recipientId;
          return sum + (isBuyerRecipient ? c.unreadCountBuyer : c.unreadCountSeller);
        }, 0);

        io.to(recipientSocketId).emit('unread-count', { count: totalUnread });
      }

    } catch (error) {
      console.error('Socket message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle message read receipt
  socket.on('mark-read', async ({ chatId, userId }) => {
    try {
      const chat = await Chat.findById(chatId);
      if (chat) {
        await Message.updateMany(
          { chat: chatId, sender: { $ne: userId }, status: { $ne: 'read' } },
          { status: 'read', readAt: new Date() }
        );
        if (chat.buyer.toString() === userId) {
          chat.unreadCountBuyer = 0;
        } else {
          chat.unreadCountSeller = 0;
        }
        await chat.save();

        // Notify other user that messages were read
        socket.to(chatId).emit('messages-read', { by: userId });
      }
    } catch (error) {
      console.error('Mark read error:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
    }
  });
});

// Make io accessible to routes
app.set('io', io);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`AtlasAutos Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
