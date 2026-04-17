import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  // Common fields for both buyers and sellers
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [100, 'Full name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/\S+@\S+\.\S+/, 'Please enter a valid email']
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  profilePhoto: {
    type: String,
    default: ''
  },
  state: {
    type: String,
    required: [true, 'State is required']
  },
  city: {
    type: String,
    required: [true, 'City is required']
  },
  
  // Role: 'buyer' or 'seller'
  role: {
    type: String,
    enum: ['buyer', 'seller', 'admin'],
    required: [true, 'Role is required']
  },
  
  // Seller-specific fields
  dealershipName: {
    type: String,
    required: function() { return this.role === 'seller'; },
    trim: true
  },
  dealershipAddress: {
    type: String,
    required: function() { return this.role === 'seller'; },
    trim: true
  },
  businessDescription: {
    type: String,
    required: function() { return this.role === 'seller'; },
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  yearsInBusiness: {
    type: Number,
    required: function() { return this.role === 'seller'; },
    min: 0
  },
  
  // Verification status for sellers
  isVerified: {
    type: Boolean,
    default: false
  },
  
  // Email verification for sellers
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    select: false
  },
  emailVerificationExpire: {
    type: Date,
    select: false
  },
  
  // Password reset
  resetPasswordToken: {
    type: String,
    select: false
  },
  resetPasswordExpire: {
    type: Date,
    select: false
  },
  
  // For tracking last email notification time (to prevent spam)
  lastEmailNotification: {
    type: Map,
    of: Date,
    default: {}
  },
  
  // Favorites (for buyers)
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Car'
  }],
  
  // Member since
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for total listings count (for sellers)
userSchema.virtual('totalListings', {
  ref: 'Car',
  localField: '_id',
  foreignField: 'seller',
  count: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;
