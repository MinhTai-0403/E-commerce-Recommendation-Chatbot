const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
const file = path.join(projectRoot, 'src/data/mockData.js');
let data = fs.readFileSync(file, 'utf8');

const GOOD_PHONE_1 = "https://cdn2.cellphones.com.vn/insecure/rs:fill:358:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/i/p/iphone-15-pro-max_3.png";

// Replace all CDN product image URLs with the GOOD_PHONE_1 url to ensure no 404s
data = data.replace(/image: 'https:\/\/cdn2\.cellphones\.com\.vn\/insecure[^']*'/g, `image: '${GOOD_PHONE_1}'`);

fs.writeFileSync(file, data);
console.log("All mockData images set to iPhone 15 to fix 404s");
