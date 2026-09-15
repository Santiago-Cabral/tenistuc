import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '../../theme';

interface Props {
  uri?: string | null;
  size?: number;
  online?: boolean;
}

export function Avatar({ uri, size = 40, online = false }: Props) {
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[styles.placeholder, { borderRadius: size / 2 }]} />
        )}
      </View>
      {online && (
        <View style={[styles.dot, { width: size * 0.28, height: size * 0.28, borderRadius: size * 0.14, bottom: 0, right: 0 }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: Colors.surfaceContainerHigh },
  placeholder: { flex: 1, backgroundColor: Colors.surfaceContainerHighest },
  dot: {
    position: 'absolute',
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: Colors.surfaceContainerLowest,
  },
});