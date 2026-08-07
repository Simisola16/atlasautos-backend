import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Car from '../models/Car.js';
import User from '../models/User.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const cleanDatabase = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, { dbName: 'atlasautos' });
    console.log('Connected to MongoDB successfully.');

    // 1. Clean Cars in raw MongoDB collection
    const cars = await Car.collection.find({}).toArray();
    console.log(`Found ${cars.length} cars in collection. Checking for legacy Supabase URLs...`);

    let updatedCarsCount = 0;
    for (const car of cars) {
      const updateFields = {};

      if (car.coverPhoto && typeof car.coverPhoto === 'string' && car.coverPhoto.includes('supabase.co')) {
        updateFields.coverPhoto = '/assets/luxury_gwagon.png';
      }

      if (Array.isArray(car.photos) && car.photos.length > 0) {
        let photoModified = false;
        const cleanedPhotos = car.photos.map(photo => {
          if (typeof photo === 'string' && photo.includes('supabase.co')) {
            photoModified = true;
            return '/assets/luxury_gwagon.png';
          }
          return photo;
        });
        if (photoModified) {
          updateFields.photos = cleanedPhotos;
        }
      }

      if (car.inspectionReport && typeof car.inspectionReport === 'string' && car.inspectionReport.includes('supabase.co')) {
        updateFields.inspectionReport = '';
      }

      if (Object.keys(updateFields).length > 0) {
        await Car.collection.updateOne({ _id: car._id }, { $set: updateFields });
        updatedCarsCount++;
      }
    }
    console.log(`Updated ${updatedCarsCount} car documents in MongoDB.`);

    // 2. Clean Users in raw MongoDB collection
    const users = await User.collection.find({}).toArray();
    console.log(`Found ${users.length} users in collection. Checking for legacy Supabase profile photos...`);

    let updatedUsersCount = 0;
    for (const user of users) {
      if (user.profilePhoto && typeof user.profilePhoto === 'string' && user.profilePhoto.includes('supabase.co')) {
        await User.collection.updateOne({ _id: user._id }, { $set: { profilePhoto: '' } });
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
