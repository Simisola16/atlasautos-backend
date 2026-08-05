import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Chat from './models/Chat.js';
import User from './models/User.js';
import Car from './models/Car.js';
import { sendNewMessageEmail } from './utils/emailService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

await mongoose.connect(process.env.MONGO_URI, { dbName: 'atlasautos' });

console.log('Fetching existing chats from MongoDB...');
const chats = await Chat.find({})
  .populate('car', 'brand model year price')
  .populate('buyer', 'fullName email')
  .populate('seller', 'fullName dealershipName email');

console.log(`Found ${chats.length} chats in database.`);

if (chats.length > 0) {
  const chat = chats[0];
  console.log('\n--- Chat Info ---');
  console.log('Chat ID:', chat._id);
  console.log('Buyer:', chat.buyer?.fullName, '<' + chat.buyer?.email + '>');
  console.log('Seller:', chat.seller?.fullName, '<' + chat.seller?.email + '>');
  console.log('Car:', chat.car ? `${chat.car.year} ${chat.car.brand} ${chat.car.model}` : 'N/A');

  // Test sending to Seller (from Buyer)
  console.log('\nSimulating message from Buyer to Seller...');
  try {
    const senderName = chat.buyer.fullName;
    const senderRole = 'buyer';
    const carName = chat.car ? `${chat.car.year} ${chat.car.brand} ${chat.car.model}` : 'Vehicle Listing';
    const carPriceFormatted = chat.car?.price ? `₦${chat.car.price.toLocaleString()}` : '';
    const chatLink = `https://atlasautos-one.vercel.app/seller/messages`;

    console.log(`Sending email to seller email: ${chat.seller.email}...`);
    await sendNewMessageEmail(
      chat.seller.email,
      chat.seller.fullName,
      senderName,
      carName,
      chatLink,
      'Hello, is this vehicle available for a test drive this weekend?',
      senderRole,
      carPriceFormatted
    );
    console.log('Seller notification email dispatched SUCCESSFULLY!');
  } catch (err) {
    console.error('Failed to send seller email:', err);
  }

  // Test sending to Buyer (from Seller)
  console.log('\nSimulating message from Seller to Buyer...');
  try {
    const senderName = chat.seller.dealershipName || chat.seller.fullName;
    const senderRole = 'seller';
    const carName = chat.car ? `${chat.car.year} ${chat.car.brand} ${chat.car.model}` : 'Vehicle Listing';
    const carPriceFormatted = chat.car?.price ? `₦${chat.car.price.toLocaleString()}` : '';
    const chatLink = `https://atlasautos-one.vercel.app/chat/${chat._id}`;

    console.log(`Sending email to buyer email: ${chat.buyer.email}...`);
    await sendNewMessageEmail(
      chat.buyer.email,
      chat.buyer.fullName,
      senderName,
      carName,
      chatLink,
      'Yes, the vehicle is available. You can visit our dealership tomorrow at 10 AM.',
      senderRole,
      carPriceFormatted
    );
    console.log('Buyer notification email dispatched SUCCESSFULLY!');
  } catch (err) {
    console.error('Failed to send buyer email:', err);
  }
} else {
  console.log('No chats found in MongoDB.');
}

process.exit(0);
