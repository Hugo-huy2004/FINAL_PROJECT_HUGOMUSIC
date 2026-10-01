# Hugo Music

Đồ án COMP1682 (University of Greenwich): dịch vụ nghe nhạc cấp phép mở, phát thích ứng
(HLS + ABR) trên web, iOS và Android. Kỹ thuật nghiên cứu chính là **PSL** — thang bitrate
theo điểm bão hoà cảm nhận ([docs/PSL_TECHNIQUE.md](docs/PSL_TECHNIQUE.md)).

## Cấu trúc

Monorepo: mỗi thư mục trong `apps/` là một thứ được deploy riêng, tên thư mục nói rõ chạy ở đâu.

```
apps/
  server/   API Node/Express + Socket.IO + pipeline xử lý nhạc     → Render (render.yaml)
    src/modules/<tên>/   <tên>.routes.js · .controller.js · .model.js — mỗi module TỰ gắn vào /api/<tên>
                         (hugo-server), tự có trên /api/docs và /api/docs/openapi.json
    src/core/            middleware, r2, email, kindScope…
    src/pipeline/        Job · jobs/ (Release, Psl, Transition, Hls) · cli.js · analyzers/*.py
    scripts/ research/   công cụ quản trị chạy tay · thí nghiệm cho báo cáo
  web/      App web (Expo web export)                              → Vercel (apps/web/vercel.json)
  mobile/   App iOS/Android (Expo)                                 → EAS / Expo Go
  edge/     Cloudflare Worker: kiểm token, phục vụ R2, viết lại playlist HLS → Cloudflare
packages/
  ui/       Thư viện giao diện Liquid Glass tự viết — gói npm `hugo-music` (không dùng thư viện UI bên ngoài)
  api/      `hugo-api`: gọi endpoint bằng chính dòng "GET /api/songs", hook useApi có cache/retry/ETag
  server-kit/ `hugo-server`: doc(), tự gắn module, crud(), OpenAPI, CLI new/types/test
  stream/   `hugo-stream`: token phát (server + edge dùng chung), chọn CDN, lời LRC, đồng bộ nhiều máy
  balancer/ `hugo-balancer`: cân bằng tải tự viết (p2c-EWMA, least-conn, round-robin), cụm tự hồi phục, bench
  client/   Màn hình, store, API client dùng chung cho web + mobile (@hugo/client), dựng từ hugo-music
    src/lib/meta.ts      dữ liệu tham chiếu (thể loại, giấy phép…) lấy từ GET /api/meta, không viết cứng
    scripts/gen-component-docs.mjs  sinh thư viện component từ mã nguồn (JSDoc + kiểu props + *.demos.tsx)
```

Trang nhà phát triển (tự sinh, tiếng Anh): `/developer/components` (thư viện component) và
`/developer/api` (tài liệu API từ route đang chạy).

## Chạy

```bash
npm install            # một lần, ở gốc (npm workspaces cho web + mobile + client)
npm run dev            # server (:5001) + web (:8081)
npm run dev:mobile     # server + Expo cho iOS/Android (mã QR)
npm run clean:ports    # giải phóng cổng 5001 & 8081 nếu bị kẹt
npm run build:web      # bản web tĩnh vào apps/web/dist (đúng lệnh Vercel chạy)
```

Server cần `apps/server/.env` (mẫu: `.env.example`); `cd apps/server && npm install` một lần.
PSL cần ViSQOL: `cd apps/server && python3 -m venv .venv && .venv/bin/pip install visqol-python`.

## Kiểm tra

```bash
npm test               # server + mọi gói hugo-* + client + edge
npm run cluster        # 3 bản API + 1 realtime sau bộ cân bằng tải ở :5001 (kill -HUP = khởi động lại cuốn chiếu)
```

Bộ test tự phát hiện, không có danh sách viết tay: server chạy mọi `src/**/*.test.js` và mọi module có
self-check; client chạy typecheck, kiểm thư viện component còn khớp mã nguồn, và mọi `checks/*.check.mjs`.
Route thiếu mô tả tiếng Anh hoặc component thiếu JSDoc thì test fail.

## Luồng chính

- **Nhạc vào kho:** admin upload (bắt buộc giấy phép + URL nguồn) → `pending` → admin duyệt
  → `published` + tiến trình con `src/pipeline/cli.js approve`: thông tin phát hành & ảnh bìa → PSL →
  phân tích chuyển bài → HLS; từng bước ghi vào `PipelineRun` (DB). Chạy bù cả kho một tác vụ:
  `node apps/server/src/pipeline/cli.js <release|psl|transition|hls> [--limit=N] [--redo]`.
- **Nghe:** app xin token ở `GET /api/songs/:id/playback` → phát qua Worker. Token hết hạn giữa
  bài thì app tự xin lại và phát tiếp đúng vị trí. Khách nghe 3 bài/ngày rồi phải đăng nhập.
- **Nghe cùng nhau** (`apps/server/src/modules/rooms/`, `packages/client/src/rooms/`): server giữ đồng hồ phòng, máy
  đồng bộ giờ kiểu NTP. *Đài 24/7*: đề xuất + bầu bài, server tự chuyển bài. *Nghe mù*: nghe một
  đoạn ở hai mức chất lượng rồi bỏ phiếu — phiếu lưu ở `ListeningVote` để đối chiếu với PSL.
