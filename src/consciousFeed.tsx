import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

type FeedMode = 'chronological' | 'following' | 'focus';

export type ConsciousFeedPost = {
  id: string;
  author: string;
  handle: string;
  category: string;
  text: string;
  createdAt: number;
  following: boolean;
  focus: boolean;
};

type StoredSession = {
  day: string;
  limitMinutes: number;
  usedSeconds: number;
  runningSince: number | null;
  extendedSeconds?: number;
};

type ConsciousFeedProps = {
  posts?: ConsciousFeedPost[];
  onPrivacyPress?: () => void;
  compact?: boolean;
};

const STORAGE_KEY = 'aspekt-conscious-feed-session-v1';
const DAILY_LIMITS = [15, 30, 60] as const;
const COLORS = {
  background: '#141418',
  surface: '#1d1d24',
  accent: '#e11d48',
  text: '#F4F4F5',
  muted: '#A1A1AA',
  border: '#33333D',
};

const DEFAULT_POSTS: ConsciousFeedPost[] = [
  {
    id: 'studio-briefing',
    author: 'ASPEKT Redaktion',
    handle: '@aspekt',
    category: 'News',
    text: 'Was heute wichtig ist: ein kompakter Überblick über die Themen des Tages – mit Quellen und unterschiedlichen Perspektiven.',
    createdAt: 3,
    following: true,
    focus: true,
  },
  {
    id: 'community-perspective',
    author: 'Mara K.',
    handle: '@marak',
    category: 'Community',
    text: 'Welche Frage sollte in der nächsten Gesprächsrunde unbedingt gestellt werden? Wir sammeln Vorschläge aus der Community.',
    createdAt: 2,
    following: true,
    focus: false,
  },
  {
    id: 'deep-dive',
    author: 'ASPEKT Analyse',
    handle: '@analyse',
    category: 'Hintergrund',
    text: 'Ein Thema, mehrere Blickwinkel: Der Hintergrundbeitrag ordnet die wichtigsten Entwicklungen ein und verlinkt weiterführende Informationen.',
    createdAt: 1,
    following: false,
    focus: true,
  },
];

const getDayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

const isStoredSession = (value: unknown): value is StoredSession => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<StoredSession>;
  return (
    typeof candidate.day === 'string' &&
    typeof candidate.limitMinutes === 'number' &&
    DAILY_LIMITS.includes(candidate.limitMinutes as (typeof DAILY_LIMITS)[number]) &&
    typeof candidate.usedSeconds === 'number' &&
    Number.isFinite(candidate.usedSeconds) &&
    candidate.usedSeconds >= 0 &&
    (candidate.extendedSeconds === undefined ||
      (typeof candidate.extendedSeconds === 'number' &&
        Number.isFinite(candidate.extendedSeconds) &&
        candidate.extendedSeconds >= 0)) &&
    (candidate.runningSince === null ||
      (typeof candidate.runningSince === 'number' &&
        Number.isFinite(candidate.runningSince)))
  );
};

const readStoredSession = async (): Promise<StoredSession | null> => {
  const raw =
    Platform.OS === 'web'
      ? globalThis.localStorage.getItem(STORAGE_KEY)
      : await SecureStore.getItemAsync(STORAGE_KEY);
  if (!raw) return null;

  const parsed: unknown = JSON.parse(raw);
  if (!isStoredSession(parsed)) {
    throw new Error('Die gespeicherten Session-Daten haben ein ungültiges Format.');
  }
  return parsed;
};

