import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

console.log('EMAIL_HOST:', process.env.EMAIL_HOST);
console.log('EMAIL_PORT:', process.env.EMAIL_PORT);
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_PASS length:', process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 0);

const passClean = process.env.EMAIL_PASS ? process.env.EMAIL_PASS.replace(/\s+/g, '') : '';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: passClean
  }
});

async function test() {
  try {
    console.log('Verifying transporter configuration...');
    await transporter.verify();
    console.log('Transporter verified successfully!');

    const info = await transporter.sendMail({
      from: `"AtlasAutos Test" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: 'AtlasAutos Test Email',
      text: 'This is a test email from AtlasAutos.'
    });
    console.log('Test email sent successfully! MessageId:', info.messageId);
  } catch (err) {
    console.error('Email Test Failed:', err);
  }
}

test();
