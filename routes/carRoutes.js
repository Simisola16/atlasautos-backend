import express from 'express';
import {
  createCar,
  getCars,
  getCarById,
  getSellerCars,
  updateCar,
  deleteCar,
  deleteCarPhoto,
  toggleFavorite,
  getFavorites,
  reportListing,
  getCarsBySeller,
  compareCars
} from '../controllers/carController.js';
import { protect, optionalAuth, restrictTo } from '../middleware/auth.js';
import { uploadFields, handleUploadError } from '../middleware/upload.js';

const router = express.Router();

// Protected routes
router.get('/seller/my-listings', protect, restrictTo('seller'), getSellerCars);

// Public routes
router.get('/', getCars);
router.get('/compare', compareCars);
router.get('/seller/:sellerId', getCarsBySeller);
router.get('/:id', optionalAuth, getCarById);

router.post('/',
  protect,
  restrictTo('seller'),
  uploadFields,
  handleUploadError,
  createCar
);

router.put('/:id', protect, restrictTo('seller'), uploadFields, handleUploadError, updateCar);
router.delete('/:id', protect, restrictTo('seller', 'admin'), deleteCar);
router.delete('/:id/photos/:photoIndex', protect, restrictTo('seller'), deleteCarPhoto);

// Favorites
router.post('/:id/favorite', protect, restrictTo('buyer'), toggleFavorite);
router.get('/user/favorites', protect, restrictTo('buyer'), getFavorites);

// Report
router.post('/:id/report', protect, restrictTo('buyer'), reportListing);

export default router;
