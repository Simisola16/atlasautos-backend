// Live test: hit the real Render server's register endpoint and see what happens
const https = require('https');

function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  // Use a real email address so we can see if it arrives
  const testEmail = 'atlassync1@gmail.com';
  const unique = Date.now();

  console.log(`\n=== Testing LIVE Render registration → email to ${testEmail} ===\n`);

  // Must use unique email or it'll say "user already exists"
  const testUser = `livetest_${unique}@gmail.com`;
  console.log('Registering with:', testUser);

  const r = await httpsPost('https://atlasautos-backend-1.onrender.com/api/auth/register', {
    fullName: 'Email Debug User',
    email: testUser,
    phoneNumber: '08099999999',
    password: 'Debug1234!',
    confirmPassword: 'Debug1234!',
    state: 'Lagos',
    city: 'Victoria Island',
    role: 'buyer'
  });

  console.log('Response status:', r.status);
  try {
    const json = JSON.parse(r.body);
    console.log('Response body:', JSON.stringify(json, null, 2));
  } catch {
    console.log('Response body (raw):', r.body);
  }

  // Now test resend verification to a REAL email we can check
  console.log('\n--- Now resending verification code to atlassync1@gmail.com via resend endpoint ---');
  // First get the email of the new user, then resend
  const r2 = await httpsPost('https://atlasautos-backend-1.onrender.com/api/auth/resend-verification', {
    email: testUser
  });
  console.log('Resend status:', r2.status);
  console.log('Resend body:', r2.body);
}

main().catch(console.error);
