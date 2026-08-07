import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { sendEmail, sendVerificationCodeEmail } from './emailService.js';

async function runTest() {
  console.log('--- EMAIL DIAGNOSTIC TEST ---');
  console.log('RESEND_API_KEY present:', Boolean(process.env.RESEND_API_KEY));
  console.log('EMAIL_FROM:', process.env.EMAIL_FROM);
  console.log('EMAIL_USER:', process.env.EMAIL_USER);

  console.log('\nTesting sendVerificationCodeEmail to recipient...');
  const testRecipient = 'testuser99999@gmail.com'; // Change to test recipient
  try {
    const result = await sendVerificationCodeEmail(testRecipient, 'Test User', '123456');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error during sendVerificationCodeEmail:', err);
  }
}

runTest();
