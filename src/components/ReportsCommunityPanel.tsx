import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView } from "react-native";
import { aspectTheme } from "../aspectTheme";
import { ASPEKT_CHANNEL_SECTIONS, ASPEKT_VERIFIED_PROFILES } from "../aspektChannel";
import { VerifiedBadge } from "./VerifiedBadge";

export interface AspektReport {
  id: string;
  title: string;
  category: string;
  author: string;
  handle: string;
  verified: boolean;
  publishedAt: string;
  summary: string;
  body: string;
  comments: string[];
}

const LEAD_PROFILE = ASPEKT_VERIFIED_PROFILES[0] ?? {
  id: "aspekt-redaktion",
  name: "ASPEKT Redaktion",
  handle: "@aspekt_tv",
  roleLabel: "Offizieller Kanal",
  verified: true,
};

const INITIAL_REPORTS: AspektReport[] = [
  {
    id: "rep-1",
    title: "Warum ASPEKT.TV auf ruhige Räume statt Lärm setzt",
    category: "Medienkanal ASPEKT.TV",
    author: LEAD_PROFILE.name,
    handle: LEAD_PROFILE.handle,
    verified: LEAD_PROFILE.verified,
    publishedAt: "Heute",
    summary: "Ein eigener Medienkanal im dunklen Rosé-Glas verbindet Berichte, Community und kontrollierte Kommunikation.",
    body: "Statt endlosem Scroll-Lärm und fremdbestimmter Reizflut bündelt ASPEKT.TV redaktionelle Berichte, Community-Austausch und klare Schutzmechanismen an einem Ort – auf Web und App gleichermaßen zugänglich.",
    comments: ["Starke Richtung – endlich ein Raum mit Fokus und klarem Ton."],
  },
];

