import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Car from '../models/Car.js';
import User from '../models/User.js';

dotenv.config();

const cleanDatabase = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, { dbName: 'atlasautos' });
    console.log('Connected to MongoDB successfully.');

    // 1. Clean Cars
    const cars = await Car.find({});
    console.log(`Found ${cars.length} cars. Checking for legacy Supabase URLs...`);

    let updatedCarsCount = 0;
    for (const car of cars) {
      let modified = false;

      if (car.coverPhoto && car.coverPhoto.includes('supabase.co')) {
        car.coverPhoto = '/assets/luxury_gwagon.png';
        modified = true;
      }

      if (Array.isArray(car.photos) && car.photos.length > 0) {
        const cleanedPhotos = car.photos.map(photo => {
          if (typeof photo === 'string' && photo.includes('supabase.co')) {
            modified = true;
            return '/assets/luxury_gwagon.png';
          }
          return photo;
        });
        if (modified) car.photos = cleanedPhotos;
      }

      if (car.inspectionReport && typeof car.inspectionReport === 'string' && car.inspectionReport.includes('supabase.co')) {
        car.inspectionReport = '';
        modified = true;
      }

      if (modified) {
        await car.save();
        updatedCarsCount++;
      }
    }
    console.log(`Updated ${updatedCarsCount} car documents in MongoDB.`);

    // 2. Clean Users
    const users = await User.find({});
    console.log(`Found ${users.length} users. Checking for legacy Supabase profile photos...`);

    let updatedUsersCount = 0;
    for (const user of users) {
      if (user.profilePhoto && typeof user.profilePhoto === 'string' && user.profilePhoto.includes('supabase.co')) {
        user.profilePhoto = '';
        await user.save();
        updatedUsersCount++;
      }
    }
    console.log(`Updated ${updatedUsersCount} user documents in MongoDB.`);

    console.log('Database cleanup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error cleaning database:', error);
    process.exit(1);
  }
};

cleanDatabase();
