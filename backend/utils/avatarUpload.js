const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary if environment variables are present
const isCloudinaryConfigured = () => {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

// Multer memory storage with MIME & file size guard
const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      const err = new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
      err.statusCode = 400;
      return cb(err, false);
    }
    cb(null, true);
  }
});

/**
 * Uploads an image buffer to Cloudinary
 * @param {Buffer} buffer - File buffer
 * @param {string} userId - User identifier to tag/organize
 * @returns {Promise<string>} Secure image URL
 */
const uploadToCloudinary = (buffer, userId) => {
  return new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured()) {
      const err = new Error('Cloudinary service unconfigured: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are required.');
      err.statusCode = 503;
      return reject(err);
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'interviewpro/avatars',
        public_id: `avatar_${userId}_${Date.now()}`,
        overwrite: true,
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve(result.secure_url);
      }
    );

    uploadStream.end(buffer);
  });
};

module.exports = {
  uploadAvatar,
  uploadToCloudinary,
  isCloudinaryConfigured
};
