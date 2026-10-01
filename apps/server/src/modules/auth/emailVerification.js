const crypto = require('crypto');
const { client } = require('../../config/redis');

// Proof that an email address was OTP-verified during registration, so the final
// POST /api/auth/register call can be trusted without re-checking the code itself.
// In Redis (not process memory): verify and register may hit different API instances.
const TTL_SECONDS = 30 * 60; // long enough to finish the rest of the signup wizard
const keyOf = (token) => `emailv:${token}`;

const markVerified = async (email) => {
  const token = crypto.randomBytes(24).toString('hex');
  await client.set(keyOf(token), email, { EX: TTL_SECONDS });
  return token;
};

const checkVerified = async (token, email) => {
  if (typeof token !== 'string') return false;
  return (await client.get(keyOf(token))) === email;
};

module.exports = { markVerified, checkVerified };
