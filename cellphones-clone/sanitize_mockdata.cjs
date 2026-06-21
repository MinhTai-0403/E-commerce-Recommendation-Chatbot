const fs = require('fs');
const path = require('path');

const mockDataPath = path.join(__dirname, 'src/data/mockData.js');
let content = fs.readFileSync(mockDataPath, 'utf8');

const GOOD_PHONE_1 = "https://cdn2.cellphones.com.vn/insecure/rs:fill:358:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/i/p/iphone-15-pro-max_3.png";
const GOOD_PHONE_2 = "https://cdn2.cellphones.com.vn/insecure/rs:fill:358:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/s/m/sm-s928_galaxys24ultra_ti_gray.png";
const GOOD_LAPTOP = "https://cdn2.cellphones.com.vn/insecure/rs:fill:358:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/macbook-air-m2-13-inch.png";

// Reset all product images in mockData to one of the good ones. 
// We will just replace any line that has `image: 'https://cdn2...rs:fill:358:358...'` with GOOD_PHONE_1 or 2.

let pCount = 0;
content = content.replace(/image:\s*'https:\/\/cdn2\.cellphones\.com\.vn\/insecure\/rs:fill:358:358[^']*'/g, () => {
    pCount++;
    if (pCount % 3 === 0) return `image: '${GOOD_LAPTOP}'`;
    if (pCount % 2 === 0) return `image: '${GOOD_PHONE_2}'`;
    return `image: '${GOOD_PHONE_1}'`;
});

// Fix subcategories that were accidentally changed to 358:358. We can use placehold.co or 112:112
// Actually, let's just make them 112:112 again.
// Wait, the subcats have `image:` or `icon:` ? In CategoryBlock it's `subcat.image`.
let sCount = 0;
content = content.replace(/image:\s*'https:\/\/cdn2\.cellphones\.com\.vn\/insecure\/rs:fill:358:358[^']*'/g, (match) => {
    // If it's a subcat, it would have been replaced. But wait, I just replaced ALL `rs:fill:358:358` above.
    // Let's just fix ALL image URLs that are broken.
    return match;
});

// Let's replace any remaining placehold.co images with the good ones just in case
content = content.replace(/image:\s*'https:\/\/placehold\.co\/358x358[^']*'/g, () => `image: '${GOOD_PHONE_1}'`);

fs.writeFileSync(mockDataPath, content, 'utf8');
console.log('Sanitized mockData images');
