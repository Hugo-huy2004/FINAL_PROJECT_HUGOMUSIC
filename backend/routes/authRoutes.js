const express = require('express');
const { doc } = require('../utils/apiDocs');
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
  forgotPassword,
  resetPassword,
  removeAvatar,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { RedisRateLimitStore } = require('../utils/rateLimitStore');

const router = express.Router();

// Public avatar streaming endpoint — fast GET for <img> and <Image> components
router.get('/avatar/:username', doc('Ảnh đại diện của người dùng (stream từ R2 hoặc chuyển hướng tới ảnh Google)', {'returns': 'image/*'}), getAvatar);

// Only the endpoints a stranger can hammer without already holding a session token —
// login/OTP/register/google are the brute-force and OTP-guessing targets. Routes below
// this that require `protect` (me/profile/avatar/password) sit behind a real JWT
// already, and a normal session can legitimately hit them often (every screen focus,
// each step of onboarding) — capping those the same way just rate-limits normal use.
// Bộ đếm trong Redis: mọi instance sau bộ cân bằng tải chia chung một hạn mức cho mỗi IP.
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
router.post('/send-email-otp', doc('Đăng ký bước 1: gửi mã 6 số tới email', {'body': {'email': 'email chưa có tài khoản'}, 'returns': '{ tempToken }'}), authLimiter, sendEmailOtp);
router.post('/verify-email-otp', doc('Đăng ký bước 2: xác minh mã email', {'body': {'tempToken': 'từ bước 1', 'code': '6 số'}, 'returns': '{ emailVerifiedToken, email }'}), authLimiter, verifyEmailOtpHandler);
router.post('/register', doc('Đăng ký bước cuối (multipart, kèm ảnh đại diện tuỳ chọn)', {'body': {'email': '', 'password': '≥ 6 ký tự', 'nickname': '', 'emailVerifiedToken': 'từ bước 2', 'avatar': 'tệp ảnh (tuỳ chọn)'}, 'returns': 'User + token'}), authLimiter, avatarUpload.single('avatar'), registerUser);

router.post('/login', doc('Đăng nhập bằng email / tên người dùng / số điện thoại', {'body': {'identifier': 'email, username hoặc SĐT', 'password': ''}, 'returns': 'User + token; admin: { requiresOtp, tempToken }'}), authLimiter, authUser); // admins get { requiresOtp, tempToken } instead of a token
router.post('/verify-otp', doc('Đăng nhập admin bước 2: mã OTP gửi qua Telegram', {'body': {'tempToken': '', 'code': '6 số'}, 'returns': 'User + token'}), authLimiter, verifyOtpHandler); // step 2 of admin login
router.post('/forgot-password', doc('Quên mật khẩu: gửi mã đặt lại qua email (luôn trả cùng dạng — không lộ email nào có tài khoản)', {'body': {'email': ''}, 'returns': '{ tempToken }'}), authLimiter, forgotPassword); // quên mật khẩu: gửi mã qua email
router.post('/reset-password', doc('Đặt lại mật khẩu bằng mã; thu hồi mọi phiên cũ, trả phiên mới', {'body': {'tempToken': '', 'code': '6 số', 'newPassword': '≥ 6 ký tự'}, 'returns': 'User + token'}), authLimiter, resetPassword);   // mã + mật khẩu mới
router.get('/google/start', doc('Bắt đầu đăng nhập Google (chuyển hướng tới Google)', {'query': {'redirect': 'địa chỉ ứng dụng nằm trong danh sách cho phép'}, 'returns': '302 → Google'}), authLimiter, googleStart);
router.get('/google/callback', doc('Google gọi lại: đổi mã lấy phiên rồi quay về ứng dụng với #token=…', {'returns': '302 → ứng dụng'}), authLimiter, googleCallback);
router.get('/me', doc('Hồ sơ của phiên hiện tại', {'returns': 'User'}), protect, getMe);
router.patch('/profile', doc('Sửa hồ sơ (mọi trường đều được kiểm tra)', {'body': {'nickname': '1–40 ký tự', 'phone': 'SĐT Việt Nam', 'musicGenres': 'string[] (≤ 20)', 'dateOfBirth': 'ISO, từ 13 tuổi', 'address': '{ country, province, ward, detail }'}, 'returns': 'User'}), protect, updateProfile);
router.patch('/complete-profile', doc('Bổ sung thông tin còn thiếu (tài khoản cũ/Google)', {'body': {'nickname': '', 'dateOfBirth': '', 'musicGenres': 'string[]', 'country': '', 'province': '', 'ward': '', 'addressDetail': ''}, 'returns': 'User'}), protect, completeProfile); // fills in fields missing on older/Google accounts
router.patch('/avatar', doc('Đổi ảnh đại diện (multipart)', {'body': {'avatar': 'tệp ảnh ≤ 5 MB'}, 'returns': 'User'}), protect, avatarUpload.single('avatar'), updateAvatar);
router.delete('/avatar', doc('Gỡ ảnh đại diện (về ảnh chữ cái mặc định)', { returns: 'User' }), protect, removeAvatar);
router.patch('/password', doc('Đổi mật khẩu; thu hồi mọi phiên khác, trả token mới cho thiết bị này', {'body': {'currentPassword': '', 'newPassword': '≥ 6 ký tự'}, 'returns': '{ message, token }'}), protect, changePassword);
router.delete('/me', doc('Xoá tài khoản của chính mình (cần xác nhận lại)', {'body': {'password': 'tài khoản có mật khẩu', 'confirm': 'tài khoản chỉ Google: gõ lại username'}, 'returns': '{ message }'}), protect, deleteAccount);

module.exports = router;
