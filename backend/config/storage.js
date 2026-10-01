// Cấu hình kết nối Cloudflare R2 / AWS S3 Client
const { S3Client } = require('@aws-sdk/client-s3');
const { env } = require('./env');

const isConfigured = () => env.r2.isConfigured();
const Bucket = () => env.r2.bucketName;

let client = null;

const getClient = () => {
  if (!client && isConfigured()) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2.accessKeyId,
        secretAccessKey: env.r2.secretAccessKey,
      },
    });
  }
  return client;
};

module.exports = {
  getClient,
  isConfigured,
  Bucket,
};
