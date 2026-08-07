import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { register } from '../controllers/authController.js';
import User from '../models/User.js';

async function testRegistration() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, { dbName: 'atlasautos' });
    console.log('Connected to MongoDB.');

    const testEmail = `test_seller_${Date.now()}@gmail.com`;

    const req = {
      body: {
        fullName: 'Test Seller',
        email: testEmail,
        phoneNumber: '08012345678',
        password: 'Password123',
        confirmPassword: 'Password123',
        state: 'Lagos',
        city: 'Ikeja',
        role: 'seller',
        dealershipName: 'Test Auto Dealership',
        dealershipAddress: '123 Test Street, Ikeja',
        businessDescription: 'Quality tested cars',
        yearsInBusiness: '5'
      }
    };

    let responseData = null;
    let statusCode = null;

    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        responseData = data;
        return res;
      }
    };

    console.log(`\nAttempting registration for ${testEmail}...`);
    await register(req, res);

    console.log(`Status Code: ${statusCode}`);
    console.log('Response:', JSON.stringify(responseData, null, 2));

    // Cleanup test user
    await User.deleteOne({ email: testEmail });
    console.log('Cleaned up test user.');
    process.exit(0);
  } catch (err) {
    console.error('Test Registration Failed with error:', err);
    process.exit(1);
  }
}

testRegistration();
