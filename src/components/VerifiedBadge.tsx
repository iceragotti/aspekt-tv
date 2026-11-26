import React from "react";
import { View, Text } from "react-native";

export interface VerifiedBadgeProps {
  label?: string;
  compact?: boolean;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({ label = "Verifiziert", compact = false }) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      gap: compact ? 4 : 6,
      paddingVertical: compact ? 1 : 2,
      paddingHorizontal: compact ? 5 : 8,
      borderRadius: 999,
      backgroundColor: "rgba(56, 189, 248, 0.16)",
      borderWidth: 1,
      borderColor: "rgba(56, 189, 248, 0.45)",
    }}
  >
    <Text style={{ color: "#7DD3FA", fontSize: compact ? 10 : 11, fontWeight: "800", lineHeight: 12 }}>✓</Text>
    {!compact && (
      <Text style={{ color: "#D0F5FF", fontSize: 11, fontWeight: "700" }}>{label}</Text>
    )}
  </View>
);
