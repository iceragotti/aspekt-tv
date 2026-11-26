import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { aspectTheme } from "../aspectTheme";

interface LiveUrlPlayerStageProps {
  url: string;
  isLive: boolean;
  disabled?: boolean;
  onSelectPresetUrl?: (nextUrl: string) => void;
}

const DEMO_STREAMS = [
  {
    label: "Test-Stream MP4 (Big Buck Bunny)",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  },
  {
    label: "Test-Stream MP4 (Elephants Dream)",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  },
];

export const LiveUrlPlayerStage: React.FC<LiveUrlPlayerStageProps> = ({
  url,
  isLive,
  disabled = false,
  onSelectPresetUrl,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playerNote, setPlayerNote] = useState<string | null>(null);
  const cleanUrl = url.trim();

  useEffect(() => {
    if (Platform.OS !== "web" || !isLive || disabled || !cleanUrl) {
      setPlayerNote(null);
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) return;

    setPlayerNote(null);
    const isHls = /.m3u8(\?|$)/i.test(cleanUrl);

    if (isHls && !videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      setPlayerNote("Hinweis: .m3u8 erfordert in diesem Browser hls.js oder Safari – wähle ein MP4-Preset oder eine direkte Video-URL.");
      return;
    }

    videoEl.src = cleanUrl;
    videoEl.load();
  }, [cleanUrl, isLive, disabled]);

  return (
    <View style={{ gap: 8 }}>
      {onSelectPresetUrl && !disabled && (
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {DEMO_STREAMS.map((preset) => (
            <TouchableOpacity
              key={preset.url}
              onPress={() => onSelectPresetUrl(preset.url)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 999,
                backgroundColor: cleanUrl === preset.url ? aspectTheme.colors.accentSoft : aspectTheme.colors.surface,
                borderWidth: 1,
                borderColor: cleanUrl === preset.url ? aspectTheme.colors.accentText : aspectTheme.colors.border,
              }}
            >
              <Text style={{ color: cleanUrl === preset.url ? aspectTheme.colors.accentText : aspectTheme.colors.textSecondary, fontSize: 11, fontWeight: "700" }}>
                {preset.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {Platform.OS === "web" && isLive && !disabled && cleanUrl ? (
        <View style={{ borderRadius: 10, overflow: "hidden", backgroundColor: "#000", borderWidth: 1, borderColor: aspectTheme.colors.border }}>
          {React.createElement("video", {
            ref: (el: HTMLVideoElement | null) => {
              videoRef.current = el;
            },
            controls: true,
            autoPlay: true,
            muted: true,
            playsInline: true,
            style: { width: "100%", maxHeight: 340, display: "block", backgroundColor: "#000" },
          })}
        </View>
      ) : (
        <Text style={{ color: aspectTheme.colors.textMuted, fontSize: 12 }}>
          {!isLive ? "Stream ist auf OFFLINE gesetzt – für Wiedergabe auf LIVE AKTIV schalten." : "Keine Stream-URL aktiv."}
        </Text>
      )}

      {playerNote && (
        <Text style={{ color: aspectTheme.colors.accentText, fontSize: 12 }}>{playerNote}</Text>
      )}
    </View>
  );
};
