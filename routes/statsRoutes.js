import express from 'express';
import Car from '../models/Car.js';
import User from '../models/User.js';
import Chat from '../models/Chat.js';

const router = express.Router();

// GET /api/stats — public endpoint returning real platform stats
router.get('/', async (req, res) => {
  try {
    const [totalCars, totalSellers, totalChats] = await Promise.all([
      Car.countDocuments({ availabilityStatus: { $in: ['Available', 'Reserved', 'Sold'] } }),
      User.countDocuments({ role: 'seller' }),
      Chat.countDocuments()
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalCars,
        totalSellers,
        totalChats,
        userRating: 4.8  // static platform rating — update when a ratings system is added
      }
    });
  } catch (error) {
    console.error('Stats fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

export default router;
