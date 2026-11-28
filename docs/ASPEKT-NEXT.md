# ASPEKT NEXT

Status: Entwicklungsentwurf, keine Produktionsfreigabe.

## Befund
Expo 58, React Native, TypeScript strict, Supabase Chat. App.tsx bündelt Redaktion, Pulse, Stories, Shorts, lokale Rollen und Web-localStorage. ConsciousFeed bietet Feed-Modi und Session-Limits. SocialChatModal enthält Gruppen, Bilder, Reaktionen und Web-Sprachnachrichten. Laufzeit und Datenbank-Policies nicht verifiziert. .env enthält einen öffentlichen Supabase-Client-Schlüssel und doppelte URL-Konfiguration; keine erkennbaren Service-Role-Schlüssel in dieser Datei. Historie nicht geprüft.

## Architektur
Expo-Client beibehalten, Features schrittweise modularisieren. Gemeinsame Supabase-Authentifizierung, serverseitige Rollen, RLS, versionierte Migrationen und getrennte Umgebungen. Keine Service-Role-Schlüssel im Client. Domänen identity, editorial, community, messaging, media, live, trust, commerce, events, creator, discovery. Redaktionelle Freigabe von Nutzerbeiträgen trennen. Medien mit validierten Uploads, Transcoding, CDN und Rechteprüfung. Live smartphone-first über evaluierten WebRTC-Anbieter, später Studio/OBS. Keine Aktivierung von Zahlungen; 10% Marktplatzgebühr bleibt Entwurf.

## FREEDOM
src/domain/freedom.ts enthält erste reine Domänenfunktionen und Entwurfsgrundsätze, noch nicht an UI oder Backend angeschlossen. Keine Sanktion allein wegen kontroverser Meinungen. Nachvollziehbare Gründe, verhältnismäßige Maßnahmen, Einspruch, menschliche Prüfung, Audit und datenschutzgerechte Transparenzberichte. Persönliche Filter von Plattformmaßnahmen trennen. Gesetzliche Pflichten und Schutz anderer beachten. Chronologischer und Following-Feed. Keine automatische Sanktion allein aufgrund eines Stichworts.

## Reihenfolge und Freigabe
1. Vollständiges Inventar, Typecheck, Lint, Build, Secret-Historie, RLS-Negativtests. Lokale Admin-Rollen und Geburtsjahr nicht als Sicherheitsgrenze verwenden.
2. Auth, Persistenz, Trust, Einspruch, Feed und Community. Demo-Inhalte kennzeichnen. Bestehenden Chat regressionsprüfen.
3. Video, Shorts, Live, Debatte, Creator.
4. Events, Shop, Mitgliedschaften, Musikrechte, KI, Mehrsprachigkeit und native Releases.
5. Lasttests, Backup/Restore, Kostenlimits, Datenschutz, Jugendschutz und Rechtsprüfung. Keine 18+-Freigabe ohne belastbare Altersprüfung. Kein Merge nach main ohne Review.

## Offene Prüfungen
Keine vollständige Dateibaumprüfung, keine ausgeführten Builds oder Tests, keine Prüfung der produktiven Supabase-Policies. Repository-Sichtbarkeit nicht geändert. GitHub-Stand nicht als identisch mit Floot annehmen.
