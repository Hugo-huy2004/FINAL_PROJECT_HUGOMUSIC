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
  pipeline/              Xử lý bài theo lớp: Job (hợp đồng) · jobs/ Release (album thật + ảnh bìa),
                         Psl (ViSQOL), Transition (chuyển bài liền mạch), Hls · Pipeline (điều phối,
                         ghi từng bước vào PipelineRun) · cli.js · analyzers/*.py
  scripts/catalog|radio|admin/  Công cụ quản trị chạy tay
  rooms/                 Phòng nghe chung: đài 24/7 (stations.js), nghe mù (blindTest.js)
  research/              Thí nghiệm cho báo cáo; kết quả lưu trong DB (ResearchResult), không ghi tệp
worker/                  Cloudflare Worker: kiểm token, phục vụ R2, viết lại playlist HLS
frontend/                Expo (React Native + web); hls.js cho web, expo-av cho iOS/Android
docs/                    Tài liệu kỹ thuật, EXPERIMENTS.md, scrum/ (backlog, sprint)
```

## Chạy

### Chạy cả Backend & Frontend cùng lúc (Khuyên dùng):
```bash
npm run dev          # Chạy đồng thời Backend (:5001) và Expo (mã QR)
npm run dev:web      # Chạy Backend và tự động mở Web (:8081)
npm run dev:ios      # Chạy Backend và mở trên iOS Simulator
npm run dev:android  # Chạy Backend và mở trên Android Emulator
npm run clean:ports  # Dọn dẹp giải phóng cổng 5001 & 8081 nếu bị kẹt
```

### Hoặc chạy từng phần riêng biệt:
```bash
cd backend && npm run dev           # API ở :5001
cd frontend && npx expo start       # Expo (:8081)
```

PSL cần ViSQOL: `cd backend && python3 -m venv .venv && .venv/bin/pip install visqol-python`.

## Kiểm tra

```bash
cd backend && npm test               # token, xét duyệt, pipeline, chuyển bài, phòng, Worker
.venv/bin/python pipeline/analyzers/psl_measure.py --self-check
cd frontend && npx tsc --noEmit
```

## Luồng chính

- **Nhạc vào kho:** admin upload (bắt buộc giấy phép + URL nguồn) → `pending` → admin duyệt
  → `published` + tiến trình con `pipeline/cli.js approve`: thông tin phát hành & ảnh bìa → PSL →
  phân tích chuyển bài → HLS; từng bước ghi vào `PipelineRun` (DB). Chạy bù cả kho một tác vụ:
  `node pipeline/cli.js <release|psl|transition|hls> [--limit=N] [--redo]`.
- **Nghe:** app xin token ở `GET /api/songs/:id/playback` → phát qua Worker. Token hết hạn giữa
  bài thì app tự xin lại và phát tiếp đúng vị trí. Khách nghe 3 bài/ngày rồi phải đăng nhập.
- **Nghe cùng nhau** (`backend/rooms/`, `frontend/src/rooms/`): server giữ đồng hồ phòng, máy
  đồng bộ giờ kiểu NTP. *Đài 24/7*: đề xuất + bầu bài, server tự chuyển bài. *Nghe mù*: nghe một
  đoạn ở hai mức chất lượng rồi bỏ phiếu — phiếu lưu ở `ListeningVote` để đối chiếu với PSL.
