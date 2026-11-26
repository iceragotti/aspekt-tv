import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { aspectTheme } from "../aspectTheme";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { VerifiedBadge } from "./VerifiedBadge";
import { HostCameraStage } from "./HostCameraStage";
import { LiveUrlPlayerStage } from "./LiveUrlPlayerStage";

export interface LiveStreamRoomProps {
  ageMode: "U18" | "18+";
  onConfirmAge18?: () => void;
}

interface StreamDefinition {
  id: "main-live" | "adult-18-live";
  title: string;
  rating: "Alle" | "18+";
  hostLabel: string;
  description: string;
  defaultUrl: string;
}

interface LiveChatMessage {
  id: string;
  roomId: string;
  author: string;
  handle: string;
  verified: boolean;
  text: string;
  sentAt: string;
  isHost?: boolean;
}

const STREAM_ROOMS: StreamDefinition[] = [
  {
    id: "main-live",
    title: "ASPEKT Studio Live",
    rating: "Alle",
    hostLabel: "Offizieller Stream",
    description: "Direkter Kanal für Sendungen, Diskussionen und Live-Kommentare.",
    defaultUrl: "https://live.aspekt.tv/studio.m3u8",
  },
  {
    id: "adult-18-live",
    title: "ASPEKT 18+ Night Session",
    rating: "18+",
    hostLabel: "18+ Creator Stream",
    description: "Geschützter Erwachsenen-Stream – nur nach bestätigter 18+-Altersfreigabe sichtbar.",
    defaultUrl: "https://live.aspekt.tv/night-18.m3u8",
  },
];

