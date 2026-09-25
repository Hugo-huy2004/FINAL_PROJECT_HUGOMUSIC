# Hugo Music

Đồ án COMP1682 (University of Greenwich): dịch vụ nghe nhạc cấp phép mở, phát thích ứng
(HLS + ABR) trên web, iOS và Android. Kỹ thuật nghiên cứu chính là **PSL** — thang bitrate
theo điểm bão hoà cảm nhận ([docs/PSL_TECHNIQUE.md](docs/PSL_TECHNIQUE.md)).

## Cấu trúc

```
backend/                 API Node/Express + MongoDB + Redis
  controllers/ routes/   API; songController.js chứa luồng upload → duyệt → token phát
  models/                Song (status pending/published/rejected), User, Playlist, …
  utils/playbackToken.js Cổng ký token phát + hạn mức khách (3 bài/ngày)
  utils/songReview.js    Kiểm tra hai tầng: bản quyền (chặn) + chất lượng (cảnh báo)
  utils/r2.js            Mọi thao tác với Cloudflare R2
  scripts/streaming/     buildHls.js (đo PSL nếu chưa đo → cắt HLS → R2), psl_measure.py (ViSQOL)
  scripts/catalog|radio|admin/  Công cụ quản trị chạy tay
  research/              Thí nghiệm cho báo cáo; kết quả ở research/results/
worker/                  Cloudflare Worker: kiểm token, phục vụ R2, viết lại playlist HLS
frontend/                Expo (React Native + web); hls.js cho web, expo-av cho iOS/Android
docs/                    Tài liệu kỹ thuật, EXPERIMENTS.md, scrum/ (backlog, sprint)
```

## Chạy

```bash
cd backend && cp .env.example .env   # điền MongoDB, R2, JWT_SECRET
npm install && npm run dev           # API ở :5001
cd frontend && npm install && npx expo start --web   # :8081
```

PSL cần ViSQOL: `cd backend && python3 -m venv .venv && .venv/bin/pip install visqol-python`.

## Kiểm tra

```bash
cd backend && npm test               # token, xét duyệt, thang HLS, Worker
.venv/bin/python scripts/streaming/psl_measure.py --self-check
cd frontend && npx tsc --noEmit
```

## Luồng chính

- **Nhạc vào kho:** admin upload (bắt buộc giấy phép + URL nguồn) → `pending` → admin duyệt
  → `published` + chạy nền `buildHls.js --id` (log: `backend/logs/pipeline.log`).
- **Nghe:** app xin token ở `GET /api/songs/:id/playback` → phát qua Worker. Token hết hạn giữa
  bài thì app tự xin lại và phát tiếp đúng vị trí. Khách nghe 3 bài/ngày rồi phải đăng nhập.
