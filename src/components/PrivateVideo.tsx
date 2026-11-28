import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

/** Native streaming preview; private signed URLs must be issued by the authorized backend. */
export default function PrivateVideo() {
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('Gib eine HTTPS-Video-URL zum Testen ein.');
  const player = useVideoPlayer(null);

  const openVideo = async () => {
    try {
      const u = new URL(input.trim());
      if (u.protocol !== 'https:') throw new Error('Nur HTTPS-Links sind zulässig');
      await player.replaceAsync({ uri: u.toString() });
      player.play();
      setMessage('Video wird geladen.');
    } catch {
      setMessage('Video konnte nicht geöffnet werden. Bitte HTTPS-URL und Format prüfen.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>ASPEKT Native Player</Text>
      <Text style={styles.text}>iOS / Android – Wiedergabe von HTTPS-Videoquellen. Private Uploads und sichere signierte Links sind noch nicht verbunden.</Text>
      <Text style={styles.text}>Video-URL</Text>
      <TextInput style={styles.input} accessibilityLabel="Video-URL" autoCapitalize="none"
        autoCorrect={false} keyboardType="url" value={input} onChangeText={setInput}
        placeholder="https://..." placeholderTextColor="#a1a1aa" />
      <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => void openVideo()}>
        <Text style={styles.text}>Video abspielen</Text>
      </TouchableOpacity>
      <VideoView style={styles.video} player={player} nativeControls contentFit="contain" />
      <Text style={styles.text} accessibilityLiveRegion="polite">{message}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { padding: 12, gap: 10, borderRadius: 12, backgroundColor: '#18181b' },
  heading: { color: '#fda4af', fontSize: 18, fontWeight: '700' },
  text: { color: '#f4f4f5', fontSize: 14 },
  input: { color: '#fff', minHeight: 44, borderWidth: 1, borderColor: '#71717a', borderRadius: 8, padding: 10 },
  button: { minHeight: 44, backgroundColor: '#881337', padding: 10, justifyContent: 'center', borderRadius: 8 },
  video: { width: '100%', height: 210, backgroundColor: '#000' },
});
