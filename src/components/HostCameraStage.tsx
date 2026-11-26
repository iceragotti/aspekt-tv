import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { aspectTheme } from "../aspectTheme";

interface HostCameraStageProps {
  disabled?: boolean;
  onCameraActiveChange?: (active: boolean) => void;
}

export const HostCameraStage: React.FC<HostCameraStageProps> = ({
  disabled = false,
  onCameraActiveChange,
}) => {
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(false);
  const [micEnabled, setMicEnabled] = useState<boolean>(false);
  const [mirrored, setMirrored] = useState<boolean>(true);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    onCameraActiveChange?.(cameraEnabled && !disabled);
  }, [cameraEnabled, disabled, onCameraActiveChange]);

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
      setCameraEnabled(false);
      return;
    }

    const videoConstraints: MediaTrackConstraints | boolean = selectedDeviceId
      ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } };

    navigator.mediaDevices
      .getUserMedia({ video: videoConstraints, audio: micEnabled })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {
            // Autoplay fallback handled by user interaction / muted state
          }
        }

        if (navigator.mediaDevices.enumerateDevices) {
          const all = await navigator.mediaDevices.enumerateDevices();
          const cams = all.filter((d) => d.kind === "videoinput");
          if (!cancelled) {
            setDevices(cams);
            if (!selectedDeviceId && cams[0]?.deviceId) {
              setSelectedDeviceId(cams[0].deviceId);
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCameraError(
            err instanceof Error
              ? err.message
              : "Kamera-Zugriff verweigert oder keine Kamera gefunden."
          );
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
  }, [cameraEnabled, disabled, micEnabled, selectedDeviceId]);

  const active = Platform.OS === "web" && cameraEnabled && !disabled;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <TouchableOpacity
            disabled={disabled}
            onPress={() => setCameraEnabled((prev) => !prev)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: cameraEnabled ? aspectTheme.colors.accent : aspectTheme.colors.surface,
              borderWidth: 1,
              borderColor: cameraEnabled ? aspectTheme.colors.accentText : aspectTheme.colors.border,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text style={{ color: aspectTheme.colors.textPrimary, fontWeight: "800", fontSize: 12 }}>
              {cameraEnabled ? "● KAMERA LIVE (Stoppen)" : "Kamera starten"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={disabled}
            onPress={() => setMicEnabled((prev) => !prev)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: micEnabled ? aspectTheme.colors.accentSoft : aspectTheme.colors.surface,
              borderWidth: 1,
              borderColor: micEnabled ? aspectTheme.colors.accentText : aspectTheme.colors.border,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text style={{ color: micEnabled ? aspectTheme.colors.accentText : aspectTheme.colors.textSecondary, fontWeight: "700", fontSize: 12 }}>
              {micEnabled ? "Mikrofon AN" : "Mikrofon AUS"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={disabled}
            onPress={() => setMirrored((prev) => !prev)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: aspectTheme.colors.surface,
              borderWidth: 1,
              borderColor: aspectTheme.colors.border,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text style={{ color: aspectTheme.colors.textSecondary, fontWeight: "700", fontSize: 12 }}>
              {mirrored ? "Spiegelung AN" : "Spiegelung AUS"}
            </Text>
          </TouchableOpacity>
        </View>

        {devices.length > 1 && (
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {devices.map((cam, idx) => {
              const isSelected = cam.deviceId === selectedDeviceId;
              return (
                <TouchableOpacity
                  key={cam.deviceId || idx}
                  onPress={() => setSelectedDeviceId(cam.deviceId)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    backgroundColor: isSelected ? aspectTheme.colors.accentSoft : aspectTheme.colors.surface,
                    borderWidth: 1,
                    borderColor: isSelected ? aspectTheme.colors.accentText : aspectTheme.colors.border,
                  }}
                >
                  <Text style={{ color: isSelected ? aspectTheme.colors.accentText : aspectTheme.colors.textSecondary, fontSize: 11, fontWeight: "700" }}>
                    {cam.label || `Kamera ${idx + 1}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {active ? (
        <View
          style={{
            width: "100%",
            aspectRatio: 16 / 9,
            maxHeight: 460,
            borderRadius: 14,
            overflow: "hidden",
            backgroundColor: "#050507",
            borderWidth: 1,
            borderColor: aspectTheme.colors.accentText,
            position: "relative",
          }}
        >
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
            style: {
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              transform: mirrored ? "scaleX(-1)" : "none",
            },
          })}
        </View>
      ) : (
        <View
          style={{
            width: "100%",
            aspectRatio: 16 / 9,
            maxHeight: 300,
            borderRadius: 14,
            backgroundColor: aspectTheme.colors.surface,
            borderWidth: 1,
            borderColor: aspectTheme.colors.border,
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            gap: 6,
          }}
        >
          <Text style={{ color: aspectTheme.colors.textPrimary, fontWeight: "800", fontSize: 15 }}>
            Host-Kamera bereit
          </Text>
          <Text style={{ color: aspectTheme.colors.textSecondary, fontSize: 12, textAlign: "center" }}>
            Klicke auf „Kamera starten“, um dein Live-Kamerabild direkt auf der Studio-Bühne anzuzeigen.
          </Text>
        </View>
      )}

      {cameraError && (
        <Text style={{ color: aspectTheme.colors.accentText, fontSize: 12, fontWeight: "700" }}>
          {cameraError}
        </Text>
      )}
    </View>
  );
};
