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
    label: "Test-Stream 1 (HLS)",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  },
  {
    label: "Test-Stream 2 (HLS)",
    url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
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

    let hlsInstance: { destroy: () => void } | null = null;
    let cancelled = false;
    setPlayerNote(null);

    const videoEl = videoRef.current;
    if (!videoEl) return;

    const isHls = /\.m3u8(\?|$)/i.test(cleanUrl);

    if (isHls && !videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      import("hls.js")
        .then(({ default: Hls }) => {
          if (cancelled || !videoRef.current) return;
          if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true });
            hls.loadSource(cleanUrl);
            hls.attachMedia(videoRef.current);
            hls.on(Hls.Events.ERROR, (_ev, data) => {
              if (data.fatal && !cancelled) {
                setPlayerNote("HLS-Stream konnte nicht geladen werden (URL/CORS prüfen oder Preset wählen).");
              }
            });
            hlsInstance = hls;
          } else {
            setPlayerNote("HLS wird in diesem Browser nicht direkt unterstützt.");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPlayerNote("hls.js nicht installiert – native Wiedergabe wird versucht.");
          }
        });
    } else {
      videoEl.src = cleanUrl;
    }

    return () => {
      cancelled = true;
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
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