const writeStoredSession = async (session: StoredSession) => {
  const value = JSON.stringify(session);
  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(STORAGE_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(STORAGE_KEY, value);
};

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

function SessionLimitNotice({
  visible,
  onExtend,
  onEnd,
  onReturn,
}: {
  visible: boolean;
  onExtend: () => void;
  onEnd: () => void;
  onReturn: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onReturn}
    >
      <View style={styles.limitBackdrop}>
        <View style={styles.limitNotice}>
          <Text style={styles.limitEyebrow}>KLEINE PAUSE</Text>
          <Text style={styles.limitTitle}>Deine Session-Zeit ist vorbei</Text>
          <Text style={styles.limitBody}>
            Dein Session-Timer steht auf 00:00. Nimm dir einen Moment Pause oder
            verlängere die Session kurz.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onExtend}
            style={styles.extendButton}
          >
            <Text style={styles.extendButtonText}>Kurz verlängern (+5 Min.)</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onEnd}
            style={styles.noticeSecondaryButton}
          >
            <Text style={styles.noticeSecondaryText}>Session beenden</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onReturn}
            style={styles.noticeSecondaryButton}
          >
            <Text style={styles.noticeSecondaryText}>Zurück zum Feed</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function CameraView({ onBack }: { onBack: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraStatus, setCameraStatus] = useState<
    'starting' | 'browser' | 'fallback'
  >(Platform.OS === 'web' ? 'starting' : 'fallback');
  const [fallbackMessage, setFallbackMessage] = useState(
    Platform.OS === 'web'
      ? ''
      : 'Die native Kamera ist in dieser Version nicht eingebunden.',
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let active = true;
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        setCameraStatus('fallback');
        setFallbackMessage(
          'Dieser Browser unterstützt keinen Kamera-Zugriff. Du kannst weiterhin im Feed lesen.',
        );
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user' },
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          stream = null;
          setCameraStatus('fallback');
          setFallbackMessage('Die Kameravorschau konnte nicht gestartet werden.');
          return;
        }

        video.srcObject = stream;
        await video.play();
        if (active) setCameraStatus('browser');
      } catch {
        if (!active) return;
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setCameraStatus('fallback');
        setFallbackMessage(
          'Kamera-Zugriff nicht verfügbar. Prüfe die Browser-Berechtigung oder kehre zum Feed zurück.',
        );
      }
    };

    void startCamera();
    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  const statusLabel =
    cameraStatus === 'browser'
      ? 'Browser-Kamera aktiv'
      : cameraStatus === 'fallback'
        ? Platform.OS === 'web'
          ? 'Browser-Fallback'
          : 'Native Fallback'
        : 'Browser-Kamera wird gestartet';

  return (
    <View style={styles.cameraScreen}>
      <View style={styles.cameraHeader}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={styles.cameraBackButton}
        >
          <Text style={styles.cameraBackText}>‹ Zurück zum Feed</Text>
        </Pressable>
        <Text style={styles.cameraTitle}>Kamera</Text>
      </View>
      <View style={styles.cameraFrame}>
        {Platform.OS === 'web' && (
          <View style={styles.cameraVideoWrap}>
            {React.createElement('video', {
              ref: videoRef,
              autoPlay: true,
              muted: true,
              playsInline: true,
              'aria-label': 'Browser-Kameravorschau',
              style: {
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                backgroundColor: '#09090B',
              },
            })}
          </View>
        )}
        {cameraStatus === 'fallback' && (
          <View style={styles.cameraFallback}>
            <Text style={styles.cameraFallbackIcon}>◉</Text>
            <Text style={styles.cameraFallbackText}>
              {fallbackMessage || 'Kameravorschau momentan nicht verfügbar.'}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.cameraStatusRow}>
        <View
          style={[
            styles.cameraStatusDot,
            cameraStatus === 'browser' && styles.cameraStatusDotActive,
          ]}
        />
        <Text style={styles.cameraStatusLabel}>{statusLabel}</Text>
      </View>
      <Text style={styles.cameraHint}>
        Die Kamera wird erst nach dem Öffnen dieser Ansicht angefragt und beim
        Zurückkehren zum Feed wieder freigegeben.
      </Text>
    </View>
  );
}

