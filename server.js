import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { saveMessage, markMessagesRead } from './utils/chatMessageService.js';

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

// Initialize Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: [process.env.CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: [process.env.CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(Boolean),
  credentials: true
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
        .populate('car', 'brand model year')
        .populate('buyer', 'fullName email profilePhoto')
        .populate('seller', 'fullName email profilePhoto');
      
      if (!chat) {
        console.error(`[SOCKET] Chat not found: ${chatId}`);
        socket.emit('error', { message: 'Chat not found' });
        return;
      }
      
      // Figure out if sender is buyer or seller
      const isBuyer = chat.buyer._id.toString() === senderId;
      console.log(`[SOCKET] isBuyer=${isBuyer}, buyer._id=${chat.buyer._id}, seller._id=${chat.seller._id}`);
      
      let populatedMessage;

      if (isBuyer) {
        // Buyer messages go to MongoDB
        console.log('[SOCKET] Saving buyer message to MongoDB...');
        const message = await Message.create({
          chat: chatId,
          sender: senderId,
          content: content.trim(),
          status: 'sent'
        });
        populatedMessage = await Message.findById(message._id).populate('sender', 'fullName profilePhoto');
        console.log('[SOCKET] MongoDB save SUCCESS:', message._id);
      } else {
        // Seller messages go to Supabase
        console.log('[SOCKET] Saving seller message to Supabase...');
        const supaMsg = await saveMessage(chatId, senderId, content.trim());
        console.log('[SOCKET] Supabase save result:', supaMsg ? 'SUCCESS' : 'FAILED');
        populatedMessage = {
          _id: supaMsg ? supaMsg.id : Date.now().toString(),
          chat: chatId,
          sender: chat.seller,
          content: content.trim(),
          status: 'sent',
          createdAt: supaMsg ? supaMsg.created_at : new Date()
        };
      }
      
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
      
      // Emit updated chat to both users
      const recipientId = isBuyer ? chat.seller._id.toString() : chat.buyer._id.toString();
      const recipientSocketId = connectedUsers.get(recipientId);
      
      if (recipientSocketId) {
        // Recipient is online, update their conversation list
        io.to(recipientSocketId).emit('new-conversation', {
          chat: await Chat.findById(chatId)
            .populate('car', 'brand model year coverPhoto')
            .populate('buyer', 'fullName profilePhoto')
            .populate('seller', 'fullName dealershipName profilePhoto')
        });
      } else {
        // Recipient is offline, send email notification
        const recipient = isBuyer ? chat.seller : chat.buyer;
        const sender = isBuyer ? chat.buyer : chat.seller;
        const recipientUser = await User.findById(recipient._id);
        
        const lastEmailKey = chatId.toString();
        const lastEmailTime = recipientUser.lastEmailNotification?.get(lastEmailKey);
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        if (!lastEmailTime || lastEmailTime < oneHourAgo) {
          try {
            await sendNewMessageEmail(
              recipient.email,
              recipient.fullName,
              sender.fullName,
              `${chat.car.year} ${chat.car.brand} ${chat.car.model}`,
              `${process.env.CLIENT_URL}/chat/${chatId}`
            );
            
            recipientUser.lastEmailNotification.set(lastEmailKey, new Date());
            await recipientUser.save();
          } catch (emailError) {
            console.error('Email notification failed:', emailError);
          }
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
      // If reader is buyer, mark seller's messages read in Supabase
      // If reader is seller, mark buyer's messages read in MongoDB
      const chat = await Chat.findById(chatId);
      if (chat) {
        if (chat.buyer.toString() === userId) {
          // Buyer reading -> Update Supabase
          markMessagesRead(chatId, userId);
          chat.unreadCountBuyer = 0;
        } else {
          // Seller reading -> Update MongoDB
          await Message.updateMany(
            { chat: chatId, sender: { $ne: userId }, status: { $ne: 'read' } },
            { status: 'read', readAt: new Date() }
          );
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
