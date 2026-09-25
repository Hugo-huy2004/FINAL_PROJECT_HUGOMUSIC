const User = require('../models/User');
const Playlist = require('../models/Playlist');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const asyncHandler = require('../utils/asyncHandler');
const { createOtp, verifyOtp } = require('../utils/otpStore');
const { sendTelegramMessage } = require('../utils/telegram');
const { sendEmail } = require('../utils/email');
const { markVerified, checkVerified } = require('../utils/emailVerification');
const path = require('path');
const { uploadToR2, getR2Stream } = require('../utils/r2');

const getExtFromMime = (mime) => {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'image/svg+xml') return '.svg';
  return '.jpg';
};

// req.file.originalname's extension (memoryStorage keeps it) — falls back to mimetype extension
// rather than defaulting blindly to .jpg.
const avatarKey = (username, originalname, mimetype) => {
  const ext = path.extname(originalname || '') || getExtFromMime(mimetype);
  return `avatars/user_${username}${ext}`;
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const userResponse = (user, extra = {}) => {
  let avatarUrl = user.avatarUrl;
  if (avatarUrl) {
    // R2 private storage URL or key -> route through our public streaming endpoint
    if (avatarUrl.includes('r2.cloudflarestorage.com') || avatarUrl.startsWith('avatars/')) {
      const v = user.updatedAt ? new Date(user.updatedAt).getTime() : 1;
      avatarUrl = `/api/auth/avatar/${encodeURIComponent(user.username)}?v=${v}`;
    }
  }

  return {
    _id: user._id,
    username: user.username,
    nickname: user.nickname,
    email: user.email,
    emailVerified: user.emailVerified,
    phone: user.phone,
    avatarUrl,
    dateOfBirth: user.dateOfBirth,
    musicGenres: user.musicGenres,
    address: user.address,
    role: user.role,
    googleLinked: !!user.googleId, // lets the client hide "change password" for Google-only accounts
    ...extra,
  };
};

// "Nam Nguyen" -> "namnguyen4821". Collisions get a fresh random suffix retried.
const generateUsername = async (seed) => {
  const base =
    (seed || 'user')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // strip accents (Nguyễn -> Nguyen) after NFD split
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]/g, '') || 'user';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await User.findOne({ username: candidate }))) return candidate;
  }
  return `${base}${Date.now().toString().slice(-6)}`;
};

// POST /api/auth/send-email-otp — step 1 of the registration wizard's email step.
const sendEmailOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'A valid email is required' });
  }
  if (await User.findOne({ email })) {
    return res.status(400).json({ message: 'Email already in use' });
  }

  const { tempToken, code } = createOtp(email);
  await sendEmail(email, 'Mã xác minh Hugo Music', `Mã xác minh của bạn: ${code}\nHết hạn sau 5 phút.`);
  res.json({ tempToken });
});

// POST /api/auth/verify-email-otp — step 2: confirms the code, hands back a token the
// final /register call uses as proof this email was actually verified.
const verifyEmailOtpHandler = asyncHandler(async (req, res) => {
  const { tempToken, code } = req.body;
  if (!tempToken || !code) {
    return res.status(400).json({ message: 'tempToken and code are required' });
  }

  const email = verifyOtp(tempToken, code); // otpStore's "userId" is the email here
  if (!email) {
    return res.status(401).json({ message: 'Invalid or expired code' });
  }

  const emailVerifiedToken = markVerified(email);
  res.json({ emailVerifiedToken, email });
});

