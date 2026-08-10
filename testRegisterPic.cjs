const https = require('https');
const crypto = require('crypto');

const email = 'test' + crypto.randomBytes(4).toString('hex') + '@gmail.com';
const boundary = '--------------------------' + crypto.randomBytes(8).toString('hex');

let data = '';
data += '--' + boundary + '\r\nContent-Disposition: form-data; name="fullName"\r\n\r\nTest User Pic\r\n';
data += '--' + boundary + '\r\nContent-Disposition: form-data; name="email"\r\n\r\n' + email + '\r\n';
data += '--' + boundary + '\r\nContent-Disposition: form-data; name="phoneNumber"\r\n\r\n1234567890\r\n';
data += '--' + boundary + '\r\nContent-Disposition: form-data; name="password"\r\n\r\npassword123\r\n';
data += '--' + boundary + '\r\nContent-Disposition: form-data; name="confirmPassword"\r\n\r\npassword123\r\n';
data += '--' + boundary + '\r\nContent-Disposition: form-data; name="state"\r\n\r\nLagos\r\n';
data += '--' + boundary + '\r\nContent-Disposition: form-data; name="city"\r\n\r\nIkeja\r\n';
data += '--' + boundary + '\r\nContent-Disposition: form-data; name="role"\r\n\r\nbuyer\r\n';
data += '--' + boundary + '\r\nContent-Disposition: form-data; name="image"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n';
data += 'fake_image_data_here\r\n';
data += '--' + boundary + '--\r\n';

const options = {
  hostname: 'atlasautos-backend-1.onrender.com',
  port: 443,
  path: '/api/auth/register',
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = https.request(options, res => {
  let d = '';
  res.on('data', chunk => { d += chunk; });
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Body:', d);
  });
});

req.on('error', e => { console.error(e); });
req.write(data);
req.end();
