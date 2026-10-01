/**
 * =============================================================================
 * AUTH ROUTES (Mounted at /api/auth)
 * =============================================================================
 * WHAT IT DOES:
 *    - Declares API endpoints for authentication:
 *        POST /api/auth/register            -> Register with email & password
 *        POST /api/auth/login               -> Login with email & password
 *        POST /api/auth/google              -> 1-Click login with Google token
 *        POST /api/auth/passwordless/start  -> Send 6-digit Email OTP (free)
 *        POST /api/auth/passwordless/verify -> Verify OTP code and sign in
 *        GET  /api/auth/me                  -> Get current user profile
 * 
 * WHO CALLS THIS FILE:
 *    - `apps/server/src/index.js`: Automatically discovers and mounts this router.
 * 
 * WHAT THIS FILE CALLS:
 *    - `auth.controller.js`: Forwards requests to corresponding controller functions.
 * =============================================================================
 */

const express = require('express');
const { doc } = require('hugo-server');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const {
  registerUser,
  authUser,
  verifyOtpHandler,
  googleStart,
  googleCallback,
  getMe,
  updateProfile,
  completeProfile,
  updateAvatar,
  getAvatar,
  changePassword,
  deleteAccount,
  sendEmailOtp,
  verifyEmailOtpHandler,
  startPasswordlessLogin,
  verifyPasswordlessLogin,
  forgotPassword,
  resetPassword,
  removeAvatar,
} = require('./controller');
const { protect } = require('../../core/middleware/auth');
const { RedisRateLimitStore } = require('../../core/rateLimitStore');

const router = express.Router();

// Public avatar streaming endpoint — fast GET for <img> and <Image> components
router.get('/avatar/:username', doc('User avatar (streamed from object storage, or redirected to the sign-in provider photo)', {'returns': 'image/*'}), getAvatar);

// Only the endpoints a stranger can hammer without already holding a session token —
// login/OTP/register/google are the brute-force and OTP-guessing targets. Routes below
// this that require `protect` (me/profile/avatar/password) sit behind a real JWT
// already, and a normal session can legitimately hit them often (every screen focus,
// each step of onboarding) — capping those the same way just rate-limits normal use.
// Counter in Redis: every instance behind the load balancer shares the same quota per IP.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, store: new RedisRateLimitStore('rl:auth:') });

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
router.post('/send-email-otp', doc('Sign-up step 1: email a 6-digit code', {'body': {'email': 'email without an account'}, 'returns': '{ tempToken }'}), authLimiter, sendEmailOtp);
router.post('/verify-email-otp', doc('Sign-up step 2: verify the email code', {'body': {'tempToken': 'from step 1', 'code': '6 digits'}, 'returns': '{ emailVerifiedToken, email }'}), authLimiter, verifyEmailOtpHandler);
router.post('/passwordless/start', doc('Passwordless sign-in step 1: email a 6-digit one-time code', {'body': {'email': 'valid email address'}, 'returns': '{ tempToken, email }'}), authLimiter, startPasswordlessLogin);
router.post('/passwordless/verify', doc('Passwordless sign-in step 2: verify the code and return session token', {'body': {'tempToken': 'from step 1', 'code': '6 digits'}, 'returns': 'User + token'}), authLimiter, verifyPasswordlessLogin);
router.post('/register', doc('Sign-up final step (multipart, optional avatar)', {'body': {'email': '', 'password': '≥ 6 characters', 'nickname': '', 'emailVerifiedToken': 'from step 2', 'avatar': 'image file (optional)'}, 'returns': 'User + token'}), authLimiter, avatarUpload.single('avatar'), registerUser);