export const LiveStreamRoom: React.FC<LiveStreamRoomProps> = ({ ageMode, onConfirmAge18 }) => {
  const [selectedRoomId, setSelectedRoomId] = useState<"main-live" | "adult-18-live">("main-live");
  const [isLive, setIsLive] = useState<boolean>(true);
  const [streamUrls, setStreamUrls] = useState<Record<"main-live" | "adult-18-live", string>>({
    "main-live": STREAM_ROOMS[0].defaultUrl,
    "adult-18-live": STREAM_ROOMS[1].defaultUrl,
  });
  const [hostMode, setHostMode] = useState<boolean>(true);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<string[]>([]);
  const [queuedQuestions, setQueuedQuestions] = useState<Array<{ id: string; author: string; text: string }>>([]);
  const [senderName, setSenderName] = useState<string>("ICE RAGOTTI");
  const [chatInput, setChatInput] = useState<string>("");
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const [roundPulse, setRoundPulse] = useState<"Fragerunde offen" | "Meinungs-Check" | "Track / Release-Vibe" | "Offene Bühne">("Fragerunde offen");

  const [liquidMode, setLiquidMode] = useState<boolean>(true);
  const [pinnedBanner, setPinnedBanner] = useState<string>("Willkommen im ASPEKT.TV Live-Chat – stellt eure Fragen direkt in die Runde.");
  const [editingPin, setEditingPin] = useState<boolean>(false);

  const [splitDesktop, setSplitDesktop] = useState<boolean>(true);
  const [sessionChapter, setSessionChapter] = useState<string>("Opening · Lage");
  const [ageNotice, setAgeNotice] = useState<string | null>(null);

  useEffect(() => {
    if (ageMode === "U18" && selectedRoomId === "adult-18-live") {
      setSelectedRoomId("main-live");
    }
    if (ageMode === "18+") {
      setAgeNotice(null);
    }
  }, [ageMode, selectedRoomId]);
  const { width: winWidth } = useWindowDimensions();
  const isWideSplit = splitDesktop && Platform.OS === "web" && winWidth >= 1024;  const chatScrollRef = useRef<any>(null);  const [messagesByRoom, setMessagesByRoom] = useState<Record<"main-live" | "adult-18-live", LiveChatMessage[]>>({
    "main-live": [
      {
        id: "init-1",
        roomId: "main-live",
        author: "ASPEKT Studio",
        handle: "@aspekt_tv",
        verified: true,
        text: "Willkommen im Live-Chat – schreibt direkt eure Fragen und Themen in die Runde.",
        sentAt: "Live",
      },
    ],
    "adult-18-live": [
      {
        id: "init-18-1",
        roomId: "adult-18-live",
        author: "ICE RAGOTTI",
        handle: "@iceragotti",
        verified: true,
        text: "18+-Stream-Raum aktiv. Respektvoller Umgang und klare Grenzen.",
        sentAt: "18+ Live",
      },
    ],
  });

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const activeRoom = useMemo(
    () => STREAM_ROOMS.find((room) => room.id === selectedRoomId) ?? STREAM_ROOMS[0],
    [selectedRoomId]
  );

  const isAdultLocked = activeRoom.rating === "18+" && ageMode !== "18+";
  const currentMessages = (messagesByRoom[activeRoom.id] ?? []).filter((m) => !hiddenMessageIds.includes(m.id));

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || isAdultLocked) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    const channel = supabase.channel("stream-chat:" + activeRoom.id, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "chat_message" }, ({ payload }) => {
        const incoming = payload as LiveChatMessage | undefined;
        if (!incoming || !incoming.id || !incoming.text) return;
        setMessagesByRoom((prev) => {
          const list = prev[activeRoom.id] ?? [];
          if (list.some((item) => item.id === incoming.id)) return prev;
          return {
            ...prev,
            [activeRoom.id]: [...list, incoming],
          };
        });
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [activeRoom.id, isAdultLocked]);

  const handleSendMessage = async () => {
    if (isAdultLocked) return;
    const cleanText = chatInput.trim();
    if (!cleanText) return;

    const authorClean = senderName.trim() || "Zuschauer";
    const handleClean = "@" + (authorClean.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_|_$/g, "") || "viewer");
    const nowLabel = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const newMessage: LiveChatMessage = {
      id: "msg-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      roomId: activeRoom.id,
      author: authorClean,
      handle: handleClean,
      verified: false,
      text: cleanText,
      sentAt: nowLabel,
    };

    setMessagesByRoom((prev) => ({
      ...prev,
      [activeRoom.id]: [...(prev[activeRoom.id] ?? []), newMessage],
    }));
    setChatInput("");

    if (isSupabaseConfigured && channelRef.current) {
      await channelRef.current.send({
        type: "broadcast",
        event: "chat_message",
        payload: newMessage,
      });
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: aspectTheme.colors.canvas }} contentContainerStyle={{ padding: 14, gap: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <TouchableOpacity
            onPress={() => setHostMode((prev) => !prev)}
            style={{
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: hostMode ? aspectTheme.colors.accentSoft : aspectTheme.colors.surfaceRaised,
              borderWidth: 1,
              borderColor: hostMode ? aspectTheme.colors.accentText : aspectTheme.colors.border,
            }}
          >
            <Text style={{ color: hostMode ? aspectTheme.colors.accentText : aspectTheme.colors.textSecondary, fontWeight: "700", fontSize: 12 }}>
              {hostMode ? "HOST-MODUS AN" : "ZUSCHAUER-MODUS"}
            </Text>
          </TouchableOpacity>
            {STREAM_ROOMS.map((room) => {
            const selected = room.id === selectedRoomId;
            return (
              <TouchableOpacity
                key={room.id}
                onPress={() => {
                  if (room.rating === "18+" && ageMode !== "18+") {
                    if (onConfirmAge18) {
                      onConfirmAge18();
                    }
                    setAgeNotice("U18-Schutz aktiv: Bitte oben zuerst auf 18+ umschalten, um die Night Session zu öffnen.");
                    return;
                  }
                  setAgeNotice(null);
                  setSelectedRoomId(room.id);
                }}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: selected ? aspectTheme.colors.accentSoft : aspectTheme.colors.surface,
                  borderWidth: 1,
                  borderColor: selected ? aspectTheme.colors.accentText : aspectTheme.colors.border,
                }}
              >
                <Text style={{ color: selected ? aspectTheme.colors.accentText : aspectTheme.colors.textSecondary, fontWeight: "700", fontSize: 12 }}>
                  {room.title} ({room.rating})
                </Text>
              </TouchableOpacity>
            );
          })}
          {ageNotice && (
            <View
              style={{
                width: "100%",
                marginTop: 6,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor: "rgba(244, 63, 94, 0.14)",
                borderWidth: 1,
                borderColor: "rgba(244, 63, 94, 0.45)",
              }}
            >
              <Text style={{ color: aspectTheme.colors.textPrimary, fontSize: 12, fontWeight: "600" }}>
                {ageNotice}
              </Text>
            </View>
          )}
          <View
            style={{
              width: "100%",
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              marginTop: 6,
            }}
          >
            <Text
              style={{
                color: aspectTheme.colors.textMuted,
                fontSize: 11,
                fontWeight: "800",
                letterSpacing: 0.5,
              }}
            >
              SENDUNGS-BLOCK:
            </Text>
            {["Opening · Lage", "Community-Runde", "Track / Release", "Outro"].map((chapter) => {
              const activeChapter = sessionChapter === chapter;
              return (
                <TouchableOpacity
                  key={chapter}
                  onPress={() => setSessionChapter(chapter)}
                  style={{
                    paddingVertical: 5,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    backgroundColor: activeChapter
                      ? aspectTheme.colors.accentSoft
                      : aspectTheme.colors.surfaceRaised,
                    borderWidth: 1,
                    borderColor: activeChapter
                      ? aspectTheme.colors.accentText
                      : aspectTheme.colors.border,
                  }}
                >
                  <Text
                    style={{
                      color: activeChapter
                        ? aspectTheme.colors.accentText
                        : aspectTheme.colors.textSecondary,
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    {chapter}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          onPress={() => setIsLive((prev) => !prev)}
          style={{
            paddingVertical: 7,
            paddingHorizontal: 12,
            borderRadius: 999,
            backgroundColor: isLive ? aspectTheme.colors.accent : aspectTheme.colors.surfaceRaised,
            borderWidth: 1,
            borderColor: isLive ? aspectTheme.colors.accentText : aspectTheme.colors.border,
          }}
        >
          <Text style={{ color: aspectTheme.colors.textPrimary, fontWeight: "700", fontSize: 12 }}>
            {isLive ? "● LIVE AKTIV" : "○ OFFLINE (Starten)"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ padding: 16, borderRadius: 16, backgroundColor: aspectTheme.colors.surface, borderWidth: 1, borderColor: aspectTheme.colors.border, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text style={{ color: aspectTheme.colors.textPrimary, fontSize: 18, fontWeight: "800" }}>{activeRoom.title}</Text>
            <VerifiedBadge label={activeRoom.hostLabel} compact />
          </View>
          <Text style={{ color: aspectTheme.colors.accentText, fontSize: 12, fontWeight: "700" }}>
            Freigabe: {activeRoom.rating} · {isSupabaseConfigured ? "Supabase Realtime" : "Lokal-Modus"}
          </Text>
        </View>

        <Text style={{ color: aspectTheme.colors.textSecondary, fontSize: 13 }}>{activeRoom.description}</Text>

        {!isAdultLocked && (
          <View style={{ gap: 12 }}>
            <HostCameraStage disabled={isAdultLocked} />
            <LiveUrlPlayerStage url={streamUrls[activeRoom.id]} isLive={isLive} disabled={isAdultLocked} onSelectPresetUrl={(nextUrl) => setStreamUrls((prev) => ({ ...prev, [activeRoom.id]: nextUrl }))} />
          </View>
        )}

        {isAdultLocked ? (
          <View style={{ padding: 14, borderRadius: 12, backgroundColor: aspectTheme.colors.surfaceRaised, borderWidth: 1, borderColor: aspectTheme.colors.accentText, gap: 8 }}>
            <Text style={{ color: aspectTheme.colors.accentText, fontWeight: "800", fontSize: 14 }}>18+-Altersfreigabe erforderlich</Text>
            <Text style={{ color: aspectTheme.colors.textSecondary, fontSize: 13 }}>
              Dieser Stream und sein Live-Chat sind für Erwachsene (18+) vorgesehen. Im U18-Modus bleiben Stream und Chat gesperrt.
            </Text>
            {onConfirmAge18 && (
              <TouchableOpacity
                onPress={onConfirmAge18}
                style={{ alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: aspectTheme.colors.accent }}
              >
                <Text style={{ color: aspectTheme.colors.textPrimary, fontWeight: "700", fontSize: 12 }}>18+ jetzt bestätigen</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            <View style={{ padding: 14, borderRadius: 12, backgroundColor: aspectTheme.colors.surfaceRaised, borderWidth: 1, borderColor: aspectTheme.colors.border, gap: 8 }}>
              <Text style={{ color: aspectTheme.colors.textMuted, fontSize: 11, fontWeight: "700" }}>STREAM-QUELLE / HLS-URL</Text>
              <TextInput
                value={streamUrls[activeRoom.id]}
                onChangeText={(nextUrl) =>
                  setStreamUrls((prev) => ({
                    ...prev,
                    [activeRoom.id]: nextUrl,
                  }))
                }
                placeholder="https://... oder Stream-Key/URL eingeben"
                placeholderTextColor={aspectTheme.colors.textMuted}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  color: aspectTheme.colors.textPrimary,
                  backgroundColor: aspectTheme.colors.surface,
                  borderWidth: 1,
                  borderColor: aspectTheme.colors.border,
                  fontSize: 13,
                }}
              />
              <Text style={{ color: aspectTheme.colors.textSecondary, fontSize: 12 }}>
                Status: {isLive ? "Sendung läuft" : "Standby / Offline"} · Quelle: {streamUrls[activeRoom.id] || "Keine URL gesetzt"}
              </Text>
            </View>

            <View
              style={[
                {
                  padding: 14,
                  borderRadius: liquidMode ? 24 : 14,
                  gap: 10,
                  backgroundColor: liquidMode
                    ? "rgba(255, 255, 255, 0.06)"
                    : aspectTheme.colors.surface,
                  borderWidth: 1,
                  borderColor: liquidMode
                    ? "rgba(255, 255, 255, 0.18)"
                    : aspectTheme.colors.border,
                },
                Platform.OS === "web" && liquidMode
                  ? ({
                      backdropFilter: "blur(20px) saturate(160%)",
                      WebkitBackdropFilter: "blur(20px) saturate(160%)",
                      boxShadow:
                        "0 14px 36px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
                      transition: "all 180ms ease",
                    } as any)
                  : null,
              ]}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text
                    style={{
                      color: aspectTheme.colors.textPrimary,
                      fontWeight: "800",
                      fontSize: 14,
                    }}
                  >
                    Echtzeit-Stream-Chat ({currentMessages.length})
                  </Text>
                  <View
                    style={{
                      paddingVertical: 2,
                      paddingHorizontal: 8,
                      borderRadius: 999,
                      backgroundColor: isLive
                        ? "rgba(232, 23, 93, 0.2)"
                        : aspectTheme.colors.surfaceRaised,
                      borderWidth: 1,
                      borderColor: isLive
                        ? aspectTheme.colors.accent
                        : aspectTheme.colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: isLive
                          ? aspectTheme.colors.accentText
                          : aspectTheme.colors.textMuted,
                        fontSize: 10,
                        fontWeight: "800",
                      }}
                    >
                      {isLive ? "● LIVE" : "STANDBY"}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {Platform.OS === "web" && winWidth >= 1024 && (
                    <TouchableOpacity
                      onPress={() => setSplitDesktop((prev) => !prev)}
                      style={{
                        paddingVertical: 5,
                        paddingHorizontal: 10,
                        borderRadius: 999,
                        backgroundColor: splitDesktop
                          ? "rgba(255, 255, 255, 0.14)"
                          : aspectTheme.colors.surfaceRaised,
                        borderWidth: 1,
                        borderColor: splitDesktop
                          ? "rgba(255, 255, 255, 0.3)"
                          : aspectTheme.colors.border,
                      }}
                    >
                      <Text
                        style={{
                          color: splitDesktop
                            ? aspectTheme.colors.textPrimary
                            : aspectTheme.colors.textSecondary,
                          fontSize: 11,
                          fontWeight: "700",
                        }}
                      >
                        {splitDesktop ? "Split: AN" : "Split: AUS"}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={() => setLiquidMode((prev) => !prev)}
                    style={[
                      {
                        paddingVertical: 5,
                        paddingHorizontal: 11,
                        borderRadius: 999,
                        backgroundColor: liquidMode
                          ? "rgba(255, 255, 255, 0.14)"
                          : aspectTheme.colors.surfaceRaised,
                        borderWidth: 1,
                        borderColor: liquidMode
                          ? "rgba(255, 255, 255, 0.32)"
                          : aspectTheme.colors.border,
                      },
                      Platform.OS === "web" && liquidMode
                        ? ({
                            backdropFilter: "blur(12px)",
                            WebkitBackdropFilter: "blur(12px)",
                          } as any)
                        : null,
                    ]}
                  >
                    <Text
                      style={{
                        color: liquidMode
                          ? aspectTheme.colors.textPrimary
                          : aspectTheme.colors.textSecondary,
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      {liquidMode ? "Liquid Modus: AN" : "Liquid Modus: AUS"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <View
                style={[
                  {
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: liquidMode ? 16 : 10,
                    backgroundColor: liquidMode
                      ? "rgba(232, 23, 93, 0.12)"
                      : aspectTheme.colors.surfaceRaised,
                    borderWidth: 1,
                    borderColor: liquidMode
                      ? "rgba(232, 23, 93, 0.35)"
                      : aspectTheme.colors.border,
                    gap: 6,
                  },
                  Platform.OS === "web" && liquidMode
                    ? ({ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" } as any)
                    : null,
                ]}
              >
                {hostMode && queuedQuestions.length > 0 && (
                  <View
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      backgroundColor: aspectTheme.colors.surfaceRaised,
                      borderWidth: 1,
                      borderColor: aspectTheme.colors.border,
                      marginBottom: 10,
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: aspectTheme.colors.accentText,
                        fontSize: 11,
                        fontWeight: "800",
                        letterSpacing: 0.6,
                      }}
                    >
                      STAGE-QUEUE ({queuedQuestions.length})
                    </Text>
                    {queuedQuestions.map((item) => (
                      <View
                        key={item.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 10,
                          backgroundColor: aspectTheme.colors.surface,
                        }}
                      >
                        <Text
                          numberOfLines={2}
                          style={{
                            flex: 1,
                            color: aspectTheme.colors.textPrimary,
                            fontSize: 12,
                          }}
                        >
                          <Text style={{ fontWeight: "700" }}>{item.author}: </Text>
                          {item.text}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <TouchableOpacity
                            onPress={() => {
                              setPinnedBanner(`${item.author}: ${item.text}`);
                              setQueuedQuestions((prev) => prev.filter((q) => q.id !== item.id));
                            }}
                          >
                            <Text
                              style={{
                                color: aspectTheme.colors.accentText,
                                fontSize: 11,
                                fontWeight: "700",
                              }}
                            >
                              Auf Banner
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() =>
                              setQueuedQuestions((prev) => prev.filter((q) => q.id !== item.id))
                            }
                          >
                            <Text
                              style={{
                                color: aspectTheme.colors.textMuted,
                                fontSize: 11,
                                fontWeight: "700",
                              }}
                            >
                              Entfernen
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    rowGap: 6,
                    columnGap: 10,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    marginBottom: 10,
                    borderRadius: 14,
                    backgroundColor: liquidMode
                      ? "rgba(255, 255, 255, 0.07)"
                      : aspectTheme.colors.surfaceRaised,
                    borderWidth: 1,
                    borderColor: liquidMode
                      ? "rgba(255, 255, 255, 0.18)"
                      : aspectTheme.colors.border,
                    borderTopColor: liquidMode
                      ? "rgba(255, 255, 255, 0.32)"
                      : aspectTheme.colors.border,
                  }}
                >
                  <Text
                    style={{
                      flexShrink: 1,
                      color: aspectTheme.colors.textSecondary,
                      fontSize: 11,
                      fontWeight: "700",
                      lineHeight: 15,
                    }}
                  >
                    REGIE-STATUS · {selectedRoomId === "adult-18-live" ? "18+ Night Session" : "ASPEKT Studio Live"} · Block: {sessionChapter}
                  </Text>
                  <View
                    style={{
                      paddingVertical: 2,
                      paddingHorizontal: 8,
                      borderRadius: 999,
                      backgroundColor:
                        ageMode === "18+"
                          ? aspectTheme.colors.accentSoft
                          : liquidMode
                          ? "rgba(255, 255, 255, 0.08)"
                          : aspectTheme.colors.surface,
                      borderWidth: 1,
                      borderColor:
                        ageMode === "18+"
                          ? aspectTheme.colors.accentText
                          : liquidMode
                          ? "rgba(255, 255, 255, 0.2)"
                          : aspectTheme.colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color:
                          ageMode === "18+"
                            ? aspectTheme.colors.accentText
                            : aspectTheme.colors.textSecondary,
                        fontSize: 10,
                        fontWeight: "800",
                        letterSpacing: 0.4,
                      }}
                    >
                      {ageMode === "18+" ? "18+ FREIGEGEBEN" : "U18 SCHUTZ AKTIV"}
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 10,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 14,
                    backgroundColor: liquidMode
                      ? "rgba(255, 255, 255, 0.05)"
                      : aspectTheme.colors.surfaceRaised,
                    borderWidth: 1,
                    borderColor: liquidMode
                      ? "rgba(255, 255, 255, 0.14)"
                      : aspectTheme.colors.border,
                  }}
                >
                  <Text
                    style={{
                      color: aspectTheme.colors.textMuted,
                      fontSize: 10,
                      fontWeight: "800",
                      letterSpacing: 0.5,
                      marginRight: 4,
                    }}
                  >
                    RUNDEN-IMPULS:
                  </Text>
                  {(["Fragerunde offen", "Meinungs-Check", "Track / Release-Vibe", "Offene Bühne"] as const).map((mode) => {
                    const active = roundPulse === mode;
                    return (
                      <TouchableOpacity
                        key={mode}
                        onPress={() => setRoundPulse(mode)}
                        style={{
                          paddingVertical: 4,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          backgroundColor: active
                            ? liquidMode
                              ? "rgba(255, 255, 255, 0.16)"
                              : aspectTheme.colors.accentSoft
                            : liquidMode
                            ? "rgba(255, 255, 255, 0.04)"
                            : aspectTheme.colors.surface,
                          borderWidth: 1,
                          borderColor: active
                            ? aspectTheme.colors.accentText
                            : liquidMode
                            ? "rgba(255, 255, 255, 0.14)"
                            : aspectTheme.colors.border,
                        }}
                      >
                        <Text
                          style={{
                            color: active
                              ? aspectTheme.colors.textPrimary
                              : aspectTheme.colors.textSecondary,
                            fontSize: 11,
                            fontWeight: active ? "800" : "600",
                          }}
                        >
                          {mode}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <Text
                    style={{
                      color: aspectTheme.colors.accentText,
                      fontSize: 10,
                      fontWeight: "800",
                      letterSpacing: 0.4,
                    }}
                  >
                    ANGEPINNT · THEMA DER RUNDE
                  </Text>
                  {hostMode && (
                    <TouchableOpacity onPress={() => setEditingPin((prev) => !prev)}>
                      <Text
                        style={{
                          color: aspectTheme.colors.textPrimary,
                          fontSize: 11,
                          fontWeight: "700",
                        }}
                      >
                        {editingPin ? "Fertig" : "Bearbeiten"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                            {["Fragerunde · Live-Talk", "Aktuelles Thema", "Track / Release"].map((preset) => (
                              <TouchableOpacity
                                key={preset}
                                onPress={() => {
                                  setPinnedBanner(preset);
                                  setEditingPin(false);
                                }}
                                style={{
                                  paddingVertical: 3,
                                  paddingHorizontal: 8,
                                  borderRadius: 999,
                                  backgroundColor: "rgba(255, 255, 255, 0.14)",
                                }}
                              >
                                <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "700" }}>
                                  {preset}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                {editingPin && hostMode ? (
                  <TextInput
                    value={pinnedBanner}
                    onChangeText={setPinnedBanner}
                    placeholder="Angepinntes Thema eingeben..."
                    placeholderTextColor={aspectTheme.colors.textMuted}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 10,
                      color: aspectTheme.colors.textPrimary,
                      backgroundColor: "rgba(0, 0, 0, 0.25)",
                      borderWidth: 1,
                      borderColor: "rgba(255, 255, 255, 0.18)",
                      fontSize: 12,
                    }}
                  />
                ) : (
                  <Text
                    style={{
                      color: aspectTheme.colors.textPrimary,
                      fontSize: 12,
                      fontWeight: "600",
                      lineHeight: 17,
                    }}
                  >
                    {pinnedBanner}
                  </Text>
                )}
              </View>

              
                <Text style={{ color: aspectTheme.colors.textMuted, fontSize: 11 }}>
                  {hostMode ? "Host-Moderations-Ansicht aktiv" : "Zuschauer-Ansicht"}
                </Text>
              </View>

              <ScrollView
                ref={chatScrollRef}
                style={{ maxHeight: isWideSplit ? 420 : 280 }}
                contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                onContentSizeChange={() =>
                  chatScrollRef.current?.scrollToEnd({ animated: liquidMode })
                }
              >
                {currentMessages.map((msg) => (
                  <View
                    key={msg.id}
                    style={[
                      {
                        padding: 11,
                        borderRadius: liquidMode ? 18 : 12,
                        backgroundColor: liquidMode ? "rgba(255, 255, 255, 0.16)"
                          : aspectTheme.colors.surfaceRaised,
                        borderWidth: 1,
                        borderColor: liquidMode
                          ? "rgba(255, 255, 255, 0.18)"
                          : aspectTheme.colors.border,
                        gap: 4,
                      },
                      Platform.OS === "web" && liquidMode
                        ? ({
                            backdropFilter: "blur(16px) saturate(150%)",
                            WebkitBackdropFilter: "blur(16px) saturate(150%)",
                            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.18)",
                            transition: "all 160ms ease",
                          } as any)
                        : null,
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <Text
                          style={{
                            color: aspectTheme.colors.textPrimary,
                            fontWeight: "700",
                            fontSize: 12,
                          }}
                        >
                          {msg.author}
                        </Text>
                          {(msg.author.toLowerCase().includes("aspekt") ||
                            msg.author.toLowerCase().includes("ragotti")) && (
                            <View
                              style={{
                                paddingVertical: 1,
                                paddingHorizontal: 6,
                                borderRadius: 999,
                                backgroundColor: "rgba(232, 23, 93, 0.24)",
                              }}
                            >
                              <Text
                                style={{
                                  color: aspectTheme.colors.accentText,
                                  fontSize: 9,
                                  fontWeight: "800",
                                }}
                              >
                                HOST
                              </Text>
                            </View>
                          )}
                        <Text style={{ color: aspectTheme.colors.textMuted, fontSize: 11 }}>
                          {msg.handle}
                        </Text>
                        {msg.verified && <VerifiedBadge label="Verifiziert" compact />}
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ color: aspectTheme.colors.textMuted, fontSize: 11 }}>
                          {msg.sentAt}
                        </Text>
                        {hostMode && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                              <TouchableOpacity
                                onPress={() =>
                                  setPinnedBanner(`${msg.author}: ${msg.text}`)
                                }
                              >
                                <Text
                                  style={{
                                    color: aspectTheme.colors.textPrimary,
                                    fontSize: 11,
                                    fontWeight: "700",
                                  }}
                                >
                                  Anpinnen
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() =>
                                  setQueuedQuestions((prev) =>
                                    prev.some((q) => q.id === msg.id)
                                      ? prev
                                      : [...prev, { id: msg.id, author: msg.author, text: msg.text }]
                                  )
                                }
                              >
                                <Text
                                  style={{
                                    color: aspectTheme.colors.textSecondary,
                                    fontSize: 11,
                                    fontWeight: "700",
                                  }}
                                >
                                  Vormerken
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                            onPress={() =>
                              setHiddenMessageIds((prev) => [...prev, msg.id])
                            }
                          >
                            <Text
                              style={{
                                color: aspectTheme.colors.accentText,
                                fontSize: 11,
                                fontWeight: "700",
                              }}
                            >
                              Ausblenden
                            </Text>
                          </TouchableOpacity>
                            </View>
                        )}
                      </View>
                    </View>
                    <Text
                      style={{
                        color: aspectTheme.colors.textSecondary,
                        fontSize: 13,
                        lineHeight: 18,
                      }}
                    >
                      {msg.text}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <Text style={{ color: aspectTheme.colors.textMuted, fontSize: 11 }}>
                  Schnell-Reaktion:
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  {["🔥", "👏", "❓", "🎙️"].map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      onPress={() =>
                        setChatInput((prev) => (prev ? `${prev} ${emoji}` : emoji))
                      }
                      style={{
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        borderRadius: 999,
                        backgroundColor: liquidMode ? "rgba(255, 255, 255, 0.16)"
                          : aspectTheme.colors.surfaceRaised,
                        borderWidth: 1,
                        borderColor: liquidMode ? "rgba(255, 255, 255, 0.30)"
                          : aspectTheme.colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 12 }}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {showEmojiPicker && (
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 6,
                      padding: 12,
                      marginTop: 8,
                      marginBottom: 10,
                      borderRadius: 16,
                      backgroundColor: liquidMode
                        ? "rgba(255, 255, 255, 0.08)"
                        : aspectTheme.colors.surfaceRaised,
                      borderWidth: 1,
                      borderColor: liquidMode
                        ? "rgba(255, 255, 255, 0.22)"
                        : aspectTheme.colors.border,
                    }}
                  >
                    {["😀","😂","🤣","😊","😍","🤩","😎","🤔","🙌","👏","👍","❤️","🔥","💯","🎉","🎙️"].map((em) => (
                      <TouchableOpacity
                        key={em}
                        onPress={() => setChatInput((prev) => `${prev}${em}`)}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: liquidMode
                            ? "rgba(255, 255, 255, 0.06)"
                            : aspectTheme.colors.surface,
                          borderWidth: 1,
                          borderColor: "rgba(255, 255, 255, 0.14)",
                        }}
                      >
                        <Text style={{ fontSize: 17 }}>{em}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      onPress={() => setShowEmojiPicker(false)}
                      style={{
                        height: 34,
                        paddingHorizontal: 10,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: liquidMode
                          ? "rgba(255, 255, 255, 0.1)"
                          : aspectTheme.colors.surface,
                        borderWidth: 1,
                        borderColor: "rgba(255, 255, 255, 0.18)",
                      }}
                    >
                      <Text
                        style={{
                          color: aspectTheme.colors.textSecondary,
                          fontSize: 11,
                          fontWeight: "700",
                        }}
                      >
                        Fertig
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => setShowEmojiPicker((prev) => !prev)}
                    style={{
                      height: 40,
                      paddingHorizontal: 10,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: showEmojiPicker
                        ? aspectTheme.colors.accentSoft
                        : liquidMode
                        ? "rgba(255, 255, 255, 0.08)"
                        : aspectTheme.colors.surfaceRaised,
                      borderWidth: 1,
                      borderColor: showEmojiPicker
                        ? aspectTheme.colors.accentText
                        : liquidMode
                        ? "rgba(255, 255, 255, 0.2)"
                        : aspectTheme.colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>😊</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}><View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 180 }}>
                  <Text style={{ color: aspectTheme.colors.textMuted, fontSize: 11, fontWeight: "700" }}>
                    Als:
                  </Text>
                  <TextInput
                    value={senderName}
                    onChangeText={setSenderName}
                    placeholder="Anzeigename..."
                    placeholderTextColor={aspectTheme.colors.textMuted}
                    style={[
                      {
                        flex: 1,
                        maxWidth: 220,
                        paddingVertical: 5,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        color: aspectTheme.colors.textPrimary,
                        backgroundColor: liquidMode
                          ? "rgba(255, 255, 255, 0.07)"
                          : aspectTheme.colors.surfaceRaised,
                        borderWidth: 1,
                        borderColor: liquidMode ? "rgba(255, 255, 255, 0.30)"
                          : aspectTheme.colors.border,
                        fontSize: 12,
                      },
                      Platform.OS === "web" && liquidMode
                        ? ({ backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" } as any)
                        : null,
                    ]}
                  />
                </View></View>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <TextInput
                  value={chatInput}
                  onChangeText={setChatInput}
                  onSubmitEditing={handleSendMessage}
                  placeholder="Direkt in den Live-Stream schreiben..."
                  placeholderTextColor={aspectTheme.colors.textMuted}
                  style={[
                    {
                      flex: 1,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 999,
                      color: aspectTheme.colors.textPrimary,
                      backgroundColor: liquidMode
                        ? "rgba(255, 255, 255, 0.09)"
                        : aspectTheme.colors.surfaceRaised,
                      borderWidth: 1,
                      borderColor: liquidMode
                        ? "rgba(255, 255, 255, 0.2)"
                        : aspectTheme.colors.border,
                      fontSize: 13,
                    },
                    Platform.OS === "web" && liquidMode
                      ? ({ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" } as any)
                      : null,
                  ]}
                />
                  </View>
                </View>
                <TouchableOpacity
                  onPress={handleSendMessage}
                  style={[
                    {
                      paddingVertical: 10,
                      paddingHorizontal: 18,
                      borderRadius: 999,
                      backgroundColor: aspectTheme.colors.accent,
                    },
                    Platform.OS === "web" && liquidMode
                      ? ({
                          boxShadow:
                            "0 8px 24px rgba(232, 23, 93, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.28)",
                        } as any)
                      : null,
                  ]}
                >
                  <Text
                    style={{
                      color: aspectTheme.colors.textPrimary,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    Senden
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
};
