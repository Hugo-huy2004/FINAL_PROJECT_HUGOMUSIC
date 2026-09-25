import { Platform } from 'react-native';

// Phát HLS trên web.
//
// Vì sao cần riêng file này: expo-av trên iOS dùng AVPlayer và trên Android dùng
// ExoPlayer — cả hai phát HLS gốc. Nhưng trên web nó dựng thẻ <audio> của HTML5,
// mà Chrome/Firefox/Edge KHÔNG phát được .m3u8 (chỉ Safari phát được). Nên riêng
// web phải tự dựng thẻ audio và gắn hls.js vào.
//
// ABR: hls.js tự chọn biến thể theo băng thông đo được (mặc định, currentLevel = -1).

let hlsInstance: any = null;
let audioEl: HTMLAudioElement | null = null;

export function isWeb() {
  return Platform.OS === 'web';
}

// Safari phát HLS gốc nên không cần hls.js — nạp thư viện vào chỉ tổ thừa.
function safariPlaysHlsNatively(el: HTMLAudioElement) {
  return el.canPlayType('application/vnd.apple.mpegurl') !== '';
}

export function isHlsUrl(url: string) {
  return /\.m3u8(\?|$)/i.test(url);
}

export async function loadHlsWeb(
  url: string,
  autoPlay: boolean,
  token: string | null,
  onStatus: (s: { isPlaying: boolean; isBuffering: boolean; position: number; duration: number; didFinish: boolean }) => void,
  onError: (reason: string) => void,
): Promise<HTMLAudioElement> {
  destroyHlsWeb();

  const el = document.createElement('audio');
  el.preload = 'auto';
  audioEl = el;

  const emit = (over: Partial<{ isBuffering: boolean; didFinish: boolean }> = {}) =>
    onStatus({
      isPlaying: !el.paused && !el.ended,
      isBuffering: false,
      position: el.currentTime || 0,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
      didFinish: el.ended,
      ...over,
    });

  el.addEventListener('timeupdate', () => emit());
  el.addEventListener('play', () => emit());
  el.addEventListener('pause', () => emit());
  el.addEventListener('waiting', () => emit({ isBuffering: true }));
  el.addEventListener('playing', () => emit());
  el.addEventListener('ended', () => emit({ didFinish: true }));
  // Safari phát HLS gốc: lỗi (vd. 401 khi token hết hạn) chỉ lộ qua sự kiện này.
  el.addEventListener('error', () => { if (audioEl === el) onError('media error'); });

  if (safariPlaysHlsNatively(el)) {
    el.src = url;
  } else {
    const Hls = (await import('hls.js')).default;
    if (!Hls.isSupported()) {
      // Trình duyệt quá cũ — rơi về file gốc thay vì im lặng không phát được gì.
      throw new Error('Trình duyệt không hỗ trợ HLS');
    }
    hlsInstance = new Hls({
      enableWorker: true,
      // hls.js phân giải URL đoạn theo đường dẫn TƯƠNG ĐỐI so với tệp danh mục,
      // nên query string chứa token ở master playlist bị mất khi nó tải các
      // đoạn .ts. Phải gắn lại token vào từng request — đây là lý do token được
      // ký theo tiền tố thư mục thay vì theo từng tệp.
      xhrSetup: (xhr: XMLHttpRequest, requestUrl: string) => {
        if (!token || requestUrl.includes('token=')) return;
        const sep = requestUrl.includes('?') ? '&' : '?';
        xhr.open('GET', `${requestUrl}${sep}token=${encodeURIComponent(token)}`, true);
      },
    });
    // Lỗi fatal = hls.js đã thử lại mà vẫn hỏng (thường là 401: token hết hạn giữa bài).
    hlsInstance.on(Hls.Events.ERROR, (_: unknown, data: { fatal: boolean; details: string }) => {
      if (data.fatal) onError(data.details);
    });
    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(el);
  }

  if (autoPlay) el.play().catch(() => {});
  return el;
}

export function destroyHlsWeb() {
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  if (audioEl) {
    audioEl.pause();
    audioEl.src = '';
    audioEl = null;
  }
}

export function getWebAudioEl() {
  return audioEl;
}
