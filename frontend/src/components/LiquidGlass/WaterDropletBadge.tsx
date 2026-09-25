import React from 'react';
import { View, Text, StyleSheet, Platform, ViewStyle, StyleProp } from 'react-native';

export interface WaterDropletBadgeProps {
  label?: string;
  icon?: React.ReactNode;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  pulsing?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function WaterDropletBadge({
  label,
  icon,
  color = '#10B981',
  size = 'md',
  pulsing = true,
  style,
}: WaterDropletBadgeProps) {
  const sizeMetrics = {
    sm: { dotSize: 7, py: 3, px: 8, fontSize: 10.5, borderRadius: 12 },
    md: { dotSize: 8, py: 4, px: 10, fontSize: 11.5, borderRadius: 14 },
    lg: { dotSize: 10, py: 5, px: 13, fontSize: 13, borderRadius: 18 },
  }[size];

  return (
    <View
      style={[
        styles.container,
        {
          paddingVertical: sizeMetrics.py,
          paddingHorizontal: sizeMetrics.px,
          borderRadius: sizeMetrics.borderRadius,
          borderColor: 'rgba(255, 255, 255, 0.22)',
          backgroundColor: 'rgba(18, 22, 28, 0.75)',
        },
        Platform.OS === 'web' &&
          ({
            backdropFilter: 'blur(20px) saturate(200%)',
            WebkitBackdropFilter: 'blur(20px) saturate(200%)',
            boxShadow: `0 2px 10px -2px ${color}33, inset 0 1px 1.5px rgba(255, 255, 255, 0.45)`,
          } as any),
        style,
      ]}
    >
      {/* Symmetrical Centered Liquid Droplet Indicator */}
      <View
        style={[
          styles.dropletWrapper,
          { width: sizeMetrics.dotSize, height: sizeMetrics.dotSize },
        ]}
      >
        {pulsing && Platform.OS === 'web' && (
          <>
            <span
              className="water-badge-ping-1"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                backgroundColor: color,
                opacity: 0.6,
                transformOrigin: 'center center',
                pointerEvents: 'none',
              }}
            />
            <span
              className="water-badge-ping-2"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                border: `1px solid ${color}`,
                opacity: 0.5,
                transformOrigin: 'center center',
                pointerEvents: 'none',
              }}
            />
          </>
        )}
        <View
          style={[
            styles.dropletCore,
            {
              width: sizeMetrics.dotSize,
              height: sizeMetrics.dotSize,
              borderRadius: sizeMetrics.dotSize / 2,
              backgroundColor: color,
            },
            Platform.OS === 'web' &&
              ({
                boxShadow: `0 0 8px ${color}, inset 0 1px 1px rgba(255,255,255,0.85)`,
              } as any),
          ]}
        />
      </View>

      {icon && <View style={styles.iconWrapper}>{icon}</View>}

      {label && (
        <Text
          style={[
            styles.label,
            {
              fontSize: sizeMetrics.fontSize,
              color: '#ffffff',
            },
          ]}
        >
          {label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  dropletWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  dropletCore: {
    zIndex: 2,
  },
  iconWrapper: {
    marginRight: 5,
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
