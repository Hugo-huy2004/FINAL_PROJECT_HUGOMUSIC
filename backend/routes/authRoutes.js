const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const {
  registerUser,
  authUser,
  verifyOtpHandler,
  googleAuth,
  getMe,
  updateProfile,
  completeProfile,
  updateAvatar,
  getAvatar,
  changePassword,
  deleteAccount,
  sendEmailOtp,
  verifyEmailOtpHandler,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Public avatar streaming endpoint — fast GET for <img> and <Image> components
router.get('/avatar/:username', getAvatar);

// Only the endpoints a stranger can hammer without already holding a session token —
// login/OTP/register/google are the brute-force and OTP-guessing targets. Routes below
// this that require `protect` (me/profile/avatar/password) sit behind a real JWT
// already, and a normal session can legitimately hit them often (every screen focus,
// each step of onboarding) — capping those the same way just rate-limits normal use.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });

// Avatars go straight to R2 from memory — never touch local disk. See utils/r2.js.
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB is plenty for a profile photo
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  },
});

// Registration wizard: email -> OTP -> verified token -> final submit (with avatar).
router.post('/send-email-otp', authLimiter, sendEmailOtp);
router.post('/verify-email-otp', authLimiter, verifyEmailOtpHandler);
router.post('/register', authLimiter, avatarUpload.single('avatar'), registerUser);

router.post('/login', authLimiter, authUser); // admins get { requiresOtp, tempToken } instead of a token
router.post('/verify-otp', authLimiter, verifyOtpHandler); // step 2 of admin login
router.post('/google', authLimiter, googleAuth); // regular users only — see controller comment
router.get('/me', protect, getMe);
router.patch('/profile', protect, updateProfile);
router.patch('/complete-profile', protect, completeProfile); // fills in fields missing on older/Google accounts
router.patch('/avatar', protect, avatarUpload.single('avatar'), updateAvatar);
router.patch('/password', protect, changePassword);
router.delete('/me', protect, deleteAccount);

module.exports = router;
