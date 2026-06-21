const https = require('https');
const fs = require('fs');

const options = {
  hostname: 'cellphones.com.vn',
  port: 443,
  path: '/',
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    fs.writeFileSync('cellphones.html', data);
    console.log('Saved to cellphones.html');
    
    // Extract real image URLs
    const regex = /https:\/\/cdn2\.cellphones\.com\.vn\/insecure\/[a-zA-Z0-9-_\/\.:]+/g;
    let matches = data.match(regex);
    if (matches) {
      matches = [...new Set(matches)]; // unique
      console.log('Found', matches.length, 'real CDN images');
      fs.writeFileSync('real_images.json', JSON.stringify(matches, null, 2));
    }
  });
});

req.on('error', (e) => {
  console.error(e);
});
req.end();
