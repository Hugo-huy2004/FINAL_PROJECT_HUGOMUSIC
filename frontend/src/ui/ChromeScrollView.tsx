import { forwardRef } from 'react';
import { ScrollView, ScrollViewProps } from 'react-native';
import { useCollapseOnScroll } from './chrome';

// ScrollView báo cho thanh tab/mini player biết người dùng đang cuộn lên hay xuống
// (ui/chrome.ts). Cuộn ngang thì giữ nguyên như ScrollView thường.
const ChromeScrollView = forwardRef<ScrollView, ScrollViewProps>(function ChromeScrollView(props, ref) {
  const collapse = useCollapseOnScroll();
  if (props.horizontal) return <ScrollView ref={ref} {...props} />;
  return (
    <ScrollView
      ref={ref}
      scrollEventThrottle={16}
      {...props}
      onScroll={(e) => {
        collapse.onScroll(e);
        props.onScroll?.(e);
      }}
    />
  );
});

export default ChromeScrollView;
