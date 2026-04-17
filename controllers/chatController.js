import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import Car from '../models/Car.js';
import User from '../models/User.js';
import { sendNewMessageEmail } from '../utils/emailService.js';
import { saveMessage, getMessages as getSupabaseMessages, markMessagesRead } from '../utils/chatMessageService.js';

// Get or create chat
export const getOrCreateChat = async (req, res) => {
  try {
    const { carId } = req.body;
    const buyerId = req.user.id;
    
    // Get car to find seller
    const car = await Car.findById(carId);
    if (!car) {
      return res.status(404).json({
        success: false,
        message: 'Car not found'
      });
    }
    
    // Can't chat about own listing
    if (car.seller.toString() === buyerId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot chat about your own listing'
      });
    }
    
    const sellerId = car.seller;
    
    // Find existing chat or create new one
    let chat = await Chat.findOne({
      car: carId,
      buyer: buyerId,
      seller: sellerId
    });
    
    if (!chat) {
      chat = await Chat.create({
        car: carId,
        buyer: buyerId,
        seller: sellerId
      });
    }
    
    // Populate chat details
    const populatedChat = await Chat.findById(chat._id)
      .populate('car', 'brand model year photos coverPhoto price condition')
      .populate('buyer', 'fullName profilePhoto')
      .populate('seller', 'fullName dealershipName profilePhoto');
    
    res.status(200).json({
      success: true,
      chat: populatedChat
    });
  } catch (error) {
    console.error('Get or create chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get user's conversations
export const getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    
    // Build query based on user role
    const query = userRole === 'buyer' 
      ? { buyer: userId }
      : { seller: userId };
    
    const chats = await Chat.find(query)
      .populate('car', 'brand model year coverPhoto price condition')
      .populate('buyer', 'fullName profilePhoto')
      .populate('seller', 'fullName dealershipName profilePhoto')
      .populate('lastMessageSender', 'fullName')
      .sort({ lastMessageAt: -1 });
    
    res.status(200).json({
      success: true,
      count: chats.length,
      chats
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get messages in a chat
export const getMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    
    // Verify user is part of this chat
    const chat = await Chat.findById(chatId)
      .populate('buyer', 'fullName profilePhoto')
      .populate('seller', 'fullName profilePhoto');
      
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    
    if (chat.buyer._id.toString() !== userId && chat.seller._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this chat'
      });
    }
    
    // Get messages from MongoDB (Buyer messages)
    const mongoMessages = await Message.find({ chat: chatId })
      .populate('sender', 'fullName profilePhoto');

    // Get messages from Supabase (Seller messages)
    const supaRawMessages = await getSupabaseMessages(chatId);
    const mappedSupaMessages = supaRawMessages.map(m => ({
      _id: m.id,
      chat: chatId,
      sender: chat.seller,
      content: m.content,
      status: m.status,
      createdAt: m.created_at,
      readAt: m.read_at
    }));

    // Combine and sort
    const messages = [...mongoMessages, ...mappedSupaMessages].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );

    // Mark messages as read
    await Message.updateMany(
      { 
        chat: chatId, 
        sender: { $ne: userId },
        status: { $ne: 'read' }
      },
      { status: 'read', readAt: new Date() }
    );
    
    // Reset unread count for this user
    if (chat.buyer._id.toString() === userId) {
      chat.unreadCountBuyer = 0;
    } else {
      chat.unreadCountSeller = 0;
    }
    await chat.save();
    
    res.status(200).json({
      success: true,
      count: messages.length,
      messages
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Send message (HTTP endpoint - Socket.io handles real-time)
export const sendMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { content } = req.body;
    const senderId = req.user.id;
    
    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }
    
    // Verify user is part of this chat
    const chat = await Chat.findById(chatId)
      .populate('car', 'brand model year')
      .populate('buyer', 'fullName email profilePhoto')
      .populate('seller', 'fullName email profilePhoto');
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    
    if (chat.buyer._id.toString() !== senderId && chat.seller._id.toString() !== senderId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send messages in this chat'
      });
    }
    
    const isBuyer = chat.buyer._id.toString() === senderId;
    
    let populatedMessage;

    if (isBuyer) {
      // Buyer messages go to MongoDB
      const message = await Message.create({
        chat: chatId,
        sender: senderId,
        content: content.trim(),
        status: 'sent'
      });
      populatedMessage = await Message.findById(message._id).populate('sender', 'fullName profilePhoto');
    } else {
      // Seller messages go to Supabase
      const supaMsg = await saveMessage(chatId, senderId, content.trim());
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
    // Check if we should send email notification (only if last email was > 1 hour ago)
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
        
        // Update last email notification time
        recipientUser.lastEmailNotification.set(lastEmailKey, new Date());
        await recipientUser.save();
      } catch (emailError) {
        console.error('Email notification failed:', emailError);
      }
    }
    
    res.status(201).json({
      success: true,
      message: populatedMessage
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get unread message count
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    
    const query = userRole === 'buyer'
      ? { buyer: userId, unreadCountBuyer: { $gt: 0 } }
      : { seller: userId, unreadCountSeller: { $gt: 0 } };
    
    const chats = await Chat.find(query);
    const totalUnread = chats.reduce((sum, chat) => {
      return sum + (userRole === 'buyer' ? chat.unreadCountBuyer : chat.unreadCountSeller);
    }, 0);
    
    res.status(200).json({
      success: true,
      unreadCount: totalUnread
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Mark messages as read
export const markAsRead = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    
    // If reader is buyer, mark seller's messages read in Supabase
    // If reader is seller, mark buyer's messages read in MongoDB
    if (chat.buyer.toString() === userId) {
      markMessagesRead(chatId, userId);
      chat.unreadCountBuyer = 0;
    } else {
      await Message.updateMany(
        { chat: chatId, sender: { $ne: userId }, status: { $ne: 'read' } },
        { status: 'read', readAt: new Date() }
      );
      chat.unreadCountSeller = 0;
    }
    await chat.save();
    
    res.status(200).json({
      success: true,
      message: 'Messages marked as read'
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
