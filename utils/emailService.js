import path from 'path';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

// Lazy getter for Resend client to prevent startup crash if RESEND_API_KEY is missing
const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[Resend Warning] RESEND_API_KEY environment variable is not defined.');
    return null;
  }
  return new Resend(apiKey);
};

// Default sender address (uses atlassync.company domain unless EMAIL_FROM is customized)
const getDefaultSender = () => process.env.EMAIL_FROM || 'AtlasAutos <notifications@atlassync.company>';

// Send email using Resend SDK
export const sendEmail = async ({ from, to, subject, html }) => {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.error('[Resend Error] Cannot send email: RESEND_API_KEY environment variable is missing.');
      return null;
    }

    const sender = from || getDefaultSender();
    const { data, error } = await resend.emails.send({
      from: sender,
      to: Array.isArray(to) ? to : [to],
      subject,
      html
    });

    if (error) {
      console.error('[Resend Email Error]:', error);
      return null;
    }

    console.log(`[Resend Email Sent] ID: ${data?.id} To: ${to}`);
    return data;
  } catch (error) {
    console.error('[Email Dispatch Failed]:', error.message);
    return null;
  }
};

// Email template wrapper with AtlasAutos branding
const emailTemplate = (title, content, ctaText = '', ctaLink = '') => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f0f0f; color: #ffffff; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; background-color: #1a1a1a; }
    .header { background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); padding: 30px 20px; text-align: center; border-bottom: 3px solid #F97316; }
    .logo { font-size: 28px; font-weight: bold; color: #F97316; letter-spacing: 2px; }
    .logo span { color: #ffffff; }
    .content { padding: 40px 30px; }
    .title { font-size: 24px; font-weight: 600; margin-bottom: 20px; color: #F97316; }
    .text { font-size: 16px; color: #e0e0e0; margin-bottom: 15px; }
    .highlight { background-color: #2d2d2d; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F97316; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #F97316 0%, #ea580c 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 20px 0; text-transform: uppercase; letter-spacing: 1px; }
    .cta-button:hover { background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); }
    .footer { background-color: #0f0f0f; padding: 30px; text-align: center; border-top: 1px solid #2d2d2d; }
    .footer-text { font-size: 12px; color: #888888; margin-bottom: 10px; }
    .social-links { margin-top: 15px; }
    .social-links a { color: #F97316; text-decoration: none; margin: 0 10px; font-size: 14px; }
    .divider { height: 1px; background-color: #2d2d2d; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">ATLAS<span>AUTOS</span></div>
    </div>
    <div class="content">
      <h1 class="title">${title}</h1>
      ${content}
      ${ctaText && ctaLink ? `<a href="${ctaLink}" class="cta-button">${ctaText}</a>` : ''}
    </div>
    <div class="footer">
      <div class="divider"></div>
      <p class="footer-text">You're receiving this because you have an account on AtlasAutos</p>
      <p class="footer-text">© ${new Date().getFullYear()} AtlasAutos. All rights reserved.</p>
      <div class="social-links">
        <a href="#">Privacy</a>
        <a href="#">Terms</a>
        <a href="#">Support</a>
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

// Send welcome email to buyers
export const sendBuyerWelcomeEmail = async (email, name) => {
  const content = `
    <p class="text">Hello ${name},</p>
    <p class="text">Welcome to <strong>AtlasAutos</strong> - Nigeria's premier car marketplace!</p>
    <div class="highlight">
      <p class="text"><strong>Your account has been successfully created as a Buyer.</strong></p>
      <p class="text">You can now:</p>
      <ul style="color: #e0e0e0; margin-left: 20px; margin-top: 10px;">
        <li>Browse thousands of verified car listings</li>
        <li>Save your favorite cars</li>
        <li>Chat directly with sellers in real-time</li>
        <li>Compare cars side by side</li>
      </ul>
    </div>
    <p class="text">Start your car search today and find your dream vehicle!</p>
  `;

  await sendEmail({
    to: email,
    subject: 'Welcome to AtlasAutos - Your Car Search Starts Here!',
    html: emailTemplate('Welcome to AtlasAutos!', content, 'Browse Cars', `${process.env.CLIENT_URL}/browse`)
  });
};

// Send welcome email to sellers
export const sendSellerWelcomeEmail = async (email, name, dealershipName) => {
  const content = `
    <p class="text">Hello ${name},</p>
    <p class="text">Welcome to <strong>AtlasAutos</strong> - Nigeria's premier car marketplace!</p>
    <div class="highlight">
      <p class="text"><strong>Your seller account for "${dealershipName}" has been successfully created and verified.</strong></p>
      <p class="text">As a seller, you can now:</p>
      <ul style="color: #e0e0e0; margin-left: 20px; margin-top: 10px;">
        <li>List unlimited cars for sale</li>
        <li>Receive inquiries from potential buyers</li>
        <li>Chat with buyers in real-time</li>
        <li>Track views and performance of your listings</li>
      </ul>
    </div>
    <p class="text">Head over to your dashboard to list your first car!</p>
  `;

  await sendEmail({
    to: email,
    subject: 'Welcome to AtlasAutos - Start Selling Cars Today!',
    html: emailTemplate('Welcome to AtlasAutos!', content, 'Go to Dashboard', `${process.env.CLIENT_URL}/seller/dashboard`)
  });
};

// Send password reset email
export const sendPasswordResetEmail = async (email, name, resetToken) => {
  const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
  
  const content = `
    <p class="text">Hello ${name},</p>
    <p class="text">We received a request to reset your password for your AtlasAutos account.</p>
    <div class="highlight">
      <p class="text"><strong>Click the button below to reset your password.</strong></p>
      <p class="text" style="font-size: 14px; margin-top: 10px;">This link will expire in 1 hour for security reasons.</p>
    </div>
    <p class="text">If you didn't request this password reset, you can safely ignore this email.</p>
  `;

  await sendEmail({
    to: email,
    subject: 'Password Reset Request - AtlasAutos',
    html: emailTemplate('Reset Your Password', content, 'Reset Password', resetLink)
  });
};

// Send new message notification email
export const sendNewMessageEmail = async (
  email,
  recipientName,
  senderName,
  carName,
  chatLink,
  messageSnippet = '',
  senderRole = '',
  carPrice = ''
) => {
  const roleBadge = senderRole
    ? `<span style="background-color: #F97316; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-left: 8px;">${senderRole}</span>`
    : '';

  const snippetHtml = messageSnippet
    ? `
      <div style="background-color: #111111; padding: 16px; border-radius: 8px; border-left: 4px solid #F97316; margin-top: 15px;">
        <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #888888; font-weight: 600; margin-bottom: 6px;">Message Preview</p>
        <p style="font-size: 15px; color: #ffffff; font-style: italic; white-space: pre-wrap; word-break: break-word;">"${messageSnippet}"</p>
      </div>
    `
    : '';

  const priceHtml = carPrice
    ? `<p class="text" style="color: #F97316; font-size: 18px; font-weight: 700; margin-top: 4px;">${carPrice}</p>`
    : '';

  const content = `
    <p class="text">Hello <strong>${recipientName}</strong>,</p>
    <p class="text">You have received a new message on <strong>AtlasAutos</strong>.</p>

    <div class="highlight" style="background-color: #222222; border-left: 4px solid #F97316; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p class="text" style="margin-bottom: 8px;">
        <strong style="color: #888888; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Sender:</strong><br>
        <span style="font-size: 17px; font-weight: 600; color: #ffffff;">${senderName}</span> ${roleBadge}
      </p>
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #333333;">
        <p class="text" style="margin-bottom: 2px;">
          <strong style="color: #888888; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Vehicle Listing:</strong>
        </p>
        <p style="font-size: 16px; font-weight: 600; color: #ffffff;">${carName}</p>
        ${priceHtml}
      </div>
      ${snippetHtml}
    </div>

    <p class="text">Click the button below to view the full conversation and send your reply.</p>

    <div style="margin-top: 25px; padding: 14px 18px; background-color: rgba(249, 115, 22, 0.08); border-radius: 8px; border: 1px solid rgba(249, 115, 22, 0.25); font-size: 13px; color: #cccccc; line-height: 1.5;">
      <strong style="color: #F97316;">🛡️ Safety Reminder:</strong> For your security, keep all communications and payment discussions inside AtlasAutos.
    </div>
  `;

  await sendEmail({
    to: email,
    subject: `New message from ${senderName} regarding ${carName} - AtlasAutos`,
    html: emailTemplate('New Message Notification', content, 'View & Reply to Message', chatLink)
  });
};

// Send listing published confirmation to seller
export const sendListingPublishedEmail = async (email, sellerName, carDetails) => {
  const content = `
    <p class="text">Hello ${sellerName},</p>
    <p class="text">Your car listing has been successfully published on <strong>AtlasAutos</strong>!</p>
    <div class="highlight">
      <p class="text"><strong>Listing Details:</strong></p>
      <p class="text" style="margin-top: 10px;">${carDetails.year} ${carDetails.brand} ${carDetails.model}</p>
      <p class="text" style="color: #F97316; font-size: 20px; font-weight: 600; margin-top: 5px;">${carDetails.price}</p>
      <p class="text" style="margin-top: 10px;">Condition: ${carDetails.condition}</p>
    </div>
    <p class="text">Your listing is now live and visible to thousands of potential buyers!</p>
  `;

  await sendEmail({
    to: email,
    subject: 'Your Car Listing is Now Live! - AtlasAutos',
    html: emailTemplate('Listing Published Successfully', content, 'View My Listings', `${process.env.CLIENT_URL}/seller/listings`)
  });
};

// Send 6-digit email verification code
export const sendVerificationCodeEmail = async (email, name, code) => {
  const content = `
    <p class="text">Hello ${name},</p>
    <p class="text">Thank you for signing up on <strong>AtlasAutos</strong>!</p>
    <div class="highlight" style="text-align: center;">
      <p class="text"><strong>Your 6-Digit Verification Code is:</strong></p>
      <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #F97316; margin: 20px 0; background: #111; padding: 15px; border-radius: 8px; border: 1px dashed #F97316;">
        ${code}
      </div>
      <p class="text" style="font-size: 13px; color: #aaa;">This code will expire in 30 minutes. Enter this code to verify your account.</p>
    </div>
    <p class="text">If you did not request this, please ignore this email.</p>
  `;

  await sendEmail({
    to: email,
    subject: `${code} is your AtlasAutos Verification Code`,
    html: emailTemplate('Verify Your Email', content)
  });
};

// Send email verification link for sellers
export const sendVerificationEmail = async (email, name, verificationToken) => {
  const verifyLink = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;
  
  const content = `
    <p class="text">Hello ${name},</p>
    <p class="text">Thank you for registering as a seller on <strong>AtlasAutos</strong>!</p>
    <div class="highlight">
      <p class="text"><strong>Please verify your email address to activate your seller account.</strong></p>
      <p class="text" style="font-size: 14px; margin-top: 10px;">This verification link will expire in 24 hours.</p>
    </div>
    <p class="text">Once verified, you'll be able to list cars and start selling on AtlasAutos!</p>
  `;

  await sendEmail({
    to: email,
    subject: 'Verify Your Email - AtlasAutos Seller Account',
    html: emailTemplate('Verify Your Email', content, 'Verify Email Now', verifyLink)
  });
};

export default sendEmail;
