import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import { 
  sendBuyerWelcomeEmail, 
  sendSellerWelcomeEmail, 
  sendPasswordResetEmail,
  sendVerificationEmail
} from '../utils/emailService.js';
import { uploadToSupabase } from '../utils/supabase.js';

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// Register new user (buyer or seller)
export const register = async (req, res) => {
  try {
    const {
      fullName,
      email,
      phoneNumber,
      password,
      confirmPassword,
      state,
      city,
      role,
      dealershipName,
      dealershipAddress,
      businessDescription,
      yearsInBusiness
    } = req.body;
    
    // Validation
    if (!fullName || !email || !phoneNumber || !password || !state || !city || !role) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }
    
    // Check password match
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Handle profile photo upload
    let profilePhotoUrl = '';
    if (req.file) {
      profilePhotoUrl = await uploadToSupabase(
        req.file.buffer, 
        req.file.originalname, 
        'profiles',
        req.file.mimetype
      );
    }
    
    // Create user object
    const userData = {
      fullName,
      email: email.toLowerCase(),
      phoneNumber,
      password,
      state,
      city,
      role,
      profilePhoto: profilePhotoUrl
    };
    
    // Add seller-specific fields
    if (role === 'seller') {
      if (!dealershipName || !dealershipAddress || !businessDescription || !yearsInBusiness) {
        return res.status(400).json({
          success: false,
          message: 'Please provide all seller-specific fields'
        });
      }
      userData.dealershipName = dealershipName;
      userData.dealershipAddress = dealershipAddress;
      userData.businessDescription = businessDescription;
      userData.yearsInBusiness = yearsInBusiness;
    }
    
    // Create user
    const user = await User.create(userData);
    
    // Send welcome email
    try {
      if (role === 'buyer') {
        await sendBuyerWelcomeEmail(user.email, user.fullName);
      } else {
        await sendSellerWelcomeEmail(user.email, user.fullName, user.dealershipName);
      }
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Don't fail registration if email fails
    }
    
    // Generate token
    const token = generateToken(user._id);
    
    // For sellers, generate email verification token and send verification email
    if (role === 'seller') {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      user.emailVerificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
      user.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
      await user.save({ validateBeforeSave: false });
      
      try {
        await sendVerificationEmail(user.email, user.fullName, verificationToken);
      } catch (emailError) {
        console.error('Verification email sending failed:', emailError);
      }
      
      return res.status(201).json({
        success: true,
        message: 'Account created! Please check your email to verify your account.',
        token,
        requiresVerification: true,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          profilePhoto: user.profilePhoto,
          state: user.state,
          city: user.city,
          role: user.role,
          dealershipName: user.dealershipName,
          isVerified: user.isVerified,
          isEmailVerified: false,
          createdAt: user.createdAt
        }
      });
    }
    
    res.status(201).json({
      success: true,
      message: 'Account created successfully! Check your email.',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profilePhoto: user.profilePhoto,
        state: user.state,
        city: user.city,
        role: user.role,
        dealershipName: user.dealershipName,
        isVerified: user.isVerified,
        isEmailVerified: true,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message
    });
  }
};

// Login user
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }
    
    // Find user and include password
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Generate token
    const token = generateToken(user._id);
    
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profilePhoto: user.profilePhoto,
        state: user.state,
        city: user.city,
        role: user.role,
        dealershipName: user.dealershipName,
        dealershipAddress: user.dealershipAddress,
        businessDescription: user.businessDescription,
        yearsInBusiness: user.yearsInBusiness,
        isVerified: user.isVerified,
        isEmailVerified: user.isEmailVerified || false,
        favorites: user.favorites,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
};

// Get current user
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('totalListings');
    
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profilePhoto: user.profilePhoto,
        state: user.state,
        city: user.city,
        role: user.role,
        dealershipName: user.dealershipName,
        dealershipAddress: user.dealershipAddress,
        businessDescription: user.businessDescription,
        yearsInBusiness: user.yearsInBusiness,
        isVerified: user.isVerified,
        favorites: user.favorites,
        totalListings: user.totalListings || 0,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Update profile
export const updateProfile = async (req, res) => {
  try {
    const {
      fullName,
      phoneNumber,
      state,
      city,
      dealershipName,
      dealershipAddress,
      businessDescription,
      yearsInBusiness
    } = req.body;
    
    const updateData = {};
    
    if (fullName) updateData.fullName = fullName;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
    if (state) updateData.state = state;
    if (city) updateData.city = city;
    
    // Seller-specific updates
    if (req.user.role === 'seller') {
      if (dealershipName) updateData.dealershipName = dealershipName;
      if (dealershipAddress) updateData.dealershipAddress = dealershipAddress;
      if (businessDescription) updateData.businessDescription = businessDescription;
      if (yearsInBusiness) updateData.yearsInBusiness = yearsInBusiness;
    }
    
    // Handle profile photo upload
    if (req.file) {
      updateData.profilePhoto = await uploadToSupabase(
        req.file.buffer, 
        req.file.originalname, 
        'profiles',
        req.file.mimetype
      );
    }
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profilePhoto: user.profilePhoto,
        state: user.state,
        city: user.city,
        role: user.role,
        dealershipName: user.dealershipName,
        dealershipAddress: user.dealershipAddress,
        businessDescription: user.businessDescription,
        yearsInBusiness: user.yearsInBusiness,
        isVerified: user.isVerified,
        favorites: user.favorites,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Forgot password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your email'
      });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this email'
      });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Hash token and save to user
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hour
    
    await user.save({ validateBeforeSave: false });
    
    // Send reset email
    try {
      await sendPasswordResetEmail(user.email, user.fullName, resetToken);
      
      res.status(200).json({
        success: true,
        message: 'Password reset email sent'
      });
    } catch (emailError) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      
      return res.status(500).json({
        success: false,
        message: 'Could not send reset email'
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Reset password
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;
    
    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide password and confirm password'
      });
    }
    
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }
    
    // Hash token
    const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    
    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    }).select('+resetPasswordToken +resetPasswordExpire');
    
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }
    
    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    
    await user.save();
    
    // Generate new token
    const jwtToken = generateToken(user._id);
    
    res.status(200).json({
      success: true,
      message: 'Password reset successful',
      token: jwtToken
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Verify seller email
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }
    
    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    // Find user with valid token
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpire: { $gt: Date.now() }
    }).select('+emailVerificationToken +emailVerificationExpire');
    
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }
    
    // Mark email as verified
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save({ validateBeforeSave: false });
    
    // Send welcome email now that they're verified
    try {
      await sendSellerWelcomeEmail(user.email, user.fullName, user.dealershipName);
    } catch (emailError) {
      console.error('Welcome email failed:', emailError);
    }
    
    res.status(200).json({
      success: true,
      message: 'Email verified successfully! Your seller account is now active.'
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Resend verification email
export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }
    
    const user = await User.findOne({ email: email.toLowerCase(), role: 'seller' });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Seller account not found with this email'
      });
    }
    
    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }
    
    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
    user.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save({ validateBeforeSave: false });
    
    // Send verification email
    await sendVerificationEmail(user.email, user.fullName, verificationToken);
    
    res.status(200).json({
      success: true,
      message: 'Verification email sent! Please check your inbox.'
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
