import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Platform } from "react-native";
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
  const [senderName, setSenderName] = useState<string>("ICE RAGOTTI");
  const [chatInput, setChatInput] = useState<string>("");
  const [messagesByRoom, setMessagesByRoom] = useState<Record<"main-live" | "adult-18-live", LiveChatMessage[]>>({
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

    return (
    <ScrollView
      style={{ flex: 1, backgroundColor: aspectTheme.colors.canvas }}
      contentContainerStyle={{ padding: 14, gap: 16 }}
    >
      <View
        style={{
          flexDirection: Platform.OS === "web" ? "row" : "column",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <View style={{ flex: 1.75, minWidth: 320, gap: 12 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <TouchableOpacity
                onPress={() => setHostMode((prev) => !prev)}
                style={{
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: hostMode ? aspectTheme.colors.accentSoft : aspectTheme.colors.surface,
                  borderWidth: 1,
                  borderColor: hostMode ? aspectTheme.colors.accentText : aspectTheme.colors.border,
                }}
              >
                <Text
                  style={{
                    color: hostMode ? aspectTheme.colors.accentText : aspectTheme.colors.textSecondary,
                    fontWeight: "800",
                    fontSize: 11,
                  }}
                >
                  {hostMode ? "HOST-MODUS AN" : "HOST-MODUS AUS"}
                </Text>
              </TouchableOpacity>

              {STREAM_ROOMS.map((room) => {
                const selected = room.id === activeRoom.id;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: aspectTheme.colors.canvas }}
      contentContainerStyle={{ padding: 14, gap: 16 }}
    >
      <View
        style={{
          flexDirection: Platform.OS === "web" ? "row" : "column",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <View style={{ flex: 1.75, minWidth: 320, gap: 12 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <TouchableOpacity
                onPress={() => setHostMode((prev) => !prev)}
                style={{
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: hostMode ? aspectTheme.colors.accentSoft : aspectTheme.colors.surface,
                  borderWidth: 1,
                  borderColor: hostMode ? aspectTheme.colors.accentText : aspectTheme.colors.border,
                }}
              >
                <Text
                  style={{
                    color: hostMode ? aspectTheme.colors.accentText : aspectTheme.colors.textSecondary,
                    fontWeight: "800",
                    fontSize: 11,
                  }}
                >
                  {hostMode ? "HOST-MODUS AN" : "HOST-MODUS AUS"}
                </Text>
              </TouchableOpacity>

              {STREAM_ROOMS.map((room) => {
                const selected = room.id === activeRoom.id;
                return (
    <ScrollView
      style={{ flex: 1, backgroundColor: aspectTheme.colors.canvas }}
      contentContainerStyle={{ padding: 14, gap: 16 }}
    >
      <View
        style={{
          flexDirection: Platform.OS === "web" ? "row" : "column",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <View style={{ flex: 1.75, minWidth: 320, gap: 12 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <TouchableOpacity
                onPress={() => setHostMode((prev) => !prev)}
                style={{
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: hostMode
                    ? aspectTheme.colors.accentSoft
                    : aspectTheme.colors.surface,
                  borderWidth: 1,
                  borderColor: hostMode
                    ? aspectTheme.colors.accentText
                    : aspectTheme.colors.border,
                }}
              >
                <Text
                  style={{
                    color: hostMode
                      ? aspectTheme.colors.accentText
                      : aspectTheme.colors.textSecondary,
                    fontWeight: "800",
                    fontSize: 11,
                  }}
                >
                  {hostMode ? "HOST-MODUS AN" : "HOST-MODUS AUS"}
                </Text>
              </TouchableOpacity>

              {STREAM_ROOMS.map((room) => {
                const selected = room.id === activeRoom.id;
                return (
                  <TouchableOpacity
                    key={room.id}
                    onPress={() => setSelectedRoomId(room.id)}
                    style={{
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      backgroundColor: selected
                        ? aspectTheme.colors.accent
                        : aspectTheme.colors.surface,
                      borderWidth: 1,
                      borderColor: selected
                        ? aspectTheme.colors.accentText
                        : aspectTheme.colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: aspectTheme.colors.textPrimary,
                        fontWeight: "700",
                        fontSize: 11,
                      }}
                    >
                      {room.title} ({room.rating})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={() => setIsLive((prev) => !prev)}
              style={{
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: isLive
                  ? aspectTheme.colors.accent
                  : aspectTheme.colors.surface,
                borderWidth: 1,
                borderColor: isLive
                  ? aspectTheme.colors.accentText
                  : aspectTheme.colors.border,
              }}
            >
              <Text
                style={{
                  color: aspectTheme.colors.textPrimary,
                  fontWeight: "800",
                  fontSize: 11,
                }}
              >
                {isLive ? "● LIVE AKTIV" : "OFFLINE"}
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={{
              backgroundColor: aspectTheme.colors.surfaceElevated,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: aspectTheme.colors.border,
              padding: 14,
              gap: 12,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text
                  style={{
                    color: aspectTheme.colors.textPrimary,
                    fontWeight: "800",
                    fontSize: 16,
                  }}
                >
                  {activeRoom.title}
                </Text>
                <VerifiedBadge />
              </View>
              <Text style={{ color: aspectTheme.colors.textSecondary, fontSize: 12 }}>
                Freigabe: {activeRoom.rating} · {activeRoom.hostLabel}
              </Text>
            </View>

            <Text style={{ color: aspectTheme.colors.textSecondary, fontSize: 13 }}>
              {activeRoom.description}
            </Text>

            {isAdultLocked ? (
              <View
                style={{
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: aspectTheme.colors.surface,
                  borderWidth: 1,
                  borderColor: aspectTheme.colors.border,
                  gap: 6,
                }}
              >
                <Text
                  style={{
                    color: aspectTheme.colors.textPrimary,
                    fontWeight: "800",
                    fontSize: 14,
                  }}
                >
                  18+ Bereich im U18-Modus gesperrt
                </Text>
                <Text style={{ color: aspectTheme.colors.textSecondary, fontSize: 12 }}>
                  Wechsle oben auf „ASPEKT Studio Live (Alle)“ oder passe den Altersmodus an.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 14 }}>
                <HostCameraStage disabled={isAdultLocked} />
                <LiveUrlPlayerStage
                  url={streamUrls[activeRoom.id]}
                  isLive={isLive}
                  disabled={isAdultLocked}
                  onSelectPresetUrl={(nextUrl) =>
                    setStreamUrls((prev) => ({ ...prev, [activeRoom.id]: nextUrl }))
                  }
                />
              </View>
            )}
          </View>
        </View>

        <View
          style={{
            flex: 1,
            minWidth: 300,
            backgroundColor: aspectTheme.colors.surfaceElevated,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: aspectTheme.colors.border,
            padding: 14,
            gap: 12,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                color: aspectTheme.colors.textPrimary,
                fontWeight: "800",
                fontSize: 14,
              }}
            >
              LIVE-Kommentare ({currentMessages.length})
            </Text>
            <Text
              style={{
                color: isLive
                  ? aspectTheme.colors.accentText
                  : aspectTheme.colors.textMuted,
                fontSize: 11,
                fontWeight: "700",
              }}
            >
              {isLive ? "● LIVE-CHAT" : "STANDBY"}
            </Text>
          </View>

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8 }}>
            {isAdultLocked ? (
              <Text style={{ color: aspectTheme.colors.textMuted, fontSize: 12 }}>
                Kommentare sind für diesen 18+-Raum im U18-Modus ausgeblendet.
              </Text>
            ) : currentMessages.length === 0 ? (
              <Text style={{ color: aspectTheme.colors.textMuted, fontSize: 12 }}>
                Noch keine LIVE-Kommentare – starte die Diskussion rechts daneben.
              </Text>
            ) : (
              currentMessages.map((msg) => (
                <View
                  key={msg.id}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    backgroundColor: aspectTheme.colors.surface,
                    borderWidth: 1,
                    borderColor: aspectTheme.colors.border,
                    gap: 4,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
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
                      {msg.verified && <VerifiedBadge />}
                      <Text style={{ color: aspectTheme.colors.textMuted, fontSize: 11 }}>
                        {msg.handle}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ color: aspectTheme.colors.textMuted, fontSize: 10 }}>
                        {msg.sentAt}
                      </Text>
                      {hostMode && (
                        <TouchableOpacity
                          onPress={() =>
                            setHiddenMessageIds((prev) => [...prev, msg.id])
                          }
                        >
                          <Text
                            style={{
                              color: aspectTheme.colors.accentText,
                              fontSize: 10,
                              fontWeight: "700",
                            }}
                          >
                            Ausblenden
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <Text
                    style={{
                      color: aspectTheme.colors.textSecondary,
                      fontSize: 12,
                      lineHeight: 17,
                    }}
                  >
                    {msg.text}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>

          {!isAdultLocked && (
            <View
              style={{
                gap: 8,
                paddingTop: 4,
                borderTopWidth: 1,
                borderTopColor: aspectTheme.colors.border,
              }}
            >
              <TextInput
                value={senderName}
                onChangeText={setSenderName}
                placeholder="Dein Name"
                placeholderTextColor={aspectTheme.colors.textMuted}
                style={{
                  backgroundColor: aspectTheme.colors.surface,
                  color: aspectTheme.colors.textPrimary,
                  borderWidth: 1,
                  borderColor: aspectTheme.colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  fontSize: 12,
                }}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={chatInput}
                  onChangeText={setChatInput}
                  onSubmitEditing={handleSendMessage}
                  placeholder="LIVE-Kommentar schreiben..."
                  placeholderTextColor={aspectTheme.colors.textMuted}
                  style={{
                    flex: 1,
                    backgroundColor: aspectTheme.colors.surface,
                    color: aspectTheme.colors.textPrimary,
                    borderWidth: 1,
                    borderColor: aspectTheme.colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    fontSize: 12,
                  }}
                />
                <TouchableOpacity
                  onPress={handleSendMessage}
                  style={{
                    paddingHorizontal: 14,
                    justifyContent: "center",
                    borderRadius: 8,
                    backgroundColor: aspectTheme.colors.accent,
                  }}
                >
                  <Text
                    style={{
                      color: aspectTheme.colors.textPrimary,
                      fontWeight: "800",
                      fontSize: 12,
                    }}
                  >
                    Senden
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
};
