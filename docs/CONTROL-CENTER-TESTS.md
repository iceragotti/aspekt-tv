# Control Center – Freigabecheck

Standardmäßig deaktiviert. EXPO_PUBLIC_TRUST_STAGING=true ausschließlich in separatem Test-Build mit separater Supabase-URL und Testkonten setzen. Client-Flag ist keine Sicherheitsgrenze. Migration nur in Testdatenbank anwenden. Keine Produktionsdaten verwenden.

- Ohne Flag keine Trust-Abfragen; ohne Session keine Fälle.
- Nutzer A sieht eigene Entscheidungen, Nutzer B keine fremden. Abmelden/Kontowechsel löscht angezeigte Fälle. Tokenwechsel und laufende Anfragen testen.
- Nichtmoderator kann keine fremden Einsprüche bearbeiten; ursprünglicher Moderator darf nicht entscheiden. Inaktiver Moderator verliert Zugriff. Direkte RPC-Aufrufe mit fremden IDs müssen scheitern.
- Einspruch, doppelte Eingabe, Netzfehler, Aktualisierung, Bestätigung und Aufhebung testen; Audit prüfen.
- Feed-Auswahl im FREEDOM-Bereich muss PULSE-Ansicht ändern; vorhandene lokale Daten und Chat bleiben erhalten.
- Statusanzeige ist manuell aktualisierte Fallübersicht, keine Push-Benachrichtigung oder Gelesen-Markierung. Keine Sanktionen werden durchgesetzt. Kein Erstellen neuer Moderationsfälle in dieser UI; Zielreferenzen und echte Content-Autorisierung vor Freigabe implementieren. Moderator sieht maximal 100 Fälle; Pagination fehlt. 
- Typecheck, Lint, Web/iOS/Android Build und Regressionstests vor Merge. Tests bisher nicht ausgeführt.
