import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  // The car listing this chat is about
  car: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Car',
    required: [true, 'Car reference is required']
  },
  
  // Buyer (initiates the chat)
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Buyer is required']
  },
  
  // Seller (owner of the car)
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Seller is required']
  },
  
  // Last message for preview in conversation list
  lastMessage: {
    type: String,
    default: ''
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  lastMessageSender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Unread counts
  unreadCountBuyer: {
    type: Number,
    default: 0
  },
  unreadCountSeller: {
    type: Number,
    default: 0
  },
  
  // Chat status
  isActive: {
    type: Boolean,
    default: true
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index to ensure unique chat per buyer-seller-car combination
chatSchema.index({ car: 1, buyer: 1, seller: 1 }, { unique: true });

const Chat = mongoose.model('Chat', chatSchema);
export default Chat;
