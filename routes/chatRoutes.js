import express from 'express';
import {
  getOrCreateChat,
  getConversations,
  getMessages,
  sendMessage,
  getUnreadCount,
  markAsRead
} from '../controllers/chatController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All chat routes are protected
router.use(protect);

router.post('/', getOrCreateChat);
router.get('/conversations', getConversations);
router.get('/unread-count', getUnreadCount);
router.get('/:chatId/messages', getMessages);
router.post('/:chatId/messages', sendMessage);
router.put('/:chatId/read', markAsRead);

export default router;
