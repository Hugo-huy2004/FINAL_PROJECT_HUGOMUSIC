import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, StyleProp, ViewStyle, ImageStyle, TextStyle } from 'react-native';
import { getAvatarUri } from '../lib/avatar';

export interface UserAvatarProps {
  avatarUrl?: string | null;
  username?: string | null;
  nickname?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  textStyle?: StyleProp<TextStyle>;
  /** Background colour behind the initials. */
  fallbackBg?: string;
  /** Element shown at the bottom-right (e.g. an admin mark). */
  badge?: React.ReactNode;
}

/** User avatar: uploaded photo, the sign-in provider photo or generated initials, with an optional badge. */
export const UserAvatar: React.FC<UserAvatarProps> = ({
  avatarUrl,
  username,
  nickname,
  size = 38,
  style,
  imageStyle,
  textStyle,
  fallbackBg = '#076653',
  badge,
}) => {
  const [imageError, setImageError] = useState(false);
  const uri = getAvatarUri(avatarUrl, username);

  // Reset error when avatarUrl or username changes
  useEffect(() => {
    setImageError(false);
  }, [avatarUrl, username]);

  const displayName = (nickname || username || 'U').trim();
  const initial = displayName.charAt(0).toUpperCase();
  const radius = Math.round(size / 2);
  const fontSize = Math.max(12, Math.round(size * 0.42));

  return (
    <View style={[{ width: size, height: size, position: 'relative' }, style]}>
      {uri && !imageError ? (
        <Image
          source={{ uri }}
          style={[
            {
              width: size,
              height: size,
              borderRadius: radius,
              backgroundColor: '#1c1c1e',
            },
            imageStyle,
          ]}
          onError={() => setImageError(true)}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: radius,
              backgroundColor: fallbackBg,
            },
          ]}
        >
          <Text style={[styles.text, { fontSize }, textStyle]}>{initial}</Text>
        </View>
      )}
      {badge}
    </View>
  );
};

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
