import Car from '../models/Car.js';
import User from '../models/User.js';
import { uploadToSupabase, supabase } from '../utils/supabase.js';
import { sendListingPublishedEmail } from '../utils/emailService.js';

// Upload images to Supabase
const uploadImages = async (files, folder) => {
  const uploadPromises = files.map(file => {
    return uploadToSupabase(file.buffer, file.originalname, 'atlasautos', file.mimetype);
  });
  
  return await Promise.all(uploadPromises);
};

// Create new car listing
export const createCar = async (req, res) => {
  try {
    const carData = { ...req.body, seller: req.user.id };
    
    // Handle image uploads
    if (req.files && req.files.photos) {
      const photoUrls = await uploadImages(req.files.photos, 'atlasautos/cars');
      carData.photos = photoUrls;
      carData.coverPhoto = photoUrls[0]; // First photo is cover
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please upload at least one photo'
      });
    }
    
    // Handle inspection report upload for used cars
    if (req.files && req.files.inspectionReport && req.files.inspectionReport[0]) {
      const reportUrl = await uploadToSupabase(
        req.files.inspectionReport[0].buffer, 
        req.files.inspectionReport[0].originalname, 
        'reports',
        req.files.inspectionReport[0].mimetype
      );
      carData.inspectionReport = reportUrl;
    }
    
    // Parse arrays from form data
    if (carData.features && typeof carData.features === 'string') {
      carData.features = JSON.parse(carData.features);
    }
    
    // Parse accident history
    if (carData.accidentHistory && typeof carData.accidentHistory === 'string') {
      carData.accidentHistory = JSON.parse(carData.accidentHistory);
    }
    
    // Parse numeric fields
    const numericFields = ['year', 'price', 'horsepower', 'torque', 'topSpeed', 'numberOfSeats', 'numberOfDoors', 'fuelTankCapacity', 'mileage', 'previousOwners'];
    numericFields.forEach(field => {
      if (carData[field]) carData[field] = Number(carData[field]);
    });
    
    // Parse boolean fields
    if (carData.negotiable) carData.negotiable = carData.negotiable === 'true' || carData.negotiable === true;
    
    // Create car
    const car = await Car.create(carData);
    
    // Send confirmation email to seller
    try {
      const seller = await User.findById(req.user.id);
      await sendListingPublishedEmail(seller.email, seller.fullName, {
        year: car.year,
        brand: car.brand,
        model: car.model,
        price: car.formattedPrice,
        condition: car.condition
      });
    } catch (emailError) {
      console.error('Listing email failed:', emailError);
    }
    
    res.status(201).json({
      success: true,
      message: 'Car listing created successfully',
      car
    });
  } catch (error) {
    console.error('Create car error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating car listing',
      error: error.message
    });
  }
};

// Get all cars with filters and pagination
export const getCars = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      search,
      brand,
      condition,
      bodyType,
      minPrice,
      maxPrice,
      minYear,
      maxYear,
      transmission,
      engineType,
      state,
      seats,
      color,
      sortBy = 'newest'
    } = req.query;
    
    // Build query
    const query = { availabilityStatus: { $in: ['Available', 'Reserved'] } };
    
    // Search by brand, model, or description
    if (search) {
      query.$or = [
        { brand: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Apply filters
    if (brand) query.brand = brand;
    if (condition) query.condition = condition;
    if (bodyType) query.bodyType = bodyType;
    if (transmission) query.transmission = transmission;
    if (engineType) query.engineType = engineType;
    if (state) query.state = state;
    if (seats) query.numberOfSeats = Number(seats);
    if (color) query.color = { $regex: color, $options: 'i' };
    
    // Price range
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    
    // Year range
    if (minYear || maxYear) {
      query.year = {};
      if (minYear) query.year.$gte = Number(minYear);
      if (maxYear) query.year.$lte = Number(maxYear);
    }
    
    // Sort options
    let sortOption = {};
    switch (sortBy) {
      case 'price-low':
        sortOption = { price: 1 };
        break;
      case 'price-high':
        sortOption = { price: -1 };
        break;
      case 'most-viewed':
        sortOption = { viewCount: -1 };
        break;
      case 'newest':
      default:
        sortOption = { createdAt: -1 };
    }
    
    // Execute query with pagination
    const skip = (Number(page) - 1) * Number(limit);
    
    const [cars, total] = await Promise.all([
      Car.find(query)
        .populate('seller', 'fullName dealershipName profilePhoto isVerified phoneNumber state city yearsInBusiness createdAt')
        .sort(sortOption)
        .skip(skip)
        .limit(Number(limit)),
      Car.countDocuments(query)
    ]);
    
    res.status(200).json({
      success: true,
      count: cars.length,
      total,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      cars
    });
  } catch (error) {
    console.error('Get cars error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching cars',
      error: error.message
    });
  }
};

