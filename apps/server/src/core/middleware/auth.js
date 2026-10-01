const jwt = require('jsonwebtoken');
const asyncHandler = require('../asyncHandler');
const User = require('../../modules/auth/User');

// Verifies the Bearer JWT and attaches the authenticated user to req.user.
const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user no longer exists', sessionExpired: true });
    }
    // JWT cannot revoke individual tokens — instead, tokens issued before the last password change expire.
    // Compare in milliseconds (iatMs); Old tokens that do not have iatMs are compared in seconds to `iat`.
    const issuedMs = decoded.iatMs ?? decoded.iat * 1000;
    if (user.passwordChangedAt && issuedMs < user.passwordChangedAt.getTime() - (decoded.iatMs ? 0 : 999)) {
      return res.status(401).json({ message: 'Mật khẩu đã được đổi — đăng nhập lại', sessionExpired: true });
    }
    if (user.disabled) {
      return res.status(403).json({ message: 'Tài khoản đã bị khoá', sessionExpired: true });
    }
    // Latest activity for admin site — sparse writes (10 minutes) to avoid adding a DB write per request.
    if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > 10 * 60 * 1000) {
      User.updateOne({ _id: user._id }, { lastSeenAt: new Date() }).catch(() => {});
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token invalid or expired', sessionExpired: true });
  }
});

// Attaches req.user when a valid Bearer token is sent, without failing when absent —
// for endpoints guests may call but whose answer depends on who is asking.
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
    } catch {
      // invalid token -> treated as a guest
    }
  }
  next();
};

// Use after `protect`. Blocks catalog-management routes (song upload/delete) for
// anyone who isn't role: 'admin' — regular users can browse/like/playlist, not publish.
const isAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Access levels read by hugo-server's describeApi(): the API docs show who may call each route.
protect.access = 'user';
optionalAuth.access = 'optional';
isAdmin.access = 'admin';

module.exports = { protect, optionalAuth, isAdmin };
