import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Track } from '../src/types';
import { formatDuration } from '../src/lib/import';

interface Props {
  track: Track;
  isPlaying: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

export function TrackRow({ track, isPlaying, onPress, onLongPress }: Props) {
  return (
    <TouchableOpacity
      style={[styles.container, isPlaying && styles.containerActive]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={styles.artwork}>
        {track.cover_path ? (
          <Image source={{ uri: track.cover_path }} style={styles.cover} />
        ) : (
          <View style={styles.coverPlaceholder}>
            <Ionicons name="musical-note" size={18} color="#666" />
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text
          style={[styles.title, isPlaying && styles.titleActive]}
          numberOfLines={1}
        >
          {track.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {track.artist}
          {track.album && track.album !== 'Unknown Album'
            ? ` · ${track.album}`
            : ''}
        </Text>
      </View>

      <View style={styles.right}>
        {isPlaying && (
          <Ionicons name="volume-high" size={14} color="#1DB954" style={styles.playingIcon} />
        )}
        {track.duration > 0 && (
          <Text style={styles.duration}>{formatDuration(track.duration)}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  containerActive: {
    backgroundColor: '#1a1a1a',
  },
  artwork: {
    marginRight: 12,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 4,
  },
  coverPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 4,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  titleActive: {
    color: '#1DB954',
  },
  sub: {
    color: '#888',
    fontSize: 13,
  },
  right: {
    alignItems: 'flex-end',
    marginLeft: 8,
    gap: 4,
  },
  playingIcon: {
    marginBottom: 2,
  },
  duration: {
    color: '#666',
    fontSize: 12,
  },
});