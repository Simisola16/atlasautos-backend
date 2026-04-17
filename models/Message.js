import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  // Reference to the chat
  chat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: [true, 'Chat reference is required']
  },
  
  // Sender of the message
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender is required']
  },
  
  // Message content
  content: {
    type: String,
    required: [true, 'Message content is required'],
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  
  // Message status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  
  // Read receipt
  readAt: {
    type: Date,
    default: null
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient querying
messageSchema.index({ chat: 1, createdAt: 1 });
messageSchema.index({ sender: 1, status: 1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;
