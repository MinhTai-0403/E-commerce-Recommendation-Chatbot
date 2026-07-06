const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
const legacyDataDir = path.join(projectRoot, 'data/legacy');
const data = fs.readFileSync(path.join(legacyDataDir, 'cellphones.html'), 'utf8');

// The original URL regex might have missed some or I can look for /catalog/product/
const regex = /https:\/\/cdn2\.cellphones\.com\.vn\/insecure\/[a-zA-Z0-9-_\/\.:]+/g;
let matches = data.match(regex) || [];

// Look for just plain URLs in the html that are images
const imgRegex = /https:\/\/cdn2\.cellphones\.com\.vn\/insecure\/[^"']+\.(png|jpg|jpeg|gif|webp)/g;
let imgMatches = data.match(imgRegex) || [];

// Look inside window.__NUXT__
const nuxtRegex = /window\.__NUXT__=\((.*)\);/s;
const nuxtMatch = data.match(nuxtRegex);
if (nuxtMatch) {
  // It's a JS object, might be hard to parse, but we can regex it for image URLs
  const nuxtImgRegex = /https:\/\/cdn2\.cellphones\.com\.vn\/insecure\/[^"'\\]+\.(png|jpg|jpeg|gif|webp)/g;
  let nuxtImgMatches = nuxtMatch[1].match(nuxtImgRegex) || [];
  imgMatches = imgMatches.concat(nuxtImgMatches);
}

imgMatches = [...new Set(imgMatches)];

console.log('Total images found:', imgMatches.length);

const products = imgMatches.filter(url => url.includes('/catalog/product/'));
const banners = imgMatches.filter(url => url.includes('/manage-banner/') || url.includes('/sliding-'));
const icons = imgMatches.filter(url => url.includes('icon') || url.includes('/category/'));

fs.writeFileSync(path.join(legacyDataDir, 'extracted_urls.json'), JSON.stringify({
  total: imgMatches.length,
  products: products.slice(0, 50),
  banners: banners.slice(0, 20),
  icons: icons.slice(0, 20),
}, null, 2));

console.log('Extracted:', products.length, 'products,', banners.length, 'banners,', icons.length, 'icons');