// Get single car by ID
export const getCarById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const car = await Car.findById(id)
      .populate('seller', 'fullName dealershipName dealershipAddress profilePhoto isVerified phoneNumber state city yearsInBusiness businessDescription createdAt');
    
    if (!car) {
      return res.status(404).json({
        success: false,
        message: 'Car not found'
      });
    }
    
    // Increment view count
    await car.incrementViewCount();
    
    // Check if car is in user's favorites
    let isFavorite = false;
    if (req.user) {
      const user = await User.findById(req.user.id);
      isFavorite = user.favorites.includes(car._id);
    }
    
    res.status(200).json({
      success: true,
      car: {
        ...car.toObject(),
        isFavorite
      }
    });
  } catch (error) {
    console.error('Get car error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching car',
      error: error.message
    });
  }
};

// Get seller's cars
export const getSellerCars = async (req, res) => {
  try {
    const { page = 1, limit = 12, status } = req.query;
    
    const query = { seller: req.user.id };
    if (status) query.availabilityStatus = status;
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const [cars, total] = await Promise.all([
      Car.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Car.countDocuments(query)
    ]);
    
    // Get stats
    const stats = await Car.aggregate([
      { $match: { seller: req.user._id } },
      {
        $group: {
          _id: null,
          totalListings: { $sum: 1 },
          activeListings: {
            $sum: { $cond: [{ $eq: ['$availabilityStatus', 'Available'] }, 1, 0] }
          },
          totalViews: { $sum: '$viewCount' }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      count: cars.length,
      total,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      cars,
      stats: stats[0] || { totalListings: 0, activeListings: 0, totalViews: 0 }
    });
  } catch (error) {
    console.error('Get seller cars error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching seller cars',
      error: error.message
    });
  }
};

// Update car listing
export const updateCar = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find car
    let car = await Car.findById(id);
    
    if (!car) {
      return res.status(404).json({
        success: false,
        message: 'Car not found'
      });
    }
    
    // Check ownership
    if (car.seller.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this listing'
      });
    }
    
    const updateData = { ...req.body };
    
    // Handle new image uploads
    if (req.files && req.files.photos && req.files.photos.length > 0) {
      const photoUrls = await uploadImages(req.files.photos, 'atlasautos/cars');
      updateData.photos = [...car.photos, ...photoUrls];
    }
    
    // Handle inspection report upload
    if (req.files && req.files.inspectionReport && req.files.inspectionReport[0]) {
      const reportUrl = await uploadToSupabase(
        req.files.inspectionReport[0].buffer, 
        req.files.inspectionReport[0].originalname, 
        'reports',
        req.files.inspectionReport[0].mimetype
      );
      updateData.inspectionReport = reportUrl;
    }
    
    // Parse arrays
    if (updateData.features && typeof updateData.features === 'string') {
      updateData.features = JSON.parse(updateData.features);
    }
    
    // Parse accident history
    if (updateData.accidentHistory && typeof updateData.accidentHistory === 'string') {
      updateData.accidentHistory = JSON.parse(updateData.accidentHistory);
    }
    
    // Parse numeric fields
    const numericFields = ['year', 'price', 'horsepower', 'torque', 'topSpeed', 'numberOfSeats', 'numberOfDoors', 'fuelTankCapacity', 'mileage', 'previousOwners'];
    numericFields.forEach(field => {
      if (updateData[field]) updateData[field] = Number(updateData[field]);
    });
    
    // Parse boolean
    if (updateData.negotiable) updateData.negotiable = updateData.negotiable === 'true' || updateData.negotiable === true;
    
    // Update car
    car = await Car.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    });
    
    res.status(200).json({
      success: true,
      message: 'Car listing updated successfully',
      car
    });
  } catch (error) {
    console.error('Update car error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating car',
      error: error.message
    });
  }
};

// Delete car listing
export const deleteCar = async (req, res) => {
  try {
    const { id } = req.params;
    
    const car = await Car.findById(id);
    
    if (!car) {
      return res.status(404).json({
        success: false,
        message: 'Car not found'
      });
    }
    
    // Check ownership
    if (car.seller.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this listing'
      });
    }
    
    // Delete images (Note: Implementation for Supabase storage deletion)
    const deletePromises = [];
    
    if (car.photos && car.photos.length > 0) {
      car.photos.forEach(photoUrl => {
        if (photoUrl.includes('supabase.co')) {
          const path = photoUrl.split('/').pop();
          deletePromises.push(supabase.storage.from('atlasautos').remove([path]));
        }
      });
    }

    if (car.inspectionReport && car.inspectionReport.includes('supabase.co')) {
      const path = car.inspectionReport.split('/').pop();
      deletePromises.push(supabase.storage.from('reports').remove([path]));
    }

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises).catch(err => console.error('Supabase multi-delete error:', err));
    }
    
    await Car.findByIdAndDelete(id);
    
    res.status(200).json({
      success: true,
      message: 'Car listing deleted successfully'
    });
  } catch (error) {
    console.error('Delete car error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting car',
      error: error.message
    });
  }
};

