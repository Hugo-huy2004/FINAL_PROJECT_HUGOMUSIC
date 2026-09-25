import { useWindowDimensions } from 'react-native';

// Below this, the 250px fixed Sidebar (see components/Sidebar/Sidebar.tsx) stops
// leaving reasonable room for content — this is roughly the tablet/phone boundary,
// same breakpoint Spotify/Apple Music's own responsive web players use. Below it,
// HugoLayout swaps the sidebar for BottomTabBar instead of squeezing it in.
const MOBILE_BREAKPOINT = 768;

// Trên ngưỡng này mới thực sự là "desktop rộng": đủ chỗ cho lưới nhiều cột và
// cột phải cố định. Trước đây chỉ có một ngưỡng 768px nên màn 2560px hiển thị y
// hệt màn 800px — cột nội dung kéo dài vô tận mà ảnh bìa vẫn bé.
const DESKTOP_BREAKPOINT = 1280;

export function useIsMobile(): boolean {
  const { width } = useWindowDimensions();
  return width < MOBILE_BREAKPOINT;
}

export function useIsWideDesktop(): boolean {
  const { width } = useWindowDimensions();
  return width >= DESKTOP_BREAKPOINT;
}

// Bề rộng sidebar cố định, trừ ra khi tính vùng nội dung.
export const SIDEBAR_WIDTH = 260;
// Cột phải (đang phát + hàng chờ) chỉ hiện trên desktop rộng.
export const NOW_PLAYING_WIDTH = 300;

/**
 * Tính số cột và bề rộng thẻ theo bề rộng cửa sổ THẬT, thay vì chốt cứng 5 cột.
 *
 * Cách cũ chốt 5 cột cho mọi màn hình từ 768px trở lên: màn 800px thì thẻ bị bóp
 * còn ~120px, màn 2560px thì thẻ phình tới ~450px — cả hai đều sai. Ở đây giữ thẻ
 * quanh một kích thước dễ nhìn rồi suy ra số cột, nên màn càng rộng càng nhiều cột.
 */
export function useGrid(targetCardWidth = 190, gap = 18) {
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;
  const isWide = width >= DESKTOP_BREAKPOINT;

  const sidePadding = isMobile ? 18 : 36;
  const reserved = (isMobile ? 0 : SIDEBAR_WIDTH) + (isWide ? NOW_PLAYING_WIDTH : 0);
  const contentWidth = Math.max(240, width - reserved - sidePadding * 2);

  // Điện thoại luôn 2 cột — dưới 2 cột thì thẻ to lố, trên 2 cột thì chữ bị bóp.
  const columns = isMobile
    ? 2
    : Math.max(3, Math.min(8, Math.floor((contentWidth + gap) / (targetCardWidth + gap))));

  const cardWidth = Math.floor((contentWidth - gap * (columns - 1)) / columns);

  return { columns, cardWidth, contentWidth, gap, sidePadding, isMobile, isWide };
}
