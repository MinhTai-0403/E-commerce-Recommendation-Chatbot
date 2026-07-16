const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
const legacyDataDir = path.join(projectRoot, 'data/legacy');
const mockDataPath = path.join(projectRoot, 'src/data/mockData.js');
let content = fs.readFileSync(mockDataPath, 'utf8');

const urls = JSON.parse(fs.readFileSync(path.join(legacyDataDir, 'extracted_urls.json'), 'utf8'));

// We have:
// urls.banners (13 items)
// urls.icons (7 items)
// urls.products (12 items)

let bannerIdx = 0;
let iconIdx = 0;
let prodIdx = 0;

function getBanner() {
  const url = urls.banners[bannerIdx % urls.banners.length];
  bannerIdx++;
  return url;
}

function getIcon() {
  const url = urls.icons[iconIdx % urls.icons.length];
  iconIdx++;
  return url;
}

function getProd() {
  const url = urls.products[prodIdx % urls.products.length];
  prodIdx++;
  return url;
}

// Replace Hero Slides
content = content.replace(/image: 'https:\/\/placehold.co\/690x300[^']*'/g, () => `image: '${getBanner()}'`);

// Replace Sub Banners
content = content.replace(/image: 'https:\/\/placehold.co\/220x100[^']*'/g, () => `image: '${getBanner()}'`);

// Replace Promo Strip
content = content.replace(/image: 'https:\/\/placehold.co\/595x100[^']*'/g, () => `image: '${getBanner()}'`);

// Replace Categories Icon
content = content.replace(/icon: 'https:\/\/placehold.co\/100x100[^']*'/g, () => `icon: '${getProd()}'`);

// Replace Products Images
content = content.replace(/image: 'https:\/\/placehold.co\/358x358[^']*'/g, () => `image: '${getProd()}'`);
content = content.replace(/image: 'https:\/\/placehold.co\/100x100[^']*'/g, () => `image: '${getProd()}'`);

// Replace Thumbnail
content = content.replace(/thumbnail: 'https:\/\/placehold.co\/400x200[^']*'/g, () => `thumbnail: '${getBanner()}'`);

fs.writeFileSync(mockDataPath, content, 'utf8');
console.log('Successfully injected REAL CellphoneS CDN URLs into mockData.js');
