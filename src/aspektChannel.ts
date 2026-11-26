export type AspektPlatformTarget = "web" | "app" | "both";

export interface AspektChannelSection {
  id: "channel" | "reports" | "community";
  title: string;
  subtitle: string;
  platforms: AspektPlatformTarget;
}

export interface AspektVerifiedProfile {
  id: string;
  name: string;
  handle: string;
  roleLabel: string;
  verified: boolean;
}

export const ASPEKT_CHANNEL_SECTIONS: AspektChannelSection[] = [
  {
    id: "channel",
    title: "Medienkanal ASPEKT.TV",
    subtitle: "Kuratiertes Programm, Live- Impulse und ruhige Optik auf Web & App.",
    platforms: "both",
  },
  {
    id: "reports",
    title: "Berichte",
    subtitle: "Redaktionelle Artikel und Hintergründe – schreiben, lesen und teilen.",
    platforms: "both",
  },
  {
    id: "community",
    title: "Community",
    subtitle: "Direkter Austausch rund um Berichte und Kanäle ohne Feed-Lärm.",
    platforms: "both",
  },
];

export const ASPEKT_VERIFIED_PROFILES: AspektVerifiedProfile[] = [
  {
    id: "aspekt-redaktion",
    name: "ASPEKT Redaktion",
    handle: "@aspekt_tv",
    roleLabel: "Offizieller Kanal",
    verified: true,
  },
];
