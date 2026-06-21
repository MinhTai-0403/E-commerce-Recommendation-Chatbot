const fs = require('fs');
const path = require('path');

const mockDataPath = path.join(__dirname, 'src/data/mockData.js');
let content = fs.readFileSync(mockDataPath, 'utf8');

// We will parse the file as text and use regex to replace images based on the name property right before/after it

const lines = content.split('\n');
let currentName = 'Product';

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  
  // Try to capture name
  const nameMatch = line.match(/name:\s*['"`]([^'"`]+)['"`]/);
  if (nameMatch) {
    currentName = encodeURIComponent(nameMatch[1]);
  }
  
  // Replace image
  if (line.includes('image:')) {
    if (line.includes('sliding-home')) {
      lines[i] = `    image: 'https://placehold.co/690x300/e6f2ff/0066cc?text=Hero+Banner',`;
    } else if (line.includes('b2s-mac') || line.includes('s25-ultra') || line.includes('laptop-sale')) {
      lines[i] = `    image: 'https://placehold.co/220x100/ffe6e6/cc0000?text=Sub+Banner',`;
    } else if (line.includes('home-cate-icon')) {
      lines[i] = `    image: 'https://placehold.co/595x100/e6ffe6/006600?text=Promo+Strip',`;
    } else if (line.includes('honor-x7d-block') || line.includes('mac-b2s-block')) {
       // campaign banners
    } else {
      lines[i] = `    image: 'https://placehold.co/358x358/ffffff/333333?text=${currentName}',`;
    }
  }
  
  if (line.includes('icon:')) {
    if (line.includes('http')) {
      lines[i] = `  icon: 'https://placehold.co/100x100/f5f5f5/333333?text=${currentName}',`;
    }
  }
  
  if (line.includes('thumbnail:')) {
    const titleMatch = lines[i-3] ? lines[i-3].match(/title:\s*['"`]([^'"`]+)['"`]/) : null;
    const title = titleMatch ? encodeURIComponent(titleMatch[1].substring(0, 20)) : 'News';
    lines[i] = `    thumbnail: 'https://placehold.co/400x200/f0f0f0/333333?text=${title}',`;
  }
}

content = lines.join('\n');
fs.writeFileSync(mockDataPath, content, 'utf8');
console.log('Images replaced with smart placeholders containing names.');
