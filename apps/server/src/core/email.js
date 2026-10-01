const nodemailer = require('nodemailer');

let transporter = null;
const isConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
};

// Falls back to logging the message to the server console when no SMTP account is
// configured, so registration (and its email OTP step) stays testable without one.
const sendEmail = async (to, subject, text) => {
  if (!isConfigured()) {
    console.warn(`[email] Not configured — would send to ${to}: "${subject}"\n  ${text}`);
    return false;
  }
  await getTransporter().sendMail({ from: process.env.EMAIL_FROM || process.env.SMTP_USER, to, subject, text });
  return true;
};

module.exports = { sendEmail };
