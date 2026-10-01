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
const { uploadToR2, getR2Stream, deleteFromR2, keyFromR2Url } = require('../utils/r2');
const { client: redis } = require('../config/redis');
const { removeUserCompletely } = require('../utils/userRemoval');

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

// Số điện thoại lưu một dạng duy nhất (0xxxxxxxxx) để "+84 900 000 999", "0900-000-999"… đều khớp khi đăng nhập.
const normalizePhone = (raw) => {
  const digits = String(raw).replace(/[\s.\-()]/g, '');
  return digits.startsWith('+84') ? `0${digits.slice(3)}` : digits;
};


// `iatMs`: thời điểm cấp tính theo mili-giây — `iat` chuẩn chỉ có giây, không đủ để thu hồi đúng một
// phiên cấp cùng giây với lần đổi mật khẩu (authMiddleware so với passwordChangedAt).
const generateToken = (id) => {
  return jwt.sign({ id, iatMs: Date.now() }, process.env.JWT_SECRET, {
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
    return res.status(400).json({ message: 'Email không hợp lệ' });
  }
  if (await User.findOne({ email })) {
    return res.status(400).json({ message: 'Email này đã có tài khoản' });
  }

  const { tempToken, code } = await createOtp(email, 'register');
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

  const email = await verifyOtp(tempToken, code, 'register'); // otpStore's "userId" is the email here
  if (!email) {
    return res.status(401).json({ message: 'Mã không đúng hoặc đã hết hạn' });
  }

  const emailVerifiedToken = await markVerified(email);
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
    return res.status(400).json({ message: 'Cần email đã xác minh, mật khẩu và biệt danh' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự' });
  }
  if (!(await checkVerified(emailVerifiedToken, email))) {
    return res.status(400).json({ message: 'Email chưa được xác minh — hãy lấy mã mới' });
  }
  if (await User.findOne({ email })) {
    return res.status(400).json({ message: 'Email này đã có tài khoản' });
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
    return res.status(400).json({ message: 'Nhập tài khoản và mật khẩu' });
  }

  const user = await User.findOne({
    $or: [
      { email: loginId.toLowerCase() },
      { username: new RegExp(`^${escapeRegex(loginId)}$`, 'i') },
      { phone: normalizePhone(loginId) }
    ]
  });

  if (!user) {
    return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu' });
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
    return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu' });
  }
  if (user.disabled) {
    return res.status(403).json({ message: 'Tài khoản đã bị khoá — liên hệ quản trị viên' });
  }

  if (user.role === 'admin') {
    if (user.telegramChatId) {
      const { tempToken, code } = await createOtp(user._id.toString(), 'admin-login');
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

  const userId = await verifyOtp(tempToken, code, 'admin-login');
  if (!userId) {
    return res.status(401).json({ message: 'Mã không đúng hoặc đã hết hạn' });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(401).json({ message: 'Tài khoản không còn tồn tại' });
  }

  res.json(userResponse(user, { token: generateToken(user._id) }));
});

// Tìm/nối/tạo tài khoản từ thông tin Google đã xác minh. Trả null nếu là admin: 2FA của admin
// vô nghĩa nếu bỏ qua được bằng Google, nên admin phải đi đường mật khẩu + OTP.
async function userFromGoogle(payload) {
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
  return user.role === 'admin' ? null : user;
}

// --- Đăng nhập Google qua chuyển hướng (web + ứng dụng Expo dùng chung) ---
// Ứng dụng mở /google/start trong trình duyệt trong app → Google → /google/callback: server đổi `code`
// lấy ID token bằng client secret, xác minh, cấp phiên rồi quay về địa chỉ ứng dụng đã khai ở /start
// với #token=… (fragment: không lọt vào log máy chủ). `state` ký bằng JWT_SECRET, sống 10 phút, và địa
// chỉ quay về phải thuộc danh sách cho phép — không thể lợi dụng làm open redirect hay giả mạo phiên.
const APP_REDIRECT = /^(exps?:\/\/|hugomusic:\/\/|https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/)/;
const allowedRedirect = (url) =>
  typeof url === 'string' && (APP_REDIRECT.test(url) || (!!process.env.WEB_APP_URL && url.startsWith(process.env.WEB_APP_URL)));
const googleCallbackUrl = (req) => `${process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`}/api/auth/google/callback`;
const oauthClient = (req) => new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, googleCallbackUrl(req));
const withFragment = (url, params) => `${url.split('#')[0]}#${new URLSearchParams(params)}`;

// GET /api/auth/google/start?redirect=<địa chỉ ứng dụng>
const googleStart = asyncHandler(async (req, res) => {
  const { redirect } = req.query;
  if (!allowedRedirect(redirect)) return res.status(400).json({ message: 'Invalid redirect' });
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect(withFragment(redirect, { error: 'Đăng nhập Google chưa được bật' }));
  }
  const state = jwt.sign({ r: redirect }, process.env.JWT_SECRET, { expiresIn: '10m' });
  res.redirect(oauthClient(req).generateAuthUrl({ scope: ['openid', 'email', 'profile'], state, prompt: 'select_account' }));
});

// GET /api/auth/google/callback?code&state (Google gọi về)
const googleCallback = asyncHandler(async (req, res) => {
  let redirect;
  try {
    redirect = jwt.verify(String(req.query.state || ''), process.env.JWT_SECRET).r;
  } catch {
    return res.status(400).send('Phiên đăng nhập Google đã hết hạn. Hãy thử lại từ ứng dụng.');
  }
  if (!allowedRedirect(redirect)) return res.status(400).send('Invalid redirect');
  if (req.query.error || !req.query.code) return res.redirect(withFragment(redirect, { error: 'Đã huỷ đăng nhập Google' }));
  try {
    const client = oauthClient(req);
    const { tokens } = await client.getToken(String(req.query.code));
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const user = await userFromGoogle(ticket.getPayload());
    if (!user) return res.redirect(withFragment(redirect, { error: 'Tài khoản quản trị phải đăng nhập bằng mật khẩu + OTP' }));
    if (user.disabled) return res.redirect(withFragment(redirect, { error: 'Tài khoản đã bị khoá — liên hệ quản trị viên' }));
    res.redirect(withFragment(redirect, { token: generateToken(user._id) }));
  } catch (err) {
    console.warn('[google] callback:', err.message);
    res.redirect(withFragment(redirect, { error: 'Không đăng nhập được bằng Google, thử lại nhé' }));
  }
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
// Mọi trường đều được kiểm tra ở đây (không tin dữ liệu gửi lên); username và email giữ cố định — username là
// định danh đăng nhập, email đổi cần xác minh lại.
const bad = (message) => Object.assign(new Error(message), { status: 400 });
function profileFields(body) {
  const out = {};
  if (body.nickname !== undefined) {
    const v = String(body.nickname || '').trim();
    if (!v || v.length > 40) throw bad('Biệt danh 1–40 ký tự');
    out.nickname = v;
  }
  if (body.phone !== undefined) {
    const v = body.phone ? normalizePhone(body.phone) : '';
    if (v && !/^0\d{9,10}$/.test(v)) throw bad('Số điện thoại không hợp lệ (vd. 0901234567 hoặc +84 901 234 567)');
    out.phone = v || undefined;
  }
  if (body.musicGenres !== undefined) {
    if (!Array.isArray(body.musicGenres)) throw bad('Gu nhạc phải là danh sách');
    out.musicGenres = [...new Set(body.musicGenres.filter((g) => typeof g === 'string' && g.trim()).map((g) => g.trim().slice(0, 40)))].slice(0, 20);
  }
  if (body.dateOfBirth !== undefined) {
    const d = new Date(body.dateOfBirth);
    const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (Number.isNaN(d.getTime()) || age < 13 || age > 120) throw bad('Ngày sinh không hợp lệ (cần từ 13 tuổi)');
    out.dateOfBirth = d;
  }
  if (body.address !== undefined) {
    const a = body.address || {};
    const str = (x) => (typeof x === 'string' ? x.trim().slice(0, 120) : undefined);
    out.address = { country: str(a.country), province: str(a.province), ward: str(a.ward), detail: str(a.detail) };
  }
  return out;
}

const updateProfile = asyncHandler(async (req, res) => {
  const fields = profileFields(req.body);
  if (fields.phone && (await User.exists({ phone: fields.phone, _id: { $ne: req.user._id } }))) {
    return res.status(409).json({ message: 'Số điện thoại này đã được tài khoản khác dùng' });
  }
  req.user.set(fields);
  await req.user.save();
  res.json(userResponse(req.user));
});

// DELETE /api/auth/avatar — gỡ ảnh đại diện (về ảnh chữ cái mặc định), xoá tệp trên R2.
const removeAvatar = asyncHandler(async (req, res) => {
  const key = req.user.avatarUrl?.startsWith('avatars/') ? req.user.avatarUrl : keyFromR2Url(req.user.avatarUrl);
  if (key?.startsWith('avatars/')) await deleteFromR2(key).catch(() => {});
  req.user.avatarUrl = undefined;
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
    return res.status(400).json({ message: 'Chưa chọn ảnh' });
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
    return res.status(400).json({ message: 'Nhập mật khẩu hiện tại và mật khẩu mới' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
  }

  // `protect` intentionally strips `password` from req.user (.select('-password')) so
  // it never leaks into request handlers by default — re-fetch the full document here
  // since this is the one place that legitimately needs the hash.
  const user = await User.findById(req.user._id);
  if (!user.password) {
    return res.status(400).json({ message: 'Tài khoản này đăng nhập bằng Google nên không có mật khẩu' });
  }
  if (!(await user.matchPassword(currentPassword))) {
    return res.status(401).json({ message: 'Mật khẩu hiện tại không đúng' });
  }

  user.password = newPassword; // re-hashed by the pre-save hook
  user.passwordChangedAt = new Date(); // đăng xuất mọi thiết bị khác (authMiddleware)
  await user.save();
  // Thiết bị đang đổi giữ phiên bằng token mới.
  res.json({ message: 'Đã đổi mật khẩu', token: generateToken(user._id) });
});

// --- Quên mật khẩu: email → mã 6 số (5 phút, 5 lần thử) → mật khẩu mới ---
// Không lộ email nào có tài khoản: luôn trả { tempToken } cùng một dạng, gửi mail NGẦM (không chờ) để
// thời gian phản hồi như nhau. Admin không đặt lại qua email được — nếu không, email sẽ là đường vòng
// qua lớp OTP Telegram. Mã gắn mục đích 'password-reset' nên không dùng được ở luồng khác (otpStore).
const RESET_RESEND_SECONDS = 60;
const fakeToken = () => require('crypto').randomBytes(24).toString('hex');

// POST /api/auth/forgot-password { email }
const forgotPassword = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Email không hợp lệ' });
  }
  const user = await User.findOne({ email }).select('_id role email');
  if (!user || user.role === 'admin') return res.json({ tempToken: fakeToken() });

  // Chống dội mail: bấm "gửi lại" trong vòng 60 s thì trả lại đúng phiên cũ (mã đã gửi vẫn dùng được).
  const lastKey = `pwreset:last:${email}`;
  const last = await redis.get(lastKey);
  if (last) return res.json({ tempToken: last });

  const { tempToken, code } = await createOtp(String(user._id), 'password-reset');
  await redis.set(lastKey, tempToken, { EX: RESET_RESEND_SECONDS });
  sendEmail(email, 'Đặt lại mật khẩu Hugo Music',
    `Mã đặt lại mật khẩu của bạn: ${code}\nHết hạn sau 5 phút.\n\nNếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn không thay đổi.`)
    .catch((e) => console.warn('[auth] reset email failed:', e.message));
  res.json({ tempToken });
});

// POST /api/auth/reset-password { tempToken, code, newPassword }
const resetPassword = asyncHandler(async (req, res) => {
  const { tempToken, code, newPassword } = req.body;
  if (!tempToken || !code || !newPassword) {
    return res.status(400).json({ message: 'Nhập mã và mật khẩu mới' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
  }
  const userId = await verifyOtp(tempToken, code, 'password-reset');
  const user = userId && (await User.findById(userId));
  if (!user || user.role === 'admin') {
    return res.status(401).json({ message: 'Mã không đúng hoặc đã hết hạn' });
  }
  if (user.disabled) return res.status(403).json({ message: 'Tài khoản đã bị khoá — liên hệ quản trị viên' });
  user.password = String(newPassword);
  user.passwordChangedAt = new Date(); // mọi phiên cũ (có thể của kẻ gian) hết hiệu lực
  await user.save();
  await redis.del(`pwreset:last:${user.email}`);
  sendEmail(user.email, 'Mật khẩu Hugo Music đã được đổi',
    'Mật khẩu tài khoản của bạn vừa được đặt lại và mọi thiết bị đã bị đăng xuất.\nNếu không phải bạn, hãy đặt lại mật khẩu ngay.')
    .catch((e) => console.warn('[auth] reset notice failed:', e.message));
  // Đăng nhập luôn trên thiết bị vừa đặt lại.
  res.json(userResponse(user, { token: generateToken(user._id) }));
});

// DELETE /api/auth/me — self-service account deletion. Cascades to the user's own
// playlists (their data, meaningless without an owner); leaves songs/likes they
// interacted with alone since those aren't uniquely theirs to take with them.
// Xác nhận lại trước thao tác không hoàn tác: tài khoản có mật khẩu phải nhập mật khẩu; tài khoản chỉ dùng
// Google phải gõ lại tên người dùng — để người cầm máy đang đăng nhập không xoá được tài khoản của người khác.
const deleteAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user.password) {
    if (!(await user.matchPassword(String(req.body?.password || '')))) {
      return res.status(401).json({ message: 'Mật khẩu không đúng' });
    }
  } else if (String(req.body?.confirm || '').trim() !== user.username) {
    return res.status(400).json({ message: `Gõ tên người dùng "${user.username}" để xác nhận xoá` });
  }
  await removeUserCompletely(user);
  res.json({ message: 'Đã xoá tài khoản' });
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
};

if (require.main === module) {
  const assert = require('assert');
  for (const ok of ['exp://192.168.0.102:8081/--/auth', 'hugomusic://auth', 'http://localhost:8081/']) assert(allowedRedirect(ok), ok);
  for (const bad of ['https://evil.com/', 'http://localhost.evil.com/', 'javascript:alert(1)', 'http://localhost:8081', undefined]) assert(!allowedRedirect(bad), String(bad));
  assert.strictEqual(withFragment('exp://x/--/auth#old', { token: 'a b' }), 'exp://x/--/auth#token=a+b');
  for (const p of ['0900000999', '+84900000999', '+84 900 000 999', '0900-000-999', '(090) 000.0999']) assert.strictEqual(normalizePhone(p), '0900000999', p);
  console.log('google redirect self-check: ok');
  require('../config/redis').client.quit().catch(() => {}); // kho OTP mở kết nối Redis — đóng để tiến trình thoát
}
