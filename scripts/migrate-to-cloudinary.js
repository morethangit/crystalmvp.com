#!/usr/bin/env node

/**
 * Image Migration Script - Imgur to Cloudinary
 * Uploads all images from i.imgur.com to Cloudinary and creates a mapping file
 */

const fs = require('fs');
const path = require('path');

// Hardcoded Cloudinary configuration (from user input)
const CLOUDINARY_CLOUD_NAME = 'dqft1ijrq';
const UPLOAD_PRESET = 'crystalmvp';
const IMGUR_BASE = 'https://i.imgur.com';
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// Map of imgur IDs to descriptive public IDs and metadata
const imagesToMigrate = {
  'InoCRZf.png': { publicId: 'hero-logo', type: 'logo' },
  'IEO6BBf.png': { publicId: 'favicon-16', type: 'favicon' },
  'neSyHI0.png': { publicId: 'apple-touch-icon', type: 'favicon' },
  'MDgbIol.jpeg': { publicId: 'slide-1', type: 'hero' },
  'qdsJsrw.jpeg': { publicId: 'slide-2', type: 'hero' },
  'I2tO19L.jpeg': { publicId: 'slide-3', type: 'hero' },
  'e7foQ2d.jpeg': { publicId: 'slide-4', type: 'hero' },
  'XPCHYw4.jpeg': { publicId: 'slide-5', type: 'hero' },
  'FHCdcEd.png': { publicId: 'about-carousel-1', type: 'about' },
  '9w20ODe.jpeg': { publicId: 'about-carousel-2', type: 'about' },
  '5RCLxcj.jpeg': { publicId: 'about-carousel-3', type: 'about' },
  'TbpHNoA.jpeg': { publicId: 'about-carousel-4', type: 'about' },
  'ofqZq7s.jpeg': { publicId: 'about-carousel-5', type: 'about' },
  '3ST9ps3.jpeg': { publicId: 'dest-disney', type: 'destination' },
  'PyF1Q7m.jpeg': { publicId: 'dest-caribbean', type: 'destination' },
  'zY9o6Q3.jpeg': { publicId: 'dest-maldives', type: 'destination' },
  'Wc3NSHn.png': { publicId: 'mvp-circle', type: 'branding' },
  'cQa4ulW.png': { publicId: 'mvp-wordmark', type: 'branding' },
  'WlY38iZ.jpeg': { publicId: 'headshot', type: 'headshot' }
};

// Retry helper
async function retryFetch(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok && i < maxRetries - 1) {
        console.warn(`  Retry ${i + 1}/${maxRetries} for ${url}`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      return response;
    } catch (err) {
      if (i < maxRetries - 1) {
        console.warn(`  Network error, retry ${i + 1}/${maxRetries}`);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }
  }
}

// Download image from imgur
async function downloadImage(imgurId, extension) {
  const url = `${IMGUR_BASE}/${imgurId}.${extension}`;
  console.log(`  Downloading: ${url}`);
  
  try {
    const response = await retryFetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  } catch (err) {
    console.error(`    ✗ Failed to download: ${err.message}`);
    return null;
  }
}

// Upload image to Cloudinary
async function uploadToCloudinary(imageBuffer, publicId, filename) {
  try {
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'application/octet-stream' });
    formData.append('file', blob, filename);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('public_id', publicId);

    const response = await retryFetch(CLOUDINARY_UPLOAD_URL, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }

    console.log(`    ✓ Uploaded as: ${data.public_id}`);
    return {
      publicId: data.public_id,
      secureUrl: data.secure_url,
      cloudinaryUrl: data.secure_url
    };
  } catch (err) {
    console.error(`    ✗ Upload failed: ${err.message}`);
    return null;
  }
}

// Main migration
async function migrate() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║       Imgur to Cloudinary Image Migration              ║');
  console.log('║       Cloud: ' + CLOUDINARY_CLOUD_NAME.padEnd(39) + '║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const results = {};
  const mappings = {};
  let uploaded = 0;
  let failed = 0;

  for (const [filename, metadata] of Object.entries(imagesToMigrate)) {
    const [imgurId, extension] = filename.split('.');
    const imgurUrl = `https://i.imgur.com/${filename}`;
    
    console.log(`\n[${uploaded + failed + 1}/${Object.keys(imagesToMigrate).length}] ${metadata.publicId}`);
    console.log(`  Type: ${metadata.type} | Imgur ID: ${imgurId}`);

    // Download from imgur
    const imageBuffer = await downloadImage(imgurId, extension);
    if (!imageBuffer) {
      failed++;
      results[metadata.publicId] = { status: 'failed', reason: 'download_error' };
      continue;
    }

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(imageBuffer, metadata.publicId, filename);
    if (!uploadResult) {
      failed++;
      results[metadata.publicId] = { status: 'failed', reason: 'upload_error' };
      continue;
    }

    uploaded++;
    results[metadata.publicId] = {
      status: 'success',
      imgurUrl,
      publicId: uploadResult.publicId,
      cloudinaryUrl: uploadResult.cloudinaryUrl
    };
    mappings[imgurUrl] = uploadResult.publicId;
  }

  // Save mapping file
  const mapFilePath = path.join(__dirname, 'cloudinary-map.json');
  fs.writeFileSync(mapFilePath, JSON.stringify(mappings, null, 2));
  console.log(`\n✓ Mapping saved to: ${mapFilePath}`);

  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║                    MIGRATION SUMMARY                   ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║ Uploaded: ${String(uploaded).padEnd(48)}║`);
  console.log(`║ Failed:   ${String(failed).padEnd(48)}║`);
  console.log('╚════════════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\n⚠ Failed uploads:');
    for (const [id, result] of Object.entries(results)) {
      if (result.status === 'failed') {
        console.log(`  - ${id}: ${result.reason}`);
      }
    }
  }

  // Print Cloudinary URLs for verification
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║              CLOUDINARY URLS (FOR REFERENCE)           ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  for (const [id, result] of Object.entries(results)) {
    if (result.status === 'success') {
      console.log(`${id}:`);
      console.log(`  URL: ${result.cloudinaryUrl}`);
    }
  }

  return failed === 0;
}

// Run
migrate()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('\n✗ Migration failed:', err);
    process.exit(1);
  });
