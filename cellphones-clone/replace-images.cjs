const fs = require('fs');
const path = require('path');

const mockDataPath = path.join(__dirname, 'src/data/mockData.js');
let content = fs.readFileSync(mockDataPath, 'utf8');

// For each product/item with a name and an image, we can use a regex to replace its image
// But an easier way is to just replace all /images/img_X.png with placehold.co

// Revert back to the original content before my local image script ran (or just replace the local image paths)
// Actually, it's easier to just replace ANY image path with a placehold.co URL based on context.

content = content.replace(/image:\s*['"`]([^'"`]+)['"`]/g, (match, p1) => {
  // Try to find the name of the product near this image
  // This is a simple script, we'll just use a generic placeholder with a nice color
  return `image: 'https://placehold.co/400x400/f5f5f5/666666?text=Ảnh+Sản+Phẩm'`;
});

content = content.replace(/icon:\s*['"`]([^'"`]+)['"`]/g, (match, p1) => {
  if (p1.startsWith('http') && !p1.includes('placehold.co')) {
    return `icon: 'https://placehold.co/100x100/f5f5f5/333333?text=Icon'`;
  }
  return match; // keep emojis
});

content = content.replace(/thumbnail:\s*['"`]([^'"`]+)['"`]/g, (match, p1) => {
  return `thumbnail: 'https://placehold.co/600x300/f5f5f5/666666?text=Tin+Tức'`;
});

// Fix hero slides specifically to have different text/colors
content = content.replace(/image: 'https:\/\/placehold.co\/400x400\/f5f5f5\/666666\?text=Ảnh\+Sản\+Phẩm'/g, "image: 'https://placehold.co/690x300/f5f5f5/666666?text=Banner'");

fs.writeFileSync(mockDataPath, content, 'utf8');
console.log('Images replaced with placeholders.');
