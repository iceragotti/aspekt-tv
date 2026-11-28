# VIDEO ENGINE – Testfreigabe

Web: lokale MP4/WebM-Wiedergabe, maximal 20 MiB, Client-Signaturprüfung, privater Upload nur mit Loopback-URL und EXPO_PUBLIC_VIDEO_STAGING=true. Native Wiedergabe fehlt. Creator-Name serverseitig speicherbar; Abruf und Kontowechseltests fehlen. Keine öffentliche Wiedergabe. SQL-Migration erfordert echte lokale Supabase Storage-Schemata; nicht in PostgreSQL-Stub anwenden.

Vor Freigabe: zwei Testkonten, Upload in fremden Ordner verweigern, fremde Objekte lesen/löschen verweigern, anonyme Zugriffe verweigern, MIME/Größenlimits und bestehende Storage-Policies prüfen. Client-Signaturprüfung ist umgehbar; serverseitige Quarantäne, Bytevalidierung, Malwareprüfung, Transcoding, Quoten und Moderationsworkflow mit tatsächlicher Sperrdurchsetzung fehlen. Keine öffentliche Bucket-Freigabe. Testen: ungültige Dateien, Abbruch, Kontowechsel, Creator-Profile RLS, Web-Build und native Fallbacks. Keine Produktionsmigration.