// POST /api/auth/register — multipart/form-data: the whole signup wizard submits in
// one shot at its final step (see frontend/src/screens/Auth/RegisterWizard.tsx), with
// the avatar file (optional) alongside the other fields.
const registerUser = asyncHandler(async (req, res) => {
  const {
    email,
    password,
    emailVerifiedToken,
    nickname,
    dateOfBirth,
    musicGenres, // JSON-encoded string array
    country,
    province,
    ward,
    addressDetail,
  } = req.body;

  if (!email || !password || !emailVerifiedToken || !nickname) {
    return res.status(400).json({ message: 'Email, password, nickname and a verified email are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }
  if (!checkVerified(emailVerifiedToken, email)) {
    return res.status(400).json({ message: 'Email not verified — request a new code' });
  }
  if (await User.findOne({ email })) {
    return res.status(400).json({ message: 'Email already in use' });
  }

  let parsedGenres = [];
  try {
    parsedGenres = musicGenres ? JSON.parse(musicGenres) : [];
  } catch {
    parsedGenres = [];
  }

  const username = await generateUsername(nickname);

  let avatarUrl;
  if (req.file) {
    try {
      avatarUrl = await uploadToR2(
        req.file.buffer,
        avatarKey(username, req.file.originalname, req.file.mimetype),
        req.file.mimetype
      );
    } catch (err) {
      console.warn('[avatar] upload failed:', err.message);
    }
  }

  const user = await User.create({
    username,
    nickname: nickname.trim(),
    email,
    emailVerified: true,
    password,
    avatarUrl: avatarUrl || undefined,
    dateOfBirth: dateOfBirth || undefined,
    musicGenres: parsedGenres,
    address: { country, province, ward, detail: addressDetail },
  });

  res.status(201).json(userResponse(user, { token: generateToken(user._id) }));
});

// POST /api/auth/login — `identifier` can be an email, username, or phone number.
// Regular users: returns the full session token immediately, as before.
// Admins: password is checked here, but instead of a token this sends an OTP to
// their linked Telegram chat and returns a short-lived tempToken — the session token
// is only issued after POST /api/auth/verify-otp succeeds (see below).
const authUser = asyncHandler(async (req, res) => {
  const { identifier, email, password } = req.body;
  const loginId = (identifier || email || '').trim();
  if (!loginId || !password) {
    return res.status(400).json({ message: 'Identifier and password are required' });
  }

  const user = await User.findOne({
    $or: [
      { email: loginId.toLowerCase() },
      { username: new RegExp(`^${escapeRegex(loginId)}$`, 'i') },
      { phone: loginId }
    ]
  });

  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  let isMatch = false;
  // If user is HugoMusicAdmin, verify against environment variable ADMIN_PASSWORD
  if (user.username === 'HugoMusicAdmin') {
    const envAdminPassword = process.env.ADMIN_PASSWORD;
    if (envAdminPassword && password === envAdminPassword) {
      isMatch = true;
    }
  } else {
    isMatch = await user.matchPassword(password);
  }

  if (!isMatch) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (user.role === 'admin') {
    if (user.telegramChatId) {
      const { tempToken, code } = createOtp(user._id.toString());
      await sendTelegramMessage(user.telegramChatId, `Mã OTP đăng nhập admin: ${code}\nHết hạn sau 5 phút.`);
      return res.json({ requiresOtp: true, tempToken });
    }
    // If Telegram is not yet linked, issue session token directly
    return res.json(userResponse(user, { token: generateToken(user._id) }));
  }

  res.json(userResponse(user, { token: generateToken(user._id) }));
});

// POST /api/auth/verify-otp — step 2 of admin login.
const verifyOtpHandler = asyncHandler(async (req, res) => {
  const { tempToken, code } = req.body;
  if (!tempToken || !code) {
    return res.status(400).json({ message: 'tempToken and code are required' });
  }

  const userId = verifyOtp(tempToken, code);
  if (!userId) {
    return res.status(401).json({ message: 'Invalid or expired code' });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(401).json({ message: 'User no longer exists' });
  }

  res.json(userResponse(user, { token: generateToken(user._id) }));
});

// POST /api/auth/google — regular-user-only "sign in fast with Google". The client
// (Google Identity Services) hands us a signed ID token; it's verified here rather
// than trusting whatever the client claims about who signed in.
const googleAuth = asyncHandler(async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ message: 'idToken is required' });
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({ message: 'Google Sign-In is not configured on the server' });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid Google token' });
  }

  let user = await User.findOne({ googleId: payload.sub });

  if (!user) {
    // Same email already has a password account — link Google to it instead of
    // creating a duplicate.
    user = await User.findOne({ email: payload.email });
    if (user) {
      user.googleId = payload.sub;
      user.emailVerified = true; // Google already verified it
      await user.save();
    }
  }

  if (!user) {
    const username = await generateUsername(payload.name || payload.email.split('@')[0]);
    user = await User.create({
      username,
      nickname: payload.name,
      email: payload.email,
      emailVerified: true, // Google's own checkmark counts — no OTP needed
      googleId: payload.sub,
      avatarUrl: payload.picture,
    });
  }

  // Admin 2FA has no meaning if it can be skipped by signing in with Google instead —
  // so admin accounts are blocked here and must use the password + OTP path.
  if (user.role === 'admin') {
    return res.status(403).json({ message: 'Admin accounts must sign in with email/password + OTP, not Google' });
  }

  res.json(userResponse(user, { token: generateToken(user._id) }));
});

// GET /api/auth/me — lets the frontend rehydrate a saved token into a full user object.
const getMe = asyncHandler(async (req, res) => {
  res.json(userResponse(req.user));
});

// PATCH /api/auth/profile
// Only personalization fields are editable here — username, email, date of birth and
// address were collected once (verified, in the registration wizard's case) and stay
// fixed for the life of the account. Music taste is deliberately the opposite: it's
// meant to be kept current so recommendations stay relevant.
const updateProfile = asyncHandler(async (req, res) => {
  const { nickname, phone, musicGenres } = req.body;

  if (nickname !== undefined) req.user.nickname = nickname.trim();
  if (phone !== undefined) req.user.phone = phone.trim() || undefined;
  if (musicGenres !== undefined) {
    req.user.musicGenres = Array.isArray(musicGenres) ? musicGenres : [];
  }

  await req.user.save();
  res.json(userResponse(req.user));
});

