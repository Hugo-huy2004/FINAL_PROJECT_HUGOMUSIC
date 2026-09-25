// Mọi thao tác với Cloudflare R2 (API tương thích S3) đi qua tệp này — controller
// và script không tự tạo S3 client riêng.
const {
  S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand,
  ListObjectsV2Command, DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');

const isConfigured = () =>
  !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);

const Bucket = () => process.env.R2_BUCKET_NAME;

let client = null;
const getClient = () => {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
};

// Đẩy một buffer lên R2 (không ghi đĩa) và trả URL đã lưu trong DB.
const uploadToR2 = async (buffer, key, contentType) => {
  if (!isConfigured()) return null;
  await getClient().send(new PutObjectCommand({
    Bucket: Bucket(), Key: key, Body: buffer, ContentType: contentType || 'application/octet-stream',
  }));
  const base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  return `${base}/${key}`;
};

// Luồng đọc một đối tượng, có hỗ trợ HTTP Range ("bytes=0-1023").
const getR2Stream = async (key, range) => {
  if (!isConfigured()) return null;
  return getClient().send(new GetObjectCommand({ Bucket: Bucket(), Key: key, ...(range ? { Range: range } : {}) }));
};

// Đọc trọn một đối tượng ra buffer (dùng cho script xử lý âm thanh).
const readFromR2 = async (key) => {
  const res = await getR2Stream(key);
  if (!res) return null;
  const chunks = [];
  for await (const c of res.Body) chunks.push(c);
  return Buffer.concat(chunks);
};

// Kích thước và kiểu nội dung, không tải dữ liệu.
const headR2 = async (key) => {
  const head = await getClient().send(new HeadObjectCommand({ Bucket: Bucket(), Key: key }));
  return { size: head.ContentLength, contentType: head.ContentType };
};

const deleteFromR2 = async (key) => {
  if (!isConfigured()) return false;
  await getClient().send(new DeleteObjectCommand({ Bucket: Bucket(), Key: key }));
  return true;
};

// Xoá mọi đối tượng dưới một tiền tố (vd. hls/<songId>/), trừ những key mà
// `keep(key)` trả true. Trả số đối tượng đã xoá.
const deletePrefixFromR2 = async (prefix, keep = () => false) => {
  if (!isConfigured()) return 0;
  let deleted = 0;
  let ContinuationToken;
  do {
    const page = await getClient().send(new ListObjectsV2Command({ Bucket: Bucket(), Prefix: prefix, ContinuationToken }));
    const keys = (page.Contents || []).map((o) => o.Key).filter((k) => !keep(k));
    if (keys.length) {
      await getClient().send(new DeleteObjectsCommand({
        Bucket: Bucket(), Delete: { Objects: keys.map((Key) => ({ Key })) },
      }));
      deleted += keys.length;
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return deleted;
};

// URL R2 đã lưu (endpoint S3 hoặc R2_PUBLIC_URL) -> key trong bucket.
const keyFromR2Url = (url) => {
  if (!url) return null;
  try {
    const k = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''));
    const bucket = `${Bucket()}/`;
    return k.startsWith(bucket) ? k.slice(bucket.length) : k;
  } catch {
    return null;
  }
};

module.exports = {
  uploadToR2, getR2Stream, readFromR2, headR2, deleteFromR2, deletePrefixFromR2, keyFromR2Url,
};