export const ReportsCommunityPanel: React.FC = () => {
  const [reports, setReports] = useState<AspektReport[]>(INITIAL_REPORTS);
  const [selectedId, setSelectedId] = useState<string>(INITIAL_REPORTS[0].id);
  const [sectionId, setSectionId] = useState<"channel" | "reports" | "community">("reports");
  const [showEditor, setShowEditor] = useState<boolean>(false);
  const [title, setTitle] = useState<string>("");
  const [category, setCategory] = useState<string>("Berichte");
  const [summary, setSummary] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [commentDraft, setCommentDraft] = useState<string>("");

  const activeReport = reports.find((r) => r.id === selectedId) ?? reports[0];
  const activeSection = ASPEKT_CHANNEL_SECTIONS.find((s) => s.id === sectionId) ?? ASPEKT_CHANNEL_SECTIONS[0];

  const handleCreateReport = () => {
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle || !cleanBody) return;
    const nextReport: AspektReport = {
      id: `rep-${Date.now()}`,
      title: cleanTitle,
      category: category.trim() || "Berichte",
      author: LEAD_PROFILE.name,
      handle: LEAD_PROFILE.handle,
      verified: LEAD_PROFILE.verified,
      publishedAt: "Gerade eben",
      summary: summary.trim() || cleanBody.slice(0, 140),
      body: cleanBody,
      comments: [],
    };
    setReports((prev) => [nextReport, ...prev]);
    setSelectedId(nextReport.id);
    setSectionId("reports");
    setTitle("");
    setSummary("");
    setBody("");
    setShowEditor(false);
  };

  const handleAddComment = () => {
    const clean = commentDraft.trim();
    if (!clean || !activeReport) return;
    setReports((prev) =>
      prev.map((r) => (r.id === activeReport.id ? { ...r, comments: [...r.comments, clean] } : r))
    );
    setCommentDraft("");
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: aspectTheme.colors.canvas }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={{ color: aspectTheme.colors.textPrimary, fontSize: 18, fontWeight: "700" }}>{activeSection.title}</Text>
          <VerifiedBadge label={LEAD_PROFILE.roleLabel} compact />
        </View>
        <TouchableOpacity onPress={() => setShowEditor((v) => !v)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: aspectTheme.colors.accent }}>
          <Text style={{ color: aspectTheme.colors.textPrimary, fontWeight: "700", fontSize: 13 }}>{showEditor ? "Schließen" : "+ Bericht schreiben"}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {ASPEKT_CHANNEL_SECTIONS.map((sec) => {
          const isSelected = sec.id === sectionId;
          return (
            <TouchableOpacity
              key={sec.id}
              onPress={() => setSectionId(sec.id)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: isSelected ? aspectTheme.colors.accentSoft : aspectTheme.colors.surface,
                borderWidth: 1,
                borderColor: isSelected ? aspectTheme.colors.accentText : aspectTheme.colors.border,
              }}
            >
              <Text style={{ color: isSelected ? aspectTheme.colors.accentText : aspectTheme.colors.textSecondary, fontWeight: "700", fontSize: 12 }}>
                {sec.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={{ color: aspectTheme.colors.textMuted, fontSize: 13 }}>{activeSection.subtitle}</Text>

      {showEditor && (
        <View style={{ padding: 14, borderRadius: 16, backgroundColor: aspectTheme.colors.surfaceRaised, borderWidth: 1, borderColor: aspectTheme.colors.border, gap: 10 }}>
          <Text style={{ color: aspectTheme.colors.accentText, fontWeight: "700", fontSize: 14 }}>Neuen Bericht verfassen</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Titel des Berichts..." placeholderTextColor={aspectTheme.colors.textMuted} style={{ padding: 10, borderRadius: 10, color: aspectTheme.colors.textPrimary, backgroundColor: aspectTheme.colors.surface, borderWidth: 1, borderColor: aspectTheme.colors.border }} />
          <TextInput value={category} onChangeText={setCategory} placeholder="Rubrik / Kanal..." placeholderTextColor={aspectTheme.colors.textMuted} style={{ padding: 10, borderRadius: 10, color: aspectTheme.colors.textPrimary, backgroundColor: aspectTheme.colors.surface, borderWidth: 1, borderColor: aspectTheme.colors.border }} />
          <TextInput value={summary} onChangeText={setSummary} placeholder="Kurz-Teaser (optional)..." placeholderTextColor={aspectTheme.colors.textMuted} style={{ padding: 10, borderRadius: 10, color: aspectTheme.colors.textPrimary, backgroundColor: aspectTheme.colors.surface, borderWidth: 1, borderColor: aspectTheme.colors.border }} />
          <TextInput value={body} onChangeText={setBody} placeholder="Bericht schreiben..." placeholderTextColor={aspectTheme.colors.textMuted} multiline numberOfLines={5} style={{ padding: 10, borderRadius: 10, minHeight: 110, textAlignVertical: "top", color: aspectTheme.colors.textPrimary, backgroundColor: aspectTheme.colors.surface, borderWidth: 1, borderColor: aspectTheme.colors.border }} />
          <TouchableOpacity onPress={handleCreateReport} style={{ alignSelf: "flex-end", paddingVertical: 9, paddingHorizontal: 16, borderRadius: 999, backgroundColor: aspectTheme.colors.accent }}>
            <Text style={{ color: aspectTheme.colors.textPrimary, fontWeight: "700", fontSize: 13 }}>Bericht veröffentlichen</Text>
          </TouchableOpacity>
        </View>
      )}

      {sectionId !== "community" && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {reports.map((rep) => (
            <TouchableOpacity key={rep.id} onPress={() => setSelectedId(rep.id)} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: rep.id === activeReport?.id ? aspectTheme.colors.accentSoft : aspectTheme.colors.surface, borderWidth: 1, borderColor: rep.id === activeReport?.id ? aspectTheme.colors.accentText : aspectTheme.colors.border }}>
              <Text style={{ color: aspectTheme.colors.textPrimary, fontWeight: "700", fontSize: 13 }}>{rep.title}</Text>
              <Text style={{ color: aspectTheme.colors.textMuted, fontSize: 11 }}>{rep.category} · {rep.publishedAt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {activeReport && (
        <View style={{ padding: 16, borderRadius: 16, backgroundColor: aspectTheme.colors.surface, borderWidth: 1, borderColor: aspectTheme.colors.border, gap: 10 }}>
          {sectionId !== "community" && (
            <>
              <Text style={{ color: aspectTheme.colors.accentText, fontSize: 12, fontWeight: "700" }}>{activeReport.category} · {activeReport.publishedAt}</Text>
              <Text style={{ color: aspectTheme.colors.textPrimary, fontSize: 20, fontWeight: "800" }}>{activeReport.title}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Text style={{ color: aspectTheme.colors.textSecondary, fontSize: 12, fontWeight: "600" }}>{activeReport.author} ({activeReport.handle})</Text>
                {activeReport.verified && <VerifiedBadge label="Verifiziert" compact />}
              </View>
              <Text style={{ color: aspectTheme.colors.textSecondary, fontSize: 14, fontWeight: "600" }}>{activeReport.summary}</Text>
              <Text style={{ color: aspectTheme.colors.textPrimary, fontSize: 15, lineHeight: 23 }}>{activeReport.body}</Text>
            </>
          )}
          <View style={{ marginTop: sectionId === "community" ? 0 : 8, paddingTop: sectionId === "community" ? 0 : 12, borderTopWidth: sectionId === "community" ? 0 : 1, borderTopColor: aspectTheme.colors.border, gap: 8 }}>
            <Text style={{ color: aspectTheme.colors.textPrimary, fontWeight: "700", fontSize: 14 }}>Community-Stimmen ({activeReport.comments.length})</Text>
            {activeReport.comments.map((c, idx) => (
              <View key={idx} style={{ padding: 10, borderRadius: 12, backgroundColor: aspectTheme.colors.surfaceRaised, borderWidth: 1, borderColor: aspectTheme.colors.border }}>
                <Text style={{ color: aspectTheme.colors.textSecondary, fontSize: 13 }}>{c}</Text>
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TextInput value={commentDraft} onChangeText={setCommentDraft} placeholder="Beitrag zur Community hinzufügen..." placeholderTextColor={aspectTheme.colors.textMuted} style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, color: aspectTheme.colors.textPrimary, backgroundColor: aspectTheme.colors.surfaceRaised, borderWidth: 1, borderColor: aspectTheme.colors.border }} />
              <TouchableOpacity onPress={handleAddComment} style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, backgroundColor: aspectTheme.colors.accent }}>
                <Text style={{ color: aspectTheme.colors.textPrimary, fontWeight: "700", fontSize: 12 }}>Posten</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
};
