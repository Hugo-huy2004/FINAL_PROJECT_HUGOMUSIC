# Hugo Music CDN Worker

Phục vụ file nhạc/ảnh bìa thẳng từ R2 qua CDN toàn cầu của Cloudflare, thay cho
việc đẩy mọi byte qua backend Node (`streamSong` trong `backend/controllers/songController.js`).

## Vì sao cần

| | Trước (proxy Node) | Sau (Worker CDN) |
|---|---|---|
| Đường đi | user → Node → R2 → Node → user | user → PoP gần nhất (Hà Nội/TP.HCM) |
| Cache ở edge | Không | Có, `immutable` 1 năm |
| Nút thắt | Toàn bộ nhạc qua 1 server Node | Không có |
| Lỗi ORB trên Chrome | Phải proxy để né | Hết hẳn nhờ header CORS |

## Phân quyền theo prefix key

Worker chạy ở edge nên không truy cập được MongoDB. Vì vậy trạng thái premium
nằm ngay trong đường dẫn key:

- `audio/*` — bài miễn phí, công khai, cache chung ở edge
- `premium/*` — bắt buộc JWT hợp lệ (cùng `JWT_SECRET` với backend), chỉ cache riêng ở trình duyệt
- `covers/*` — ảnh bìa, công khai

## Triển khai

```bash
# 1. Cài wrangler
npm install -g wrangler

# 2. Đăng nhập Cloudflare (mở trình duyệt — bước này phải tự làm)
wrangler login

# 3. Nạp JWT_SECRET (lấy đúng giá trị trong backend/.env)
cd worker
wrangler secret put JWT_SECRET

# 4. Triển khai
wrangler deploy
```

Sau bước 4, wrangler in ra URL dạng `https://hugomusic-cdn.<tên-tài-khoản>.workers.dev`.

```bash
# 5. Chuyển 72 file premium sang prefix premium/
cd ../backend
node scripts/migratePremiumKeys.js --dry-run   # xem trước
node scripts/migratePremiumKeys.js             # chạy thật

# 6. Trỏ app sang Worker: thêm vào backend/.env
#    CDN_BASE_URL=https://hugomusic-cdn.<tên-tài-khoản>.workers.dev
```

## Hạn mức gói miễn phí

100.000 request/ngày. Với HLS (segment 10 giây), một lượt nghe bài 4 phút ≈ 24
request → khoảng **4.100 lượt nghe/ngày**. Vượt hạn mức thì $0.30/triệu request.

## Về sau muốn dùng domain riêng

Trỏ domain vào Worker trong dashboard (Workers → Routes). Không phải sửa code,
chỉ đổi `CDN_BASE_URL`.
