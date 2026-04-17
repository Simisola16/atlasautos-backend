import express from 'express';
import {
  register,
  login,
  getMe,
  updateProfile,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { uploadSingle, handleUploadError } from '../middleware/upload.js';

const router = express.Router();

// Public routes
router.post('/register', uploadSingle, handleUploadError, register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerification);

// Protected routes
router.get('/me', protect, getMe);
router.put('/profile', protect, uploadSingle, handleUploadError, updateProfile);

export default router;