// Delete car photo
export const deleteCarPhoto = async (req, res) => {
  try {
    const { id, photoIndex } = req.params;
    
    const car = await Car.findById(id);
    
    if (!car) {
      return res.status(404).json({
        success: false,
        message: 'Car not found'
      });
    }
    
    // Check ownership
    if (car.seller.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }
    
    const index = Number(photoIndex);
    if (index < 0 || index >= car.photos.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid photo index'
      });
    }
    
    // Delete from Supabase
    const photoUrl = car.photos[index];
    if (photoUrl.includes('supabase.co')) {
      const path = photoUrl.split('/').pop();
      await supabase.storage.from('atlasautos').remove([path]).catch(err => console.error('Supabase photo delete error:', err));
    }
    
    // Remove from array
    car.photos.splice(index, 1);
    
    // Update cover photo if needed
    if (index === 0 && car.photos.length > 0) {
      car.coverPhoto = car.photos[0];
    }
    
    await car.save();
    
    res.status(200).json({
      success: true,
      message: 'Photo deleted successfully',
      photos: car.photos
    });
  } catch (error) {
    console.error('Delete photo error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting photo',
      error: error.message
    });
  }
};

// Toggle favorite
export const toggleFavorite = async (req, res) => {
  try {
    const { id } = req.params;
    
    const car = await Car.findById(id);
    if (!car) {
      return res.status(404).json({
        success: false,
        message: 'Car not found'
      });
    }
    
    const user = await User.findById(req.user.id);
    
    const isFavorite = user.favorites.includes(id);
    
    if (isFavorite) {
      // Remove from favorites
      user.favorites = user.favorites.filter(favId => favId.toString() !== id);
      await user.save();
      
      res.status(200).json({
        success: true,
        message: 'Removed from favorites',
        isFavorite: false
      });
    } else {
      // Add to favorites
      user.favorites.push(id);
      await user.save();
      
      res.status(200).json({
        success: true,
        message: 'Added to favorites',
        isFavorite: true
      });
    }
  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get user's favorites
export const getFavorites = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: 'favorites',
      populate: {
        path: 'seller',
        select: 'fullName dealershipName profilePhoto isVerified state city'
      }
    });
    
    res.status(200).json({
      success: true,
      count: user.favorites.length,
      favorites: user.favorites
    });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Report listing
export const reportListing = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, description } = req.body;
    
    const car = await Car.findById(id);
    
    if (!car) {
      return res.status(404).json({
        success: false,
        message: 'Car not found'
      });
    }
    
    car.reports.push({
      reportedBy: req.user.id,
      reason,
      description
    });
    
    await car.save();
    
    res.status(200).json({
      success: true,
      message: 'Report submitted successfully'
    });
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get cars by seller (public)
export const getCarsBySeller = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { page = 1, limit = 12 } = req.query;
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const [cars, total, seller] = await Promise.all([
      Car.find({ 
        seller: sellerId, 
        availabilityStatus: { $in: ['Available', 'Reserved'] } 
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Car.countDocuments({ 
        seller: sellerId, 
        availabilityStatus: { $in: ['Available', 'Reserved'] } 
      }),
      User.findById(sellerId).select('fullName dealershipName profilePhoto isVerified state city yearsInBusiness businessDescription createdAt')
    ]);
    
    res.status(200).json({
      success: true,
      count: cars.length,
      total,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      seller,
      cars
    });
  } catch (error) {
    console.error('Get cars by seller error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Compare cars
export const compareCars = async (req, res) => {
  try {
    const { carIds } = req.body;
    
    if (!carIds || !Array.isArray(carIds) || carIds.length < 2 || carIds.length > 3) {
      return res.status(400).json({
        success: false,
        message: 'Please provide 2-3 car IDs to compare'
      });
    }
    
    const cars = await Car.find({
      _id: { $in: carIds },
      availabilityStatus: { $in: ['Available', 'Reserved'] }
    }).populate('seller', 'fullName dealershipName profilePhoto isVerified');
    
    if (cars.length < 2) {
      return res.status(404).json({
        success: false,
        message: 'Not enough cars found for comparison'
      });
    }
    
    res.status(200).json({
      success: true,
      cars
    });
  } catch (error) {
    console.error('Compare cars error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