router.post('/login', doc('Sign in with email, username or phone number', {'body': {'identifier': 'email, username or phone', 'password': ''}, 'returns': 'User + token; admin: { requiresOtp, tempToken }'}), authLimiter, authUser); // admins get { requiresOtp, tempToken } instead of a token
router.post('/verify-otp', doc('Admin sign-in step 2: one-time code sent to the admin messaging bot', {'body': {'tempToken': '', 'code': '6 digits'}, 'returns': 'User + token'}), authLimiter, verifyOtpHandler); // step 2 of admin login
router.post('/forgot-password', doc('Forgot password: email a reset code (same response either way, so it never reveals which emails have accounts)', {'body': {'email': ''}, 'returns': '{ tempToken }'}), authLimiter, forgotPassword); // forgot password: send code via email
router.post('/reset-password', doc('Reset the password with the code; revokes old sessions and returns a new one', {'body': {'tempToken': '', 'code': '6 digits', 'newPassword': '≥ 6 characters'}, 'returns': 'User + token'}), authLimiter, resetPassword);   // code + new password
router.get('/google/start', doc('Start third-party sign-in (OAuth 2.0 redirect to the provider)', {'query': {'redirect': 'app URL from the allow-list'}, 'returns': '302 → sign-in provider'}), authLimiter, googleStart);
router.get('/google/callback', doc('OAuth callback: exchanges the code for a session and returns to the app with #token=…', {'returns': '302 → app'}), authLimiter, googleCallback);
router.get('/me', doc('Profile of the current session', {'returns': 'User'}), protect, getMe);
router.patch('/profile', doc('Edit the profile (every field is validated)', {'body': {'nickname': '1–40 characters', 'phone': 'Vietnamese phone number', 'musicGenres': 'string[] (≤ 20)', 'dateOfBirth': 'ISO date, age 13+', 'address': '{ country, province, ward, detail }'}, 'returns': 'User', errors: { 409: 'The phone number belongs to another account' }}), protect, updateProfile);
router.patch('/complete-profile', doc('Fill in missing profile fields (older or third-party sign-in accounts)', {'body': {'nickname': '', 'dateOfBirth': '', 'musicGenres': 'string[]', 'country': '', 'province': '', 'ward': '', 'addressDetail': ''}, 'returns': 'User'}), protect, completeProfile); // fills in fields missing on older/Google accounts
router.patch('/avatar', doc('Change the avatar (multipart)', {'body': {'avatar': 'image file ≤ 5 MB'}, 'returns': 'User'}), protect, avatarUpload.single('avatar'), updateAvatar);
router.delete('/avatar', doc('Remove the avatar (back to the default initials)', { returns: 'User' }), protect, removeAvatar);
router.patch('/password', doc('Change the password; revokes other sessions and returns a new token for this device', {'body': {'currentPassword': '', 'newPassword': '≥ 6 characters'}, 'returns': '{ message, token }'}), protect, changePassword);
router.delete('/me', doc('Delete your own account (requires re-confirmation)', {'body': {'password': 'accounts with a password', 'confirm': 'accounts without a password: type the username again'}, 'returns': '{ message }'}), protect, deleteAccount);

// Mounted automatically at /api/auth (hugo-server discoverModules); title/description feed the generated API docs.
router.meta = {
  title: 'Auth & account',
  description: 'Sign-up, sign-in (password, OAuth, admin one-time code), profile and account management.',
  guide: `**Sign-up** takes three steps so an address is proven before an account exists:

1. \`POST /send-email-otp\` emails a 6-digit code and returns a \`tempToken\`.
2. \`POST /verify-email-otp\` checks the code and returns an \`emailVerifiedToken\`.
3. \`POST /register\` (multipart, optional avatar) creates the account and returns the user with a token.

**Sign-in.** \`POST /login\` accepts an email, username or phone number. Listeners get a token straight away; administrators get \`{ requiresOtp, tempToken }\` and finish with \`POST /verify-otp\`. Third-party sign-in starts at \`GET /google/start\` (an OAuth 2.0 redirect) and returns to the app with \`#token=…\`.

**Sessions.** Tokens are JSON Web Tokens valid for 30 days. Changing or resetting the password revokes every older token; disabling an account does the same.

**Profile.** \`PATCH /profile\` validates every field (nickname length, phone format, age 13+). \`DELETE /me\` deletes the account only after re-confirmation: the current password, or the username for accounts without one.

All sign-in and code routes are rate limited per IP address.`,
};

module.exports = router;