export function ConsciousFeed({
  posts = DEFAULT_POSTS,
  onPrivacyPress,
  compact = false,
}: ConsciousFeedProps) {
  const [mode, setMode] = useState<FeedMode>('chronological');
  const [now, setNow] = useState(Date.now());
  const [session, setSession] = useState<StoredSession | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [privacyMessage, setPrivacyMessage] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [limitNoticeDismissed, setLimitNoticeDismissed] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  const updateSession = useCallback((next: StoredSession) => {
    setSession(next);
  }, []);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const saved = await readStoredSession();
        if (!active) return;

        const today = getDayKey(new Date());
        const restored =
          saved?.day === today
            ? saved
            : {
                day: today,
                limitMinutes: saved?.limitMinutes ?? 15,
                usedSeconds: 0,
                runningSince: saved?.runningSince ? Date.now() : null,
                extendedSeconds: 0,
              };
        updateSession({ extendedSeconds: 0, ...restored });
      } catch (error) {
        if (!active) return;
        const message =
          error instanceof Error ? error.message : 'Unbekannter Speicherfehler.';
        setStorageError(`Session-Speicher konnte nicht gelesen werden: ${message}`);
        updateSession({
          day: getDayKey(new Date()),
          limitMinutes: 15,
          usedSeconds: 0,
          runningSince: null,
          extendedSeconds: 0,
        });
      } finally {
        if (active) setStorageReady(true);
      }
    };

    void restore();
    return () => {
      active = false;
    };
  }, [updateSession]);

  useEffect(() => {
    if (!session) return;
    saveQueue.current = saveQueue.current
      .then(() => writeStoredSession(session))
      .then(() => setStorageError(''))
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Unbekannter Speicherfehler.';
        setStorageError(`Session-Speicher konnte nicht geschrieben werden: ${message}`);
      });
  }, [session]);

  useEffect(() => {
    if (!session?.runningSince) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session?.runningSince]);

  const usedSeconds = session
    ? session.usedSeconds +
      (session.runningSince
        ? Math.max(0, Math.floor((now - session.runningSince) / 1000))
        : 0)
    : 0;
  const limitSeconds =
    (session?.limitMinutes ?? 15) * 60 + (session?.extendedSeconds ?? 0);
  const remainingSeconds = Math.max(0, limitSeconds - usedSeconds);
  const isRunning = Boolean(session?.runningSince) && remainingSeconds > 0;

  useEffect(() => {
    if (!session || getDayKey(new Date(now)) === session.day) return;
    updateSession({
      ...session,
      day: getDayKey(new Date(now)),
      usedSeconds: 0,
      runningSince: session.runningSince ? now : null,
      extendedSeconds: 0,
    });
  }, [now, session, updateSession]);

  useEffect(() => {
    if (!session?.runningSince || remainingSeconds > 0) return;
    updateSession({
      ...session,
      usedSeconds,
      runningSince: null,
    });
  }, [remainingSeconds, session, updateSession, usedSeconds]);

  const visiblePosts = useMemo(() => {
    const chronological = [...posts].sort((a, b) => b.createdAt - a.createdAt);
    if (mode === 'following') return chronological.filter((post) => post.following);
    if (mode === 'focus') return chronological.filter((post) => post.focus);
    return chronological;
  }, [mode, posts]);

  const changeLimit = (limitMinutes: number) => {
    if (!session) return;
    updateSession({
      ...session,
      limitMinutes,
      usedSeconds: 0,
      extendedSeconds: 0,
      runningSince: session.runningSince ? Date.now() : null,
    });
    setLimitNoticeDismissed(false);
    setSessionEnded(false);
    setNow(Date.now());
  };

  const toggleSession = () => {
    if (!session) return;
    if (isRunning) {
      updateSession({
        ...session,
        usedSeconds,
        runningSince: null,
      });
      return;
    }

    if (remainingSeconds <= 0) return;
    updateSession({ ...session, runningSince: Date.now() });
    setNow(Date.now());
  };

  const extendSession = () => {
    if (!session) return;
    const timestamp = Date.now();
    updateSession({
      ...session,
      extendedSeconds: (session.extendedSeconds ?? 0) + 5 * 60,
      runningSince: timestamp,
    });
    setLimitNoticeDismissed(false);
    setSessionEnded(false);
    setNow(timestamp);
  };

  const endSession = () => {
    if (session?.runningSince) {
      updateSession({ ...session, usedSeconds, runningSince: null });
    }
    setSessionEnded(true);
    setLimitNoticeDismissed(true);
  };

  const returnToFeed = () => setLimitNoticeDismissed(true);

  const handlePrivacyPress = () => {
    setPrivacyMessage(
      'Dein Session-Zähler wird lokal auf diesem Gerät gespeichert. Es werden dafür keine Feed-Nutzungsdaten an ASPEKT übertragen.',
    );
    onPrivacyPress?.();
  };

  const progress = limitSeconds > 0 ? Math.min(1, usedSeconds / limitSeconds) : 0;
  const showLimitNotice =
    storageReady &&
    Boolean(session) &&
    remainingSeconds <= 0 &&
    !limitNoticeDismissed &&
    !sessionEnded;

  useEffect(() => {
    if (showLimitNotice && cameraOpen) {
      setCameraOpen(false);
    }
  }, [cameraOpen, showLimitNotice]);

  if (cameraOpen) {
    return <CameraView onBack={() => setCameraOpen(false)} />;
  }

  if (compact) {
    return (
      <View style={styles.barContainer} accessibilityLabel="Bewusste Feed-Steuerung">
        <View style={styles.sessionCard}>
          <View style={styles.sessionHeading}>
            <View>
              <Text style={styles.cardTitle}>Deine heutige Session</Text>
              <Text style={styles.caption}>
                {storageReady ? 'Auf diesem Gerät gespeichert' : 'Speicher wird geladen …'}
              </Text>
            </View>
            <Text style={styles.timer}>{formatTime(remainingSeconds)}</Text>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            style={styles.progressTrack}
          >
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={styles.limitRow}>
            <Text style={styles.caption}>Tageslimit</Text>
            <View style={styles.limitOptions}>
              {DAILY_LIMITS.map((limit) => (
                <Pressable
                  key={limit}
                  accessibilityRole="button"
                  accessibilityState={{ selected: session?.limitMinutes === limit }}
                  onPress={() => changeLimit(limit)}
                  disabled={!storageReady}
                  style={[
                    styles.limitButton,
                    session?.limitMinutes === limit && styles.limitButtonSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.limitText,
                      session?.limitMinutes === limit && styles.limitTextSelected,
                    ]}
                  >
                    {limit} Min.
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.barActions}>
            <Pressable
              accessibilityRole="button"
              onPress={toggleSession}
              disabled={!storageReady || (!isRunning && remainingSeconds <= 0)}
              style={[
                styles.sessionAction,
                styles.barSessionAction,
                (!storageReady || (!isRunning && remainingSeconds <= 0)) && styles.disabled,
              ]}
            >
              <Text style={styles.sessionActionText}>
                {isRunning ? 'Pause' : remainingSeconds > 0 ? 'Fortsetzen' : 'Limit erreicht'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={handlePrivacyPress}
              style={styles.privacyButton}
            >
              <Text style={styles.privacyButtonText}>DSGVO & Datenexport</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setCameraOpen(true)}
            style={styles.cameraOpenButton}
          >
            <Text style={styles.cameraOpenText}>Kamera öffnen</Text>
          </Pressable>
          {storageError !== '' && (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {storageError}
            </Text>
          )}
          {privacyMessage !== '' && <Text style={styles.caption}>{privacyMessage}</Text>}
        </View>
        <View style={styles.modeRow}>
          {(
            [
              ['chronological', 'Chronologisch'],
              ['following', 'Folge ich'],
              ['focus', 'Fokus'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === value }}
              onPress={() => setMode(value)}
              style={[styles.modeButton, mode === value && styles.modeButtonSelected]}
            >
              <Text style={[styles.modeText, mode === value && styles.modeTextSelected]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <SessionLimitNotice
          visible={showLimitNotice}
          onExtend={extendSession}
          onEnd={endSession}
          onReturn={returnToFeed}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      accessibilityLabel="Bewusster Feed"
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ASPEKT COMMUNITY</Text>
          <Text style={styles.title}>Bewusster Feed</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={handlePrivacyPress}
          style={styles.privacyButton}
        >
          <Text style={styles.privacyButtonText}>DSGVO</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setCameraOpen(true)}
        style={styles.cameraOpenButton}
      >
        <Text style={styles.cameraOpenText}>Kamera öffnen</Text>
      </Pressable>

      <View style={styles.sessionCard}>
        <View style={styles.sessionHeading}>
          <View>
            <Text style={styles.cardTitle}>Deine heutige Session</Text>
            <Text style={styles.caption}>
              {storageReady ? 'Auf diesem Gerät gespeichert' : 'Speicher wird geladen …'}
            </Text>
          </View>
          <Text style={styles.timer}>{formatTime(remainingSeconds)}</Text>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          style={styles.progressTrack}
        >
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.limitRow}>
          <Text style={styles.caption}>Tageslimit</Text>
          <View style={styles.limitOptions}>
            {DAILY_LIMITS.map((limit) => (
              <Pressable
                key={limit}
                accessibilityRole="button"
                accessibilityState={{ selected: session?.limitMinutes === limit }}
                onPress={() => changeLimit(limit)}
                disabled={!storageReady}
                style={[
                  styles.limitButton,
                  session?.limitMinutes === limit && styles.limitButtonSelected,
                ]}
              >
                <Text
                  style={[
                    styles.limitText,
                    session?.limitMinutes === limit && styles.limitTextSelected,
                  ]}
                >
                  {limit} Min.
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={toggleSession}
          disabled={!storageReady || (!isRunning && remainingSeconds <= 0)}
          style={[
            styles.sessionAction,
            (!storageReady || (!isRunning && remainingSeconds <= 0)) && styles.disabled,
          ]}
        >
          <Text style={styles.sessionActionText}>
            {isRunning
              ? 'Session pausieren'
              : remainingSeconds > 0
                ? 'Session fortsetzen'
                : 'Tageslimit erreicht'}
          </Text>
        </Pressable>
        {storageError !== '' && (
          <Text accessibilityRole="alert" style={styles.errorText}>
            {storageError}
          </Text>
        )}
        {privacyMessage !== '' && <Text style={styles.caption}>{privacyMessage}</Text>}
      </View>

      <View style={styles.modeRow}>
        {(
          [
            ['chronological', 'Chronologisch'],
            ['following', 'Folge ich'],
            ['focus', 'Fokus'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === value }}
            onPress={() => setMode(value)}
            style={[styles.modeButton, mode === value && styles.modeButtonSelected]}
          >
            <Text style={[styles.modeText, mode === value && styles.modeTextSelected]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {visiblePosts.map((post) => (
        <View key={post.id} style={styles.postCard}>
          <View style={styles.postHeader}>
            <View>
              <Text style={styles.author}>{post.author}</Text>
              <Text style={styles.caption}>{post.handle}</Text>
            </View>
            <Text style={styles.category}>{post.category}</Text>
          </View>
          <Text style={styles.postText}>{post.text}</Text>
        </View>
      ))}

      <View style={styles.endCard}>
        <View style={styles.endMark} />
        <Text style={styles.endTitle}>Auf dem aktuellen Stand</Text>
        <Text style={styles.endText}>
          Du hast alle Beiträge in diesem Feed gesehen. Gönn dir eine Pause oder
          komm später wieder.
        </Text>
      </View>
      <SessionLimitNotice
        visible={showLimitNotice}
        onExtend={extendSession}
        onEnd={endSession}
        onReturn={returnToFeed}
      />
    </ScrollView>
  );
}

export function ConsciousFeedBar({ onPrivacyPress }: Pick<ConsciousFeedProps, 'onPrivacyPress'>) {
  return <ConsciousFeed compact onPrivacyPress={onPrivacyPress} />;
}

export default ConsciousFeed;

const styles = StyleSheet.create({
  barContainer: { gap: 10, marginBottom: 12 },
  limitBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  limitNotice: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  limitEyebrow: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  limitTitle: { color: COLORS.text, fontSize: 20, fontWeight: '900' },
  limitBody: { color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  extendButton: {
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 9,
    paddingVertical: 12,
    marginTop: 2,
  },
  extendButtonText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  noticeSecondaryButton: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 9,
    paddingVertical: 11,
  },
  noticeSecondaryText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  cameraScreen: {
    flex: 1,
    minHeight: 420,
    backgroundColor: COLORS.background,
    padding: 16,
    gap: 14,
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cameraBackButton: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  cameraBackText: { color: COLORS.text, fontSize: 13, fontWeight: '800' },
  cameraTitle: { color: COLORS.text, fontSize: 18, fontWeight: '900' },
  cameraFrame: {
    flex: 1,
    minHeight: 280,
    maxHeight: 540,
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#09090B',
  },
  cameraVideoWrap: { flex: 1 },
  cameraFallback: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#09090B',
    gap: 12,
  },
  cameraFallbackIcon: { color: COLORS.muted, fontSize: 42 },
  cameraFallbackText: {
    maxWidth: 360,
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  cameraStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cameraStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
  },
  cameraStatusDotActive: { backgroundColor: '#22C55E' },
  cameraStatusLabel: { color: COLORS.text, fontSize: 12, fontWeight: '800' },
  cameraHint: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  cameraOpenButton: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#25252E',
    paddingVertical: 10,
  },
  cameraOpenText: { color: COLORS.text, fontSize: 12, fontWeight: '800' },
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  eyebrow: { color: COLORS.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: COLORS.text, fontSize: 24, fontWeight: '900', marginTop: 3 },
  privacyButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  privacyButtonText: { color: COLORS.text, fontSize: 11, fontWeight: '800' },
  sessionCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  sessionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  caption: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  timer: { color: COLORS.text, fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  progressTrack: {
    height: 6,
    borderRadius: 8,
    backgroundColor: '#34343E',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.accent, borderRadius: 8 },
  limitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  limitOptions: { flexDirection: 'row', gap: 6 },
  limitButton: {
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  limitButtonSelected: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  limitText: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  limitTextSelected: { color: '#FFF' },
  sessionAction: {
    backgroundColor: COLORS.accent,
    borderRadius: 9,
    alignItems: 'center',
    paddingVertical: 11,
  },
  barSessionAction: { flex: 1 },
  barActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionActionText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  errorText: { color: '#FDA4AF', fontSize: 12, lineHeight: 17 },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
  },
  modeButtonSelected: { borderColor: COLORS.accent, backgroundColor: '#35131E' },
  modeText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  modeTextSelected: { color: '#FDA4AF' },
  postCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 15,
    gap: 12,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  author: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  category: {
    color: '#FDA4AF',
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: '#35131E',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  postText: { color: '#D4D4D8', fontSize: 14, lineHeight: 21 },
  endCard: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 22,
    gap: 8,
    marginTop: 2,
  },
  endMark: { width: 28, height: 3, borderRadius: 3, backgroundColor: COLORS.accent, marginBottom: 4 },
  endTitle: { color: COLORS.text, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  endText: { color: COLORS.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
