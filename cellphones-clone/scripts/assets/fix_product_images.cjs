const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
const mockDataPath = path.join(projectRoot, 'src/data/mockData.js');
let content = fs.readFileSync(mockDataPath, 'utf8');

// The tiny icons have 'rs:fill:112:112'. Let's replace them with 358:358 for products
content = content.replace(/rs:fill:112:112/g, 'rs:fill:358:358');

// Let's replace some specific products with real good URLs
content = content.replace(/'https:\/\/cdn2\.cellphones\.com\.vn\/insecure\/rs:fill:358:358\/q:100\/plain\/https:\/\/cellphones\.com\.vn\/media\/tmp\/catalog\/product\/i\/p\/iphone-15-menu-0001\.png'/g, "'https://cdn2.cellphones.com.vn/insecure/rs:fill:358:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/i/p/iphone-15-pro-max_3.png'");

content = content.replace(/'https:\/\/cdn2\.cellphones\.com\.vn\/insecure\/rs:fill:358:358\/q:100\/plain\/https:\/\/cellphones\.com\.vn\/media\/catalog\/product\/d\/o\/dong-ho\.png'/g, "'https://cdn2.cellphones.com.vn/insecure/rs:fill:358:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/s/m/sm-s928_galaxys24ultra_ti_gray.png'");

content = content.replace(/'https:\/\/cdn2\.cellphones\.com\.vn\/insecure\/rs:fill:358:358\/q:100\/plain\/https:\/\/cellphones\.com\.vn\/media\/catalog\/product\/m\/b\/mb-laptop\.png'/g, "'https://cdn2.cellphones.com.vn/insecure/rs:fill:358:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/m/a/macbook-air-m2-13-inch.png'");

fs.writeFileSync(mockDataPath, content, 'utf8');
console.log('Fixed product images sizes');
