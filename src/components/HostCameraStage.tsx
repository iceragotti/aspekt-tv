import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { aspectTheme } from "../aspectTheme";

interface HostCameraStageProps {
  disabled?: boolean;
}

export const HostCameraStage: React.FC<HostCameraStageProps> = ({ disabled = false }) => {
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || !cameraEnabled || disabled) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      return;
    }

    let cancelled = false;
    setCameraError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Browser unterstützt getUserMedia nicht.");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCameraError(err instanceof Error ? err.message : "Kamera-Zugriff verweigert.");
          setCameraEnabled(false);
        }
      });

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [cameraEnabled, disabled]);

  return (
    <View style={{ gap: 8 }}>
      <TouchableOpacity
        disabled={disabled}
        onPress={() => setCameraEnabled((prev) => !prev)}
        style={{
          alignSelf: "flex-start",
          paddingVertical: 7,
          paddingHorizontal: 12,
          borderRadius: 999,
          backgroundColor: cameraEnabled ? aspectTheme.colors.accentSoft : aspectTheme.colors.surfaceRaised,
          borderWidth: 1,
          borderColor: cameraEnabled ? aspectTheme.colors.accentText : aspectTheme.colors.border,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text style={{ color: cameraEnabled ? aspectTheme.colors.accentText : aspectTheme.colors.textSecondary, fontWeight: "700", fontSize: 12 }}>
          {cameraEnabled ? "KAMERA AN" : "KAMERA AUS"}
        </Text>
      </TouchableOpacity>

      {Platform.OS === "web" && cameraEnabled && !disabled && (
        <View style={{ borderRadius: 10, overflow: "hidden", backgroundColor: "#000", borderWidth: 1, borderColor: aspectTheme.colors.accentText }}>
          {React.createElement("video", {
            ref: (el: HTMLVideoElement | null) => {
              videoRef.current = el;
              if (el && streamRef.current && el.srcObject !== streamRef.current) {
                el.srcObject = streamRef.current;
              }
            },
            autoPlay: true,
            muted: true,
            playsInline: true,
            style: { width: "100%", maxHeight: 320, display: "block", backgroundColor: "#000", transform: "scaleX(-1)" },
          })}
        </View>
      )}

      {cameraError && (
        <Text style={{ color: aspectTheme.colors.accentText, fontSize: 12 }}>{cameraError}</Text>
      )}
    </View>
  );
};
