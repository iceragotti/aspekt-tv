import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView } from "react-native";
import { aspectTheme } from "../aspectTheme";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { VerifiedBadge } from "./VerifiedBadge";

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
          {STREAM_ROOMS.map((room) => {
            const selected = room.id === selectedRoomId;
            return (
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

          <TouchableOpacity
                key={room.id}
                onPress={() => setSelectedRoomId(room.id)}
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

            <View style={{ paddingTop: 6, gap: 8 }}>
              <Text style={{ color: aspectTheme.colors.textPrimary, fontWeight: "700", fontSize: 14 }}>
                Echtzeit-Stream-Chat ({currentMessages.length})
              </Text>

              <TextInput
                value={senderName}
                onChangeText={setSenderName}
                placeholder="Dein Anzeigename im Chat..."
                placeholderTextColor={aspectTheme.colors.textMuted}
                style={{
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  color: aspectTheme.colors.textPrimary,
                  backgroundColor: aspectTheme.colors.surfaceRaised,
                  borderWidth: 1,
                  borderColor: aspectTheme.colors.border,
                  fontSize: 12,
                }}
              />

              <View style={{ gap: 8 }}>
                {currentMessages.map((msg) => (
                  <View
                    key={msg.id}
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      backgroundColor: aspectTheme.colors.surfaceRaised,
                      borderWidth: 1,
                      borderColor: aspectTheme.colors.border,
                      gap: 4,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={{ color: aspectTheme.colors.textPrimary, fontWeight: "700", fontSize: 12 }}>{msg.author}</Text>
                        <Text style={{ color: aspectTheme.colors.textMuted, fontSize: 11 }}>{msg.handle}</Text>
                        {msg.verified && <VerifiedBadge label="Verifiziert" compact />}
                      </View>
                      <Text style={{ color: aspectTheme.colors.textMuted, fontSize: 11 }}>{msg.sentAt}</Text>
                    </View>
                    <Text style={{ color: aspectTheme.colors.textSecondary, fontSize: 13 }}>{msg.text}</Text>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <TextInput
                  value={chatInput}
                  onChangeText={setChatInput}
                  onSubmitEditing={handleSendMessage}
                  placeholder="Direkt in den Live-Stream schreiben..."
                  placeholderTextColor={aspectTheme.colors.textMuted}
                  style={{
                    flex: 1,
                    paddingVertical: 9,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    color: aspectTheme.colors.textPrimary,
                    backgroundColor: aspectTheme.colors.surfaceRaised,
                    borderWidth: 1,
                    borderColor: aspectTheme.colors.border,
                    fontSize: 13,
                  }}
                />
                <TouchableOpacity
                  onPress={handleSendMessage}
                  style={{ paddingVertical: 9, paddingHorizontal: 16, borderRadius: 999, backgroundColor: aspectTheme.colors.accent }}
                >
                  <Text style={{ color: aspectTheme.colors.textPrimary, fontWeight: "700", fontSize: 12 }}>Senden</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
};