// PATCH /api/auth/complete-profile — for accounts missing fields the registration
// wizard now collects (pre-existing accounts, or ones created via Google, which only
// ever supplies email/name/picture). Each field is only ever set if it's currently
// empty — same "locked once set" rule as the wizard, just applied retroactively
// instead of all at once. Sending a value for a field that's already set is a no-op,
// not an error, so the client can always submit the whole form without checking first.
const completeProfile = asyncHandler(async (req, res) => {
  const { nickname, dateOfBirth, musicGenres, country, province, ward, addressDetail } = req.body;

  if (!req.user.nickname && nickname) req.user.nickname = nickname.trim();
  if (!req.user.dateOfBirth && dateOfBirth) req.user.dateOfBirth = dateOfBirth;
  if ((!req.user.musicGenres || req.user.musicGenres.length === 0) && Array.isArray(musicGenres) && musicGenres.length > 0) {
    req.user.musicGenres = musicGenres;
  }
  if (!req.user.address?.country && country) {
    req.user.address = { country, province, ward, detail: addressDetail };
  }

  await req.user.save();
  res.json(userResponse(req.user));
});

// PATCH /api/auth/avatar — multipart, single file field "avatar". Works any time,
// not just at signup (e.g. from the Member Dashboard's settings later).
const updateAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No image uploaded' });
  }
  const key = avatarKey(req.user.username, req.file.originalname, req.file.mimetype);
  const avatarUrl = await uploadToR2(req.file.buffer, key, req.file.mimetype);
  if (!avatarUrl) {
    return res.status(500).json({ message: 'Avatar storage is not configured on the server' });
  }
  req.user.avatarUrl = avatarUrl;
  await req.user.save();
  res.json(userResponse(req.user, {
    avatarUrl: `/api/auth/avatar/${encodeURIComponent(req.user.username)}?v=${Date.now()}`
  }));
});

// PATCH /api/auth/password — no-op (400) for Google-only accounts, which have no
// password to change.
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'currentPassword and newPassword are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters' });
  }

  // `protect` intentionally strips `password` from req.user (.select('-password')) so
  // it never leaks into request handlers by default — re-fetch the full document here
  // since this is the one place that legitimately needs the hash.
  const user = await User.findById(req.user._id);
  if (!user.password) {
    return res.status(400).json({ message: 'This account signs in with Google and has no password' });
  }
  if (!(await user.matchPassword(currentPassword))) {
    return res.status(401).json({ message: 'Current password is incorrect' });
  }

  user.password = newPassword; // re-hashed by the pre-save hook
  await user.save();
  res.json({ message: 'Password updated' });
});

// DELETE /api/auth/me — self-service account deletion. Cascades to the user's own
// playlists (their data, meaningless without an owner); leaves songs/likes they
// interacted with alone since those aren't uniquely theirs to take with them.
const deleteAccount = asyncHandler(async (req, res) => {
  await Playlist.deleteMany({ owner: req.user._id });
  await User.findByIdAndDelete(req.user._id);
  res.json({ message: 'Account deleted' });
});

// GET /api/auth/avatar/:username — streams user avatar from R2 or redirects to external source
const getAvatar = asyncHandler(async (req, res) => {
  const { username } = req.params;
  if (!username) {
    return res.status(400).json({ message: 'Username is required' });
  }

  const user = await User.findOne({
    username: new RegExp(`^${escapeRegex(username)}$`, 'i'),
  });

  if (!user || !user.avatarUrl) {
    return res.status(404).json({ message: 'Avatar not found' });
  }

  // If it's an external URL (Google OAuth picture, etc.), redirect to it
  if (user.avatarUrl.startsWith('http://') || user.avatarUrl.startsWith('https://')) {
    if (!user.avatarUrl.includes('r2.cloudflarestorage.com')) {
      return res.redirect(user.avatarUrl);
    }
  }

  try {
    let key = user.avatarUrl;
    if (key.includes('r2.cloudflarestorage.com')) {
      const urlObj = new URL(key);
      key = decodeURIComponent(urlObj.pathname.replace(/^\/+/, ''));
      const bucket = process.env.R2_BUCKET_NAME || 'hugomusic';
      if (key.startsWith(bucket + '/')) {
        key = key.replace(bucket + '/', '');
      }
    }

    const s3Res = await getR2Stream(key);
    if (!s3Res || !s3Res.Body) {
      return res.status(404).json({ message: 'Avatar image missing in storage' });
    }

    res.setHeader('Content-Type', s3Res.ContentType || 'image/jpeg');
    if (s3Res.ContentLength) {
      res.setHeader('Content-Length', s3Res.ContentLength);
    }
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return s3Res.Body.pipe(res);
  } catch (err) {
    console.warn('[avatar] getAvatar stream error:', err.message);
    return res.status(404).json({ message: 'Avatar could not be loaded' });
  }
});

module.exports = {
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
};
