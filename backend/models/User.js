const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Auto-generated from `nickname` at registration (e.g. "nam" -> "nam4821") — never
  // typed directly by the user. Doubles as a login identifier alongside email/phone.
  username: { type: String, required: true, unique: true },
  // The name actually shown in the UI, chosen freely by the user (can have spaces,
  // unlike username). "Biệt danh hiển thị bên cạnh" from the spec.
  nickname: { type: String },
  email: { type: String, required: true, unique: true },
  emailVerified: { type: Boolean, default: false }, // OTP at signup, or auto-true via Google
  phone: { type: String, unique: true, sparse: true }, // optional extra login identifier
  // Not required: accounts created via Google Sign-In have no password at all.
  password: { type: String },
  googleId: { type: String, unique: true, sparse: true },
  avatarUrl: { type: String }, // R2 URL (see utils/r2.js) or the Google profile picture
  dateOfBirth: { type: Date },
  musicGenres: [{ type: String }],
  address: {
    country: { type: String },
    province: { type: String },
    ward: { type: String },
    detail: { type: String },
  },
  // Where an admin's login OTP gets sent (see controllers/authController.js). Set with
  // backend/scripts/admin/linkTelegram.js — never settable by the user themselves.
  telegramChatId: { type: String },
  // Two roles only. 'user' (every sign-up) listens in full; 'admin' also manages the
  // catalogue and must pass Telegram OTP on login. Promote via scripts/admin/createAdmin.js,
  // never over HTTP. Guests (no account) get 30-second previews — see
  // utils/playbackToken.js.
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
}, { timestamps: true });

// Async pre-save hooks in mongoose 9 don't receive a `next` callback — mongoose
// just awaits the returned promise. (The original code took a `next` param and
// called it, which throws "next is not a function" and breaks every save.)
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false; // Google-only account — no password to match
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
