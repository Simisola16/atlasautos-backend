import mongoose from 'mongoose';

const carSchema = new mongoose.Schema({
  // Reference to seller
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Seller is required']
  },
  
  // Car photos (up to 10)
  photos: [{
    type: String,
    required: [true, 'At least one photo is required']
  }],
  coverPhoto: {
    type: String,
    required: [true, 'Cover photo is required']
  },
  
  // Basic Information
  brand: {
    type: String,
    required: [true, 'Brand is required'],
    enum: ['Toyota', 'Mercedes', 'BMW', 'Honda', 'Ford', 'Lexus', 'Hyundai', 'Kia', 'Audi', 'Volkswagen', 'Nissan', 'Peugeot', 'Mitsubishi', 'Range Rover', 'Porsche', 'Ferrari', 'Lamborghini', 'Other']
  },
  model: {
    type: String,
    required: [true, 'Model is required'],
    trim: true
  },
  year: {
    type: Number,
    required: [true, 'Year is required'],
    min: 1900,
    max: new Date().getFullYear() + 1
  },
  condition: {
    type: String,
    enum: ['New', 'Used'],
    required: [true, 'Condition is required']
  },
  color: {
    type: String,
    required: [true, 'Color is required']
  },
  bodyType: {
    type: String,
    required: [true, 'Body type is required'],
    enum: ['Sedan', 'SUV', 'Coupe', 'Hatchback', 'Pickup Truck', 'Van', 'Convertible', 'Station Wagon']
  },
  
  // Engine & Performance
  engineType: {
    type: String,
    required: [true, 'Engine type is required'],
    enum: ['Petrol', 'Diesel', 'Electric', 'Hybrid', 'Plug-in Hybrid']
  },
  engineSize: {
    type: String,
    default: ''
  },
  horsepower: {
    type: Number,
    default: null
  },
  torque: {
    type: Number,
    default: null
  },
  topSpeed: {
    type: Number,
    default: null
  },
  acceleration: {
    type: Number, // 0-100 km/h in seconds
    default: null
  },
  
  // Transmission & Drive
  transmission: {
    type: String,
    required: [true, 'Transmission is required'],
    enum: ['Automatic', 'Manual', 'CVT', 'Semi-Automatic']
  },
  driveType: {
    type: String,
    required: [true, 'Drive type is required'],
    enum: ['FWD', 'RWD', 'AWD', '4WD']
  },
  
  // Dimensions
  numberOfSeats: {
    type: Number,
    required: [true, 'Number of seats is required'],
    enum: [2, 4, 5, 7, 8, 9]
  },
  numberOfDoors: {
    type: Number,
    required: [true, 'Number of doors is required'],
    enum: [2, 3, 4, 5]
  },
  tyreSize: {
    type: String,
    default: ''
  },
  
  // Fuel
  fuelTankCapacity: {
    type: Number,
    default: null
  },
  fuelConsumption: {
    type: Number, // L/100km
    default: null
  },
  
  // Features (multi-select)
  features: [{
    type: String,
    enum: ['Sunroof', 'Leather Seats', 'Heated Seats', 'Blind Spot Monitor', 'Lane Assist', 'Adaptive Cruise Control', '360 Camera', 'Apple CarPlay', 'Android Auto', 'Wireless Charging', 'Keyless Entry', 'Push Start', 'Electric Windows', 'Climate Control', 'Parking Sensors', 'Navigation/GPS', 'Bluetooth', 'USB Ports', 'Third Row Seating', 'Electric Boot']
  }],
  
  // Price & Negotiation
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: 0
  },
  negotiable: {
    type: Boolean,
    default: false
  },
  
  // Description
  description: {
    type: String,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  
  // Availability
  availabilityStatus: {
    type: String,
    enum: ['Available', 'Sold', 'Reserved'],
    default: 'Available'
  },
  
  // === USED CAR SPECIFIC FIELDS ===
  mileage: {
    type: Number, // in km
    default: null
  },
  previousOwners: {
    type: Number,
    default: null
  },
  registeredState: {
    type: String,
    default: ''
  },
  registeredCity: {
    type: String,
    default: ''
  },
  importType: {
    type: String,
    enum: ['Import', 'Locally Used', ''],
    default: ''
  },
  serviceHistory: {
    type: String,
    enum: ['Full', 'Partial', 'None', ''],
    default: ''
  },
  accidentHistory: {
    type: {
      hasAccident: { type: Boolean, default: false },
      description: { type: String, default: '' }
    },
    default: {}
  },
  lastServiceDate: {
    type: Date,
    default: null
  },
  remainingWarranty: {
    type: String,
    default: ''
  },
  inspectionReport: {
    type: String, // URL to uploaded file
    default: ''
  },
  
  // Analytics
  viewCount: {
    type: Number,
    default: 0
  },
  
  // Reports
  reports: [{
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    description: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for search
carSchema.index({ brand: 'text', model: 'text', description: 'text' });
carSchema.index({ price: 1, year: 1, condition: 1, availabilityStatus: 1 });

// Virtual for formatted price
carSchema.virtual('formattedPrice').get(function() {
  return '₦' + this.price.toLocaleString('en-NG');
});

// Increment view count method
carSchema.methods.incrementViewCount = async function() {
  this.viewCount += 1;
  await this.save();
};

const Car = mongoose.model('Car', carSchema);
export default Car;
