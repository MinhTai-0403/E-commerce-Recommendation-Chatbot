const fs = require('fs');
const path = require('path');
const https = require('https');

const mockDataPath = path.join(__dirname, 'src/data/mockData.js');
const imagesDir = path.join(__dirname, 'public/images');

if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

let mockDataContent = fs.readFileSync(mockDataPath, 'utf8');

// Regex to find all http/https image URLs
const urlRegex = /https?:\/\/[^"']+\.(png|jpg|jpeg|gif|svg|webp)/g;
let urls = [];
let match;
while ((match = urlRegex.exec(mockDataContent)) !== null) {
  urls.push(match[0]);
}

// Remove duplicates
urls = [...new Set(urls)];

console.log(`Found ${urls.length} unique image URLs to download.`);

async function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    const dest = path.join(imagesDir, filename);
    const file = fs.createWriteStream(dest);
    
    // Some CDN need user agent or referer
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://cellphones.com.vn/'
      }
    };

    https.get(url, options, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function processImages() {
  let updatedContent = mockDataContent;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      // Create a safe filename from the URL
      const extension = path.extname(new URL(url).pathname) || '.png';
      const filename = `img_${i}${extension}`;
      
      console.log(`Downloading [${i+1}/${urls.length}] ${url} -> ${filename}`);
      await downloadImage(url, filename);
      
      // Replace the URL in the content with the local path
      const localPath = `/images/${filename}`;
      // Replace all occurrences of this exact URL
      updatedContent = updatedContent.split(url).join(localPath);
      
    } catch (err) {
      console.error(`Error downloading ${url}:`, err.message);
    }
  }

  fs.writeFileSync(mockDataPath, updatedContent, 'utf8');
  console.log('Done! Updated mockData.js with local image paths.');
}

processImages();
