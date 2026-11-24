import React, { useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import SocialChatModal from './src/components/SocialChatModal';
import { ConsciousFeedBar } from './src/consciousFeed';

type Role = 'Administrator' | 'Chefredaktion' | 'Ressortleiter' | 'Redakteur' | 'Reporter' | 'Creator';
type ArticleStatus = 'Entwurf' | 'Zur Prüfung' | 'Korrektur nötig' | 'Freigegeben';
type PostStatus = 'Entwurf' | 'Zur Prüfung' | 'Freigegeben' | 'Abgelehnt';
type AgeRating = 'Alle' | '18+';

interface Article {
  id: string;
  title: string;
  kicker: string;
  summary: string;
  body: string;
  category: string;
  author: string;
  status: ArticleStatus;
  published: boolean;
  breaking?: boolean;
  breakingApproved?: boolean;
  verified: boolean;
  date: string;
  history: string[];
  submittedBy: Role;
}

interface SocialPost {
  id: string;
  type: 'Text' | 'Bild' | 'Clip';
  text: string;
  handle: string;
  creator: string;
  verified: boolean;
  rating: AgeRating;
  status: PostStatus;
  likes: number;
  comments: string[];
  history: string[];
  mediaUrl?: string;
  reported?: boolean;
  hidden?: boolean;
  soundName?: string;
  saved?: boolean;
}

interface Story {
  id: string;
  creator: string;
  handle: string;
  text: string;
  rating: AgeRating;
  seen: boolean;
}

interface AppState {
  articles: Article[];
  posts: SocialPost[];
  stories: Story[];
  ageMode: 'U18' | '18+';
  dailyLimitMinutes: 30 | 60;
  dailyUsageSeconds: number;
  dailyUsageDate: string;
  breakingApproved: boolean;
  crisisChecklist: Record<string, boolean>;
  history: string[];
  blockedHandles: string[];
  hiddenPostIds: string[];
  followed: string[];
  shortsFeed: 'Für Dich' | 'Gefolgt';
  shortsIndex: number;
}

const TODAY = '23. November 2026';

const INITIAL_ARTICLES: Article[] = [
  {
    id: 'a1', title: 'Österreichs Chancen in der europäischen Debatte',
    kicker: 'POLITIK', summary: 'Europa steht vor einem Jahr entscheidender Weichenstellungen.',
    body: 'Die kommenden Monate werden über zentrale europäische Prioritäten entscheiden. Für Österreich geht es um Wettbewerbsfähigkeit, sichere Lieferketten und eine starke demokratische Öffentlichkeit. Die ASPEKT-Redaktion ordnet die Positionen ein und spricht mit Expertinnen und Experten.',
    category: 'Politik', author: 'Mara Leitner', status: 'Freigegeben', published: true,
    breaking: true, breakingApproved: false, verified: true, date: TODAY,
    history: ['Entwurf erstellt', 'Zur Prüfung eingereicht', 'Von der Chefredaktion freigegeben'],
    submittedBy: 'Redakteur',
  },
  {
    id: 'a2', title: 'Die neue Realität des digitalen Journalismus',
    kicker: 'MEDIEN', summary: 'Wie unabhängige Redaktionen Vertrauen neu aufbauen.',
    body: 'Verifikation, Transparenz und direkte Nähe zur Community prägen die nächste Phase des digitalen Journalismus. Ein Blick in Redaktionsräume, Nachrichtentests und neue Formate.',
    category: 'Österreich', author: 'David Hofer', status: 'Freigegeben', published: true,
    verified: true, date: TODAY,
    history: ['Freigegeben'], submittedBy: 'Reporter',
  },
  {
    id: 'a3', title: 'Debatte.aktuell: Wohin führt die Energiewende?',
    kicker: 'DEBATTE', summary: 'Vier Perspektiven aus Politik, Wirtschaft und Gesellschaft.',
    body: 'In dieser Ausgabe diskutieren Vertreterinnen aus Energiewirtschaft, Kommunalpolitik und Zivilgesellschaft über Tempo, Kosten und soziale Fairness.',
    category: 'Wirtschaft', author: 'Julia Kern', status: 'Freigegeben', published: true,
    verified: true, date: TODAY,
    history: ['Freigegeben'], submittedBy: 'Redakteur',
  },
  {
    id: 'a4', title: 'Wintertournee: Österreich startet mit Ambitionen',
    kicker: 'SPORT', summary: 'Talente, Erfahrung und ein dichtes Saisonprogramm.',
    body: 'Das österreichische Team blickt mit einer Mischung aus erfahrenen Athletinnen und jungen Talenten auf die bevorstehenden Wettkämpfe.',
    category: 'Sport', author: 'Simon Wallner', status: 'Freigegeben', published: true,
    verified: true, date: TODAY,
    history: ['Freigegeben'], submittedBy: 'Reporter',
  },
  {
    id: 'a5', title: 'Neue Ausstellung bringt digitale Kunst ins Museum',
    kicker: 'KULTUR', summary: 'Künstlerinnen setzen KI und Raumerlebnis bewusst ein.',
    body: 'Die Ausstellung verbindet immersive Technik mit handwerklichen Arbeiten und macht die kreativen Entscheidungen hinter digitalen Bildern sichtbar.',
    category: 'Kultur', author: 'Elena Moser', status: 'Zur Prüfung', published: false,
    verified: true, date: TODAY,
    history: ['Entwurf erstellt', 'Zur Prüfung eingereicht'], submittedBy: 'Redakteur',
  },
  {
    id: 'a6', title: 'Kommunen prüfen neue Mobilitätskonzepte',
    kicker: 'CHRONIK', summary: 'Pilotprojekte sollen Pendeln und Nahversorgung verbinden.',
    body: 'Mehrere Gemeinden testen flexible Busangebote, sichere Radwege und neue Nahversorgungsmodelle.',
    category: 'Chronik', author: 'Noah Berger', status: 'Entwurf', published: false,
    verified: false, date: TODAY,
    history: ['Entwurf erstellt'], submittedBy: 'Reporter',
  },
  {
    id: 'a7', title: 'Europäische Märkte starten stabil in den Handel',
    kicker: 'WIRTSCHAFT', summary: 'Energiewerte und Technologieaktien geben Impulse.',
    body: 'Analystinnen erwarten einen ruhigen, aber selektiven Handelsstart. Besonders industrielle Technologie und erneuerbare Energien stehen im Fokus.',
    category: 'Wirtschaft', author: 'Lena Graf', status: 'Freigegeben', published: true,
    verified: true, date: TODAY,
    history: ['Freigegeben'], submittedBy: 'Redakteur',
  },
  {
    id: 'a8', title: 'Internationaler Gipfel startet neue Gespräche',
    kicker: 'INTERNATIONAL', summary: 'Diplomaten beraten über Sicherheit und humanitäre Hilfe.',
    body: 'Die Teilnehmer setzen gemeinsame Prioritäten für Krisenprävention und humanitäre Unterstützung. Die Verhandlungen sind noch im Anfangsstadium.',
    category: 'International', author: 'Amir Salihi', status: 'Korrektur nötig', published: false,
    verified: false, date: TODAY,
    history: ['Zur Prüfung eingereicht', 'Korrektur angefordert: Quellenangaben ergänzen'],
    submittedBy: 'Reporter',
  },
];

const INITIAL_POSTS: SocialPost[] = [
  { id: 'p1', type: 'Text', text: 'Was sollte Österreich in der nächsten Legislaturperiode zuerst reformieren? Eure Perspektiven zählen.', handle: '@aspekt_redaktion', creator: 'ASPEKT Redaktion', verified: true, rating: 'Alle', status: 'Freigegeben', likes: 284, comments: ['Bildungspolitik', 'Bessere Infrastruktur'], history: ['Zur Prüfung eingereicht', 'Freigegeben'] },
  { id: 'p2', type: 'Clip', text: '60 Sekunden: Warum Vertrauen die wichtigste Währung des Journalismus ist.', handle: '@live_studio', creator: 'Live Studio', verified: true, rating: 'Alle', status: 'Freigegeben', likes: 512, comments: [], history: ['Freigegeben'] },
  { id: 'p3', type: 'Bild', text: 'Ein Blick hinter die Kulissen von debatțe.aktuell.', handle: '@community_creator', creator: 'Community Creator', verified: false, rating: '18+', status: 'Zur Prüfung', likes: 96, comments: [], history: ['Zur Prüfung eingereicht'] },
];

const INITIAL_STORIES: Story[] = [
  { id: 's1', creator: 'ASPEKT Redaktion', handle: '@aspekt_redaktion', text: 'Heute um 18 Uhr: Neue Debatte live.', rating: 'Alle', seen: false },
  { id: 's2', creator: 'Live Studio', handle: '@live_studio', text: 'Unsere Live-Regie nimmt die Zuschauerfragen auf.', rating: 'Alle', seen: false },
  { id: 's3', creator: 'Community Creator', handle: '@community_creator', text: 'Ein Kommentar zur offenen Medienethik-Debatte.', rating: '18+', seen: false },
];

const NAV = ['Österreich', 'International', 'Politik', 'Wirtschaft', 'Chronik', 'Sport', 'Kultur'];
const CRISIS_ITEMS = ['Trinkwasser', 'Taschenlampe / Powerbank', 'Notfall-Apotheke', 'Wichtige Dokumente', 'Radio', 'Notfallkontakte'];
const STORAGE_KEY = 'aspekt-tv-cms-v1';

const getWebStorage = () => {
  if (Platform.OS !== 'web') return null;
  try {
    return (globalThis as any).localStorage ?? null;
  } catch {
    return null;
  }
};

const loadState = (): Partial<AppState> => {
  const storage = getWebStorage();
  if (!storage) return {};
  try {
    return JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
};

const ROLE_OPTIONS: Role[] = ['Administrator', 'Chefredaktion', 'Ressortleiter', 'Redakteur', 'Reporter', 'Creator'];

const PROTECTED = ['gewalt', 'sex', 'nackt', 'porno', 'droge', 'drogen', 'cannabis', 'kokain', 'waffe', 'blut'];
const containsProtected = (text: string) => PROTECTED.some((word) => text.toLowerCase().includes(word));

export default function App() {
  const [initial] = useState(loadState);
  const [tab, setTab] = useState<'News' | 'Live TV' | 'ASPEKT PULSE' | 'Shorts' | 'Team' | 'Redaktion' | 'Hilfe & Schutz'>('News');
  const [articles, setArticles] = useState<Article[]>(initial.articles ?? INITIAL_ARTICLES);
  const [posts, setPosts] = useState<SocialPost[]>(initial.posts ?? INITIAL_POSTS);
  const [stories, setStories] = useState<Story[]>(initial.stories ?? INITIAL_STORIES);
  const [ageMode, setAgeMode] = useState<'U18' | '18+'>(initial.ageMode ?? 'U18');
  const [birthYear, setBirthYear] = useState('');
  const [ageNotice, setAgeNotice] = useState('');
  const [dailyLimitMinutes, setDailyLimitMinutes] = useState<30 | 60>(
    initial.dailyLimitMinutes ?? 30,
  );
  const todayKey = new Date().toISOString().slice(0, 10);
  const [dailyUsageSeconds, setDailyUsageSeconds] = useState(
    initial.dailyUsageDate === todayKey ? initial.dailyUsageSeconds ?? 0 : 0,
  );
  const [dailyUsageDate, setDailyUsageDate] = useState(todayKey);
  const [breakingApproved, setBreakingApproved] = useState(initial.breakingApproved ?? false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(initial.crisisChecklist ?? {});
  const [role, setRole] = useState<Role>('Administrator');
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginModal, setLoginModal] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('Alle');
  const [cmsFilter, setCmsFilter] = useState<ArticleStatus | 'Alle'>('Alle');
  const [editor, setEditor] = useState<Article | null>(null);
  const [pulseComment, setPulseComment] = useState('');
  const [pulseNotice, setPulseNotice] = useState('');
  const [postText, setPostText] = useState('');
  const [postRating, setPostRating] = useState<AgeRating>('Alle');
  const [storyIndex, setStoryIndex] = useState<number | null>(null);
  const [storyText, setStoryText] = useState('');
  const [storyRating, setStoryRating] = useState<AgeRating>('Alle');
  const [shareNote, setShareNote] = useState('');
  const [followed, setFollowed] = useState<string[]>(
    initial.followed ?? [],
  );
  const [cmsHistory, setCmsHistory] = useState<string[]>(initial.history ?? []);
  const [blockedHandles, setBlockedHandles] = useState<string[]>(
    initial.blockedHandles ?? [],
  );
  const [hiddenPostIds, setHiddenPostIds] = useState<string[]>(
    initial.hiddenPostIds ?? [],
  );
  const [shortsFeed, setShortsFeed] = useState<'Für Dich' | 'Gefolgt'>(
    initial.shortsFeed ?? 'Für Dich',
  );
  const [shortsIndex, setShortsIndex] = useState(initial.shortsIndex ?? 0);
  const [shortsPlaying, setShortsPlaying] = useState(true);
  const [shortsMuted, setShortsMuted] = useState(false);
  const [newShortTitle, setNewShortTitle] = useState('');
  const [newShortTag, setNewShortTag] = useState('');
  const [newShortSound, setNewShortSound] = useState('');
  const [newShortRating, setNewShortRating] = useState<AgeRating>('Alle');
  const [shortCommentsOpen, setShortCommentsOpen] = useState(false);
  const [socialChatVisible, setSocialChatVisible] = useState(false);

  useEffect(() => {
    const storage = getWebStorage();
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({
        articles, posts, stories, ageMode, breakingApproved,
        crisisChecklist: checklist, history: cmsHistory,
        blockedHandles, hiddenPostIds, followed, shortsFeed, shortsIndex,
        dailyLimitMinutes, dailyUsageSeconds, dailyUsageDate,
      }));
    } catch {}
  }, [articles, posts, stories, ageMode, breakingApproved, checklist, cmsHistory, blockedHandles, hiddenPostIds, followed, shortsFeed, shortsIndex, dailyLimitMinutes, dailyUsageSeconds, dailyUsageDate]);

  useEffect(() => {
    const timer = setInterval(() => {
      const currentDate = new Date().toISOString().slice(0, 10);
      if (currentDate !== dailyUsageDate) {
        setDailyUsageDate(currentDate);
        setDailyUsageSeconds(0);
        return;
      }
      setDailyUsageSeconds((current) => current + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [dailyUsageDate]);

  const published = articles.filter((article) => article.published);
  const visibleArticles = published.filter((article) => {
    const categoryMatches = selectedCategory === 'Alle' || article.category === selectedCategory;
    const searchMatches = !search.trim() || `${article.title} ${article.summary} ${article.author}`.toLowerCase().includes(search.toLowerCase());
    return categoryMatches && searchMatches;
  });
  const hero = visibleArticles[0];

  const visiblePosts = posts.filter((post) => {
    if (post.status !== 'Freigegeben') return false;
    if (blockedHandles.includes(post.handle) || hiddenPostIds.includes(post.id)) return false;
    if (ageMode === 'U18' && (post.rating === '18+' || containsProtected(post.text))) return false;
    return true;
  });

  const shortsClips = posts.filter((post) =>
    post.type === 'Clip' &&
    post.status === 'Freigegeben' &&
    !blockedHandles.includes(post.handle) &&
    !hiddenPostIds.includes(post.id) &&
    (ageMode === '18+' || post.rating === 'Alle') &&
    (shortsFeed === 'Für Dich' || followed.includes(post.handle))
  );
  const safeShortsIndex =
    shortsClips.length === 0
      ? 0
      : Math.min(shortsIndex, shortsClips.length - 1);
  const activeShort = shortsClips[safeShortsIndex] ?? null;

  const verifyAdult = () => {
    const year = Number(birthYear);
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(year) || birthYear.trim().length !== 4) {
      setAgeNotice('Bitte ein gültiges vierstelliges Geburtsjahr eingeben.');
      return;
    }
    if (year > currentYear || year < currentYear - 120) {
      setAgeNotice('Bitte ein plausibles Geburtsjahr eingeben.');
      return;
    }
    if (currentYear - year >= 18) {
      setAgeMode('18+');
      setAgeNotice('Altersfreigabe bestätigt. Der 18+-Modus ist aktiv.');
    } else {
      setAgeMode('U18');
      setAgeNotice('Die Altersfreigabe ist nicht möglich. Der U18-Modus bleibt aktiv.');
    }
  };

  const logChange = (message: string) => setCmsHistory((prev) => [`${TODAY} · ${message}`, ...prev].slice(0, 40));

  const submitArticle = (article: Article) => {
    setArticles((prev) => prev.map((item) => item.id === article.id
      ? { ...item, status: 'Zur Prüfung', published: false, history: [...item.history, 'Zur Prüfung eingereicht'] }
      : item));
    logChange(`${article.title}: Zur Prüfung eingereicht`);
  };

  const approveArticle = (article: Article) => {
    if (role === 'Ressortleiter' && article.category !== 'Politik') return;
    setArticles((prev) => prev.map((item) => item.id === article.id
      ? { ...item, status: 'Freigegeben', published: true, history: [...item.history, `Freigegeben durch ${role}`] }
      : item));
    logChange(`${article.title}: Freigegeben`);
  };

  const rejectArticle = (article: Article) => {
    setArticles((prev) => prev.map((item) => item.id === article.id
      ? { ...item, status: 'Korrektur nötig', published: false, history: [...item.history, `Zur Korrektur zurückgewiesen durch ${role}`] }
      : item));
    logChange(`${article.title}: Zur Korrektur`);
  };

  const addSocialPost = () => {
    if (!postText.trim()) return;
    if (postRating === '18+' && ageMode !== '18+') return;
    if (containsProtected(postText)) {
      if (ageMode !== '18+') return;
      if (postRating !== '18+') setPostRating('18+');
    }
    setPosts((prev) => [{
      id: `post-${Date.now()}`, type: 'Text', text: postText.trim(), handle: '@mein_creator',
      creator: 'Eigener Creator', verified: false, rating: postRating, status: 'Zur Prüfung',
      likes: 0, comments: [], history: ['Zur Prüfung eingereicht'],
    }, ...prev]);
    setPostText('');
    logChange('Neuer Social-Beitrag zur Prüfung eingereicht');
  };

  const moderatePost = (id: string, status: 'Freigegeben' | 'Abgelehnt') => {
    setPosts((prev) => prev.map((post) => post.id === id
      ? { ...post, status, history: [...post.history, `${status} durch ${role}`] }
      : post));
    logChange(`Social-Beitrag ${status === 'Freigegeben' ? 'freigegeben' : 'abgelehnt'}`);
  };

  const sharePost = () => {
    setShareNote('Link kopiert');
    setTimeout(() => setShareNote(''), 1800);
  };

  const changeShort = (direction: number) => {
    if (shortsClips.length === 0) return;
    setShortsIndex((prev) =>
      (prev + direction + shortsClips.length) % shortsClips.length,
    );
  };

  const likeShort = (id: string) => {
    setPosts((prev) => prev.map((post) =>
      post.id === id ? { ...post, likes: post.likes + 1 } : post,
    ));
  };

  const toggleSavedShort = (id: string) => {
    setPosts((prev) => prev.map((post) =>
      post.id === id ? { ...post, saved: !post.saved } : post,
    ));
  };

  const addShort = () => {
    if (!newShortTitle.trim() || !newShortTag.trim()) return;
    if (newShortRating === '18+' && ageMode !== '18+') return;
    const text = `${newShortTitle.trim()} · ${newShortTag.trim()}`;
    let effectiveRating = newShortRating;
    if (containsProtected(text)) {
      if (ageMode !== '18+') return;
      effectiveRating = '18+';
    }
    setPosts((prev) => [{
      id: `short-${Date.now()}`,
      type: 'Clip',
      text,
      handle: '@mein_creator',
      creator: 'Eigener Creator',
      verified: false,
      rating: effectiveRating,
      status: 'Zur Prüfung',
      likes: 0,
      comments: [],
      history: ['Zur Prüfung eingereicht'],
      soundName: newShortSound.trim() || 'Originalton',
    }, ...prev]);
    setNewShortTitle('');
    setNewShortTag('');
    setNewShortSound('');
    setNewShortRating('Alle');
    logChange('Neuer Short zur Prüfung eingereicht');
  };

  const reportPost = (id: string) => {
    setPosts((prev) => prev.map((post) =>
      post.id === id ? { ...post, reported: true } : post,
    ));
  };

  const hidePost = (id: string, handle: string) => {
    setHiddenPostIds((prev) => prev.includes(id) ? prev : [...prev, id]);
    setBlockedHandles((prev) => prev.includes(handle) ? prev : [...prev, handle]);
  };

  const addComment = (id: string) => {
    if (!pulseComment.trim() || containsProtected(pulseComment)) return;
    setPosts((prev) => prev.map((post) => post.id === id
      ? { ...post, comments: [...post.comments, pulseComment.trim()] }
      : post));
    setPulseComment('');
  };

  const exportData = () => {
    const storage = getWebStorage();
    const payload = storage?.getItem(STORAGE_KEY) ?? JSON.stringify({
      articles, posts, stories, ageMode, breakingApproved, crisisChecklist: checklist,
      history: cmsHistory, blockedHandles, hiddenPostIds, followed, shortsFeed, shortsIndex,
      dailyLimitMinutes, dailyUsageSeconds, dailyUsageDate,
    });
    if (Platform.OS === 'web') {
      try {
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `aspekt-dsgvo-export-${dailyUsageDate}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setShareNote('DSGVO-Daten als JSON heruntergeladen');
        setTimeout(() => setShareNote(''), 1800);
      } catch {}
    }
  };

  const resetData = () => {
    try {
      getWebStorage()?.removeItem(STORAGE_KEY);
    } catch {}
    setArticles(INITIAL_ARTICLES);
    setPosts(INITIAL_POSTS);
    setStories(INITIAL_STORIES);
    setAgeMode('U18');
    setBreakingApproved(false);
    setChecklist({});
    setBlockedHandles([]);
    setHiddenPostIds([]);
    setCmsHistory([]);
    setFollowed([]);
    setShortsFeed('Für Dich');
    setShortsIndex(0);
    setShortsPlaying(true);
    setShortsMuted(false);
    setShortCommentsOpen(false);
    setNewShortTitle('');
    setNewShortTag('');
    setNewShortSound('');
    setNewShortRating('Alle');
    setDailyLimitMinutes(30);
    setDailyUsageSeconds(0);
    setDailyUsageDate(new Date().toISOString().slice(0, 10));
    setAgeNotice('');
    setBirthYear('');
  };

  const openTel = (number: string) => void Linking.openURL(`tel:${number}`);

  const visibleStories = ageMode === '18+' ? stories : stories.filter((story) => story.rating === 'Alle');

  const createStory = () => {
    if (!storyText.trim() || (storyRating === '18+' && ageMode !== '18+')) return;
    setStories((prev) => [...prev, {
      id: `story-${Date.now()}`, creator: 'Eigener Creator', handle: '@mein_creator',
      text: storyText.trim(), rating: storyRating, seen: false,
    }]);
    setStoryText('');
  };

  const breaking = breakingApproved
    ? articles.find((article) => article.breaking && article.published)
    : undefined;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.shell}>
        <View style={styles.topbar}>
          <TouchableOpacity onPress={() => setTab('News')}>
            <Text style={styles.brand}>ASPEKT<Text style={styles.brandAccent}>.TV</Text></Text>
          </TouchableOpacity>
          <View style={styles.topActions}>
            <View style={[styles.ageBadge, ageMode === '18+' ? styles.ageAdult : styles.ageMinor]}>
              <Text style={styles.badgeText}>{ageMode === '18+' ? '18+' : 'U18'}</Text>
            </View>
            <TouchableOpacity style={styles.safetyHeader} onPress={() => setTab('Hilfe & Schutz')}>
              <Text style={styles.safetyHeaderText}>Hilfe & Schutz</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.loginButton} onPress={() => setLoginModal(true)}>
              <Text style={styles.loginText}>{loggedIn ? role : 'Redaktion'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {breaking && (
          <View style={styles.breaking}>
            <Text style={styles.breakingLabel}>EILMELDUNG</Text>
            <Text style={styles.breakingText}>{breaking.title}</Text>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nav}>
          {NAV.map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.navItem, selectedCategory === item && styles.navItemActive]}
              onPress={() => { setSelectedCategory(item); setTab('News'); }}
            >
              <Text style={styles.navText}>{item}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.navItem} onPress={() => setTab('Live TV')}>
            <Text style={styles.liveNav}>● LIVE-TV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pulseNav} onPress={() => setTab('ASPEKT PULSE')}>
            <Text style={styles.pulseNavText}>ASPEKT PULSE</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.areaOrientation}>
          <View style={styles.areaLabel}>
            <View style={styles.areaDot} />
            <Text style={styles.areaLabelText}>Medienkanal ASPEKT.TV</Text>
            <Text style={styles.areaScopeText}>News · Live TV</Text>
          </View>
          <View style={styles.areaLabel}>
            <View style={[styles.areaDot, styles.areaDotSocial]} />
            <Text style={styles.areaLabelText}>Social & Verwaltung</Text>
            <Text style={styles.areaScopeText}>PULSE · Shorts · Team · Hilfe & Schutz</Text>
          </View>
        </View>

        <View style={styles.tabRow}>
          {(['News', 'Live TV', 'ASPEKT PULSE', 'Shorts', 'Team', 'Redaktion', 'Hilfe & Schutz'] as const).map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.tabButton, tab === item && styles.tabButtonActive]}
              onPress={() => setTab(item)}
            >
              <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {tab === 'News' && (
            <>
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.search}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Suche in allen Meldungen..."
                  placeholderTextColor="#737373"
                />
                <TouchableOpacity
                  style={styles.ageSwitch}
                  onPress={() => {
                    if (ageMode === '18+') {
                      setAgeMode('U18');
                      setAgeNotice('18+-Modus deaktiviert. Jugendschutz aktiv.');
                    } else {
                      setTab('Hilfe & Schutz');
                    }
                  }}
                >
                  <Text style={styles.ageSwitchText}>{ageMode === 'U18' ? '18+ bestätigen' : '18+ aktiv'}</Text>
                </TouchableOpacity>
              </View>

              {hero && (
                <TouchableOpacity style={styles.hero} onPress={() => setSelectedArticle(hero)}>
                  <View style={styles.heroVisual}>
                    <Text style={styles.heroVisualText}>ASPEKT</Text>
                    <Text style={styles.heroVisualSub}>LIVE / ANALYSE / DEBATTE</Text>
                  </View>
                  <View style={styles.heroCopy}>
                    <Text style={styles.kicker}>{hero.kicker}</Text>
                    <Text style={styles.heroTitle}>{hero.title}</Text>
                    <Text style={styles.heroSummary}>{hero.summary}</Text>
                    <Text style={styles.byline}>Von {hero.author} · {hero.date}</Text>
                    {hero.verified && <Text style={styles.verified}>VERIFIZIERTE QUELLE</Text>}
                  </View>
                </TouchableOpacity>
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Aktuelle Nachrichten</Text>
                <TouchableOpacity onPress={() => setSelectedCategory('Alle')}>
                  <Text style={styles.sectionLink}>Alle Themen</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.newsGrid}>
                {visibleArticles.slice(hero ? 1 : 0).map((article) => (
                  <TouchableOpacity key={article.id} style={styles.newsCard} onPress={() => setSelectedArticle(article)}>
                    <View style={styles.cardVisual}>
                      <Text style={styles.cardVisualText}>{article.kicker}</Text>
                    </View>
                    <View style={styles.cardCopy}>
                      <Text style={styles.kicker}>{article.kicker}</Text>
                      <Text style={styles.cardTitle}>{article.title}</Text>
                      <Text style={styles.cardSummary}>{article.summary}</Text>
                      <Text style={styles.byline}>{article.author} · {article.date}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.debateBlock}>
                <Text style={styles.kickerLight}>DEBATTE.AKTUELL</Text>
                <Text style={styles.debateTitle}>Live-Diskussion: Wohin führt die Energiewende?</Text>
                <Text style={styles.debateMeta}>Heute · 18:00 Uhr · Moderiert von Julia Kern</Text>
              </View>
            </>
          )}

          {tab === 'Live TV' && (
            <View style={styles.liveLayout}>
              <View style={styles.playerPlaceholder}>
                <View style={styles.livePill}><Text style={styles.badgeText}>● LIVE</Text></View>
                <Text style={styles.playerTitle}>ASPEKT LIVE</Text>
                <Text style={styles.playerText}>Aktuelle Lage & Debatte</Text>
              </View>
              <View style={styles.liveAside}>
                <Text style={styles.sectionTitle}>Jetzt auf Sendung</Text>
                {['debatte.aktuell', 'Die Lage', 'Kurz erklärt'].map((item, index) => (
                  <TouchableOpacity key={item} style={[styles.programRow, index === 0 && styles.programActive]}>
                    <Text style={styles.programTime}>{index === 0 ? '18:00' : index === 1 ? '19:00' : '20:00'}</Text>
                    <Text style={styles.programTitle}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {tab === 'ASPEKT PULSE' && (
            <>
              {ageMode === 'U18' && (
                <View style={styles.safetyNotice}>
                  <Text style={styles.safetyTitle}>Jugendschutz aktiv</Text>
                  <Text style={styles.bodyText}>18+-Beiträge und geschützte Inhalte werden ausgeblendet.</Text>
                </View>
              )}
              <View style={styles.chatButtonRow}>
                <TouchableOpacity
                  style={styles.chatButton}
                  onPress={() => setSocialChatVisible(true)}
                >
                  <Text style={styles.chatButtonText}>Direktnachrichten</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.storyRail}>
                {visibleStories.map((story) => (
                  <TouchableOpacity key={story.id} style={styles.story} onPress={() => setStoryIndex(visibleStories.indexOf(story))}>
                    <View style={[styles.storyRing, story.seen && styles.storySeen]}>
                      <Text style={styles.storyInitial}>{story.creator.charAt(0)}</Text>
                    </View>
                    <Text style={styles.storyName}>{story.creator}</Text>
                    <Text style={styles.storyOrigin}>
                      {story.creator === 'ASPEKT Redaktion' || story.creator === 'Live Studio'
                        ? 'ASPEKT · Verifiziert'
                        : 'Creator / Community'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {storyIndex !== null && visibleStories[storyIndex] && (
                <Modal transparent animationType="fade" visible onRequestClose={() => setStoryIndex(null)}>
                  <View style={styles.modalBackdrop}>
                    <View style={styles.storyModal}>
                      <View style={styles.progress}><View style={[styles.progressFill, { width: `${((storyIndex + 1) / visibleStories.length) * 100}%` }]} /></View>
                      <Text style={styles.cardTitle}>{visibleStories[storyIndex].creator}</Text>
                      <View style={styles.storyCard}><Text style={styles.storyText}>{visibleStories[storyIndex].text}</Text></View>
                      <View style={styles.modalActions}>
                        <TouchableOpacity onPress={() => setStoryIndex((storyIndex - 1 + visibleStories.length) % visibleStories.length)}><Text style={styles.modalAction}>Zurück</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => setStoryIndex(null)}><Text style={styles.modalAction}>Schließen</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => setStoryIndex((storyIndex + 1) % visibleStories.length)}><Text style={styles.modalAction}>Weiter</Text></TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </Modal>
              )}

              <View style={styles.composer}>
                <Text style={styles.sectionTitle}>Neuer PULSE-Beitrag</Text>
                <TextInput style={styles.composerInput} value={postText} onChangeText={setPostText} placeholder="Perspektive teilen..." placeholderTextColor="#737373" multiline />
                <View style={styles.ratingRow}>
                  {(['Alle', '18+'] as const).map((rating) => (
                    <TouchableOpacity
                      key={rating}
                      style={[styles.ratingButton, postRating === rating && styles.ratingActive]}
                      onPress={() => rating === 'Alle' || ageMode === '18+' ? setPostRating(rating) : null}
                    >
                      <Text style={styles.ratingText}>{rating}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={styles.primaryButton} onPress={addSocialPost}>
                  <Text style={styles.primaryButtonText}>Zur Prüfung einreichen</Text>
                </TouchableOpacity>
              </View>

              <ConsciousFeedBar onPrivacyPress={() => setTab('Team')} />

              {visiblePosts.map((post) => (
                <View key={post.id} style={styles.pulseCard}>
                  <View style={styles.creatorRow}>
                    <View style={styles.creatorAvatar}><Text style={styles.creatorInitial}>{post.creator.charAt(0)}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.creatorName}>{post.creator} {post.verified ? '✓' : ''}</Text>
                      <Text style={styles.creatorHandle}>{post.handle}</Text>
                      <View style={[styles.originBadge, post.verified && styles.originOfficial]}>
                        <Text style={styles.originText}>
                          {post.verified ? 'ASPEKT Redaktion · Verifiziert' : 'Creator / Community'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity style={[styles.followButton, followed.includes(post.handle) && styles.followed]} onPress={() => setFollowed((prev) => prev.includes(post.handle) ? prev.filter((h) => h !== post.handle) : [...prev, post.handle])}>
                      <Text style={styles.followText}>{followed.includes(post.handle) ? 'Gefolgt' : 'Folgen'}</Text>
                    </TouchableOpacity>
                  </View>
                  {post.rating === '18+' && <Text style={styles.adultBadge}>18+</Text>}
                  <View style={styles.hashtagRow}>
                    <Text style={styles.hashtagChip}>#Community</Text>
                    <Text style={styles.hashtagChip}>#ASPEKT PULSE</Text>
                  </View>
                  {post.type !== 'Text' && (
                    <View style={styles.socialMediaPlaceholder}>
                      <Text style={styles.socialMediaText}>
                        {post.type.toUpperCase()} / Vorschau
                      </Text>
                    </View>
                  )}
                  <Text style={styles.pulseText}>{post.text}</Text>
                  <View style={styles.socialActions}>
                    <TouchableOpacity onPress={() => setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, likes: p.likes + 1 } : p))}>
                      <Text style={styles.actionText}>♡ {post.likes}</Text>
                    </TouchableOpacity>
                    <Text style={styles.actionText}>○ {post.comments.length}</Text>
                    <TouchableOpacity onPress={sharePost}><Text style={styles.actionText}>↗ Teilen</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => toggleSavedShort(post.id)}>
                      <Text style={styles.actionText}>{post.saved ? '★ Gemerkt' : '☆ Merken'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => reportPost(post.id)}>
                      <Text style={styles.actionText}>⚑ Melden</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => hidePost(post.id, post.handle)}>
                      <Text style={styles.actionText}>Ausblenden / Blockieren</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.commentRow}>
                    <TextInput style={styles.commentInput} value={pulseComment} onChangeText={setPulseComment} placeholder="Kommentar..." placeholderTextColor="#737373" />
                    <TouchableOpacity onPress={() => addComment(post.id)}><Text style={styles.commentSend}>Senden</Text></TouchableOpacity>
                  </View>
                </View>
              ))}
              {shareNote !== '' && <Text style={styles.shareToast}>{shareNote}</Text>}

              <View style={styles.channelCard}>
                <Text style={styles.sectionTitle}>Direkt-Kanäle</Text>
                {['Eilmeldungs-Updates', 'Community-Debatte', 'Creator-Updates'].map((channel) => (
                  <TouchableOpacity key={channel} style={styles.channelRow}>
                    <View style={styles.channelDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.channelTitle}>{channel}</Text>
                      <Text style={styles.channelMeta}>ASPEKT Kanal · Neue Nachrichten</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {tab === 'Shorts' && (
            <>
              <View style={styles.shortFeedToggle}>
                {(['Für Dich', 'Gefolgt'] as const).map((feed) => (
                  <TouchableOpacity
                    key={feed}
                    style={[styles.shortFeedButton, shortsFeed === feed && styles.shortFeedActive]}
                    onPress={() => {
                      setShortsFeed(feed);
                      setShortsIndex(0);
                    }}
                  >
                    <Text style={styles.shortFeedText}>{feed}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.chatButtonRow}>
                <TouchableOpacity
                  style={styles.chatButton}
                  onPress={() => setSocialChatVisible(true)}
                >
                  <Text style={styles.chatButtonText}>Direktnachrichten</Text>
                </TouchableOpacity>
              </View>

              {shortsFeed === 'Gefolgt' && followed.length === 0 && (
                <View style={styles.safetyNotice}>
                  <Text style={styles.safetyTitle}>Noch niemandem gefolgt</Text>
                  <Text style={styles.bodyText}>Folge Creatorn in PULSE oder Shorts, um ihren Feed hier zu sehen.</Text>
                </View>
              )}

              {activeShort ? (
                <View style={styles.shortPlayerCard}>
                  <View style={styles.shortPlayer}>
                    <View style={styles.shortPlayerTop}>
                      <View style={[styles.originBadge, activeShort.verified && styles.originOfficial]}>
                        <Text style={styles.originText}>
                          {activeShort.verified ? 'ASPEKT Redaktion · Verifiziert' : 'Creator / Community'}
                        </Text>
                      </View>
                      {activeShort.rating === '18+' && <Text style={styles.adultBadge}>18+</Text>}
                    </View>
                    <Text style={styles.shortPlayerPlaceholder}>SHORTS / 9:16</Text>
                    <View style={styles.shortCaptionOverlay}>
                      <View style={styles.shortCreatorRow}>
                        <Text style={styles.shortHandle}>{activeShort.handle}</Text>
                        <TouchableOpacity
                          style={[styles.followButton, followed.includes(activeShort.handle) && styles.followed]}
                          onPress={() => setFollowed((prev) =>
                            prev.includes(activeShort.handle)
                              ? prev.filter((handle) => handle !== activeShort.handle)
                              : [...prev, activeShort.handle],
                          )}
                        >
                          <Text style={styles.followText}>
                            {followed.includes(activeShort.handle) ? 'Gefolgt' : 'Folgen'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.shortCaption}>{activeShort.text}</Text>
                    </View>
                    <Text style={styles.soundLine}>
                      ♪ {activeShort.soundName || 'Originalton'} - {activeShort.handle}
                    </Text>
                    <View style={styles.shortPlayerControls}>
                      <TouchableOpacity style={styles.shortControl} onPress={() => setShortsPlaying((prev) => !prev)}>
                        <Text style={styles.shortControlText}>{shortsPlaying ? 'Pause' : 'Play'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.shortControl} onPress={() => setShortsMuted((prev) => !prev)}>
                        <Text style={styles.shortControlText}>{shortsMuted ? 'Ton an' : 'Stumm'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.actionRail}>
                    <TouchableOpacity style={styles.railButton} onPress={() => likeShort(activeShort.id)}>
                      <Text style={styles.railIcon}>♡</Text>
                      <Text style={styles.railCount}>{activeShort.likes}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.railButton} onPress={() => setShortCommentsOpen((prev) => !prev)}>
                      <Text style={styles.railIcon}>●</Text>
                      <Text style={styles.railCount}>{activeShort.comments.length}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.railButton} onPress={() => toggleSavedShort(activeShort.id)}>
                      <Text style={styles.railIcon}>{activeShort.saved ? '★' : '☆'}</Text>
                      <Text style={styles.railCount}>Merken</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.railButton} onPress={sharePost}>
                      <Text style={styles.railIcon}>↗</Text>
                      <Text style={styles.railCount}>Teilen</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.railButton} onPress={() => reportPost(activeShort.id)}>
                      <Text style={styles.railCount}>Melden</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.railButton} onPress={() => hidePost(activeShort.id, activeShort.handle)}>
                      <Text style={styles.railCount}>Blockieren</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.helpSection}>
                  <Text style={styles.sectionTitle}>Keine Clips verfügbar</Text>
                  <Text style={styles.bodyText}>Wechsle zu „Für Dich“ oder folge weiteren Creatorn.</Text>
                </View>
              )}

              {activeShort && (
                <View style={styles.shortNavRow}>
                  <TouchableOpacity style={styles.shortNavButton} onPress={() => changeShort(-1)}>
                    <Text style={styles.shortNavButtonText}>‹  Vorheriger</Text>
                  </TouchableOpacity>
                  <View style={styles.shortCounterPill}>
                    <Text style={styles.shortCounterText}>{safeShortsIndex + 1} / {shortsClips.length}</Text>
                  </View>
                  <TouchableOpacity style={styles.shortNavButtonPrimary} onPress={() => changeShort(1)}>
                    <Text style={styles.shortNavButtonText}>Nächster  ›</Text>
                  </TouchableOpacity>
                </View>
              )}

              {activeShort && shortCommentsOpen && (
                <View style={styles.helpSection}>
                  <Text style={styles.sectionTitle}>Kommentare</Text>
                  {activeShort.comments.map((comment, index) => (
                    <Text key={`${activeShort.id}-${index}`} style={styles.commentItem}>{comment}</Text>
                  ))}
                  <View style={styles.commentRow}>
                    <TextInput
                      style={styles.commentInput}
                      value={pulseComment}
                      onChangeText={setPulseComment}
                      placeholder="Kommentar..."
                      placeholderTextColor="#737373"
                    />
                    <TouchableOpacity onPress={() => addComment(activeShort.id)}>
                      <Text style={styles.commentSend}>Senden</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={styles.composer}>
                <Text style={styles.sectionTitle}>Neuen Short erstellen</Text>
                <TextInput style={styles.composerInput} value={newShortTitle} onChangeText={setNewShortTitle} placeholder="Titel" placeholderTextColor="#737373" />
                <TextInput style={styles.composerInput} value={newShortTag} onChangeText={setNewShortTag} placeholder="Tag / Kategorie" placeholderTextColor="#737373" />
                <TextInput style={styles.composerInput} value={newShortSound} onChangeText={setNewShortSound} placeholder="Sound-Name" placeholderTextColor="#737373" />
                <View style={styles.ratingRow}>
                  {(['Alle', '18+'] as const).map((rating) => (
                    <TouchableOpacity
                      key={rating}
                      style={[styles.ratingButton, newShortRating === rating && styles.ratingActive]}
                      onPress={() => rating === 'Alle' || ageMode === '18+' ? setNewShortRating(rating) : null}
                    >
                      <Text style={styles.ratingText}>{rating}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={styles.primaryButton} onPress={addShort}>
                  <Text style={styles.primaryButtonText}>Short zur Prüfung einreichen</Text>
                </TouchableOpacity>
              </View>
              {shareNote !== '' && <Text style={styles.shareToast}>{shareNote}</Text>}
            </>
          )}

          {tab === 'Team' && (
            <View style={styles.cmsMain}>
              <View style={styles.helpSection}>
                <Text style={styles.sectionTitle}>Team & Datenverwaltung</Text>
                <View style={styles.teamActions}>
                  <TouchableOpacity style={styles.primaryButton} onPress={exportData}>
                    <Text style={styles.primaryButtonText}>Daten als JSON kopieren/exportieren</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.maskButton} onPress={resetData}>
                    <Text style={styles.maskButtonText}>Demo-Daten zurücksetzen</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.helpSection}>
                <Text style={styles.sectionTitle}>Gemeldete Beiträge & Clips</Text>
                {posts.filter((post) => post.reported).map((post) => (
                  <View key={post.id} style={styles.cmsRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cmsArticleTitle}>{post.text}</Text>
                      <Text style={styles.bodyText}>{post.creator} · {post.type}</Text>
                    </View>
                    {['Administrator', 'Chefredaktion', 'Ressortleiter'].includes(role) && (
                      <View style={styles.cmsActions}>
                        <TouchableOpacity onPress={() => setPosts((prev) => prev.map((item) => item.id === post.id ? { ...item, reported: false } : item))}>
                          <Text style={styles.cmsApprove}>Freigeben</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setPosts((prev) => prev.filter((item) => item.id !== post.id))}>
                          <Text style={styles.cmsReject}>Löschen</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
                {!posts.some((post) => post.reported) && (
                  <Text style={styles.bodyText}>Derzeit keine Meldungen.</Text>
                )}
              </View>
            </View>
          )}

          {tab === 'Redaktion' && (
            !loggedIn ? (
              <View style={styles.cmsLocked}>
                <Text style={styles.sectionTitle}>Redaktion anmelden</Text>
                <Text style={styles.bodyText}>Wählen Sie eine Rolle für den Investor-/Demo-Zugriff.</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={() => setLoginModal(true)}>
                  <Text style={styles.primaryButtonText}>Zum Rollen-Login</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.cmsHeader}>
                  <View>
                    <Text style={styles.kicker}>REDaktionssystem</Text>
                    <Text style={styles.cmsTitle}>Dashboard · {role}</Text>
                  </View>
                  <TouchableOpacity style={styles.primaryButton} onPress={() => setEditor({
                    id: `a-${Date.now()}`, title: '', kicker: 'POLITIK', summary: '', body: '',
                    category: 'Politik', author: 'Eigener Name', status: 'Entwurf', published: false,
                    verified: false, date: TODAY, history: ['Entwurf erstellt'], submittedBy: role,
                  })}>
                    <Text style={styles.primaryButtonText}>Neuer Beitrag</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusFilters}>
                  {(['Alle', 'Entwurf', 'Zur Prüfung', 'Korrektur nötig', 'Freigegeben'] as const).map((status) => (
                    <TouchableOpacity key={status} style={[styles.filterButton, cmsFilter === status && styles.filterActive]} onPress={() => setCmsFilter(status)}>
                      <Text style={styles.filterText}>{status}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.cmsGrid}>
                  <View style={styles.cmsMain}>
                    {articles.filter((article) => cmsFilter === 'Alle' || article.status === cmsFilter).map((article) => (
                      <View key={article.id} style={styles.cmsRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cmsArticleTitle}>{article.title || 'Unbenannter Entwurf'}</Text>
                          <Text style={styles.bodyText}>{article.category} · {article.author}</Text>
                          <Text style={[styles.statusText, article.status === 'Zur Prüfung' && styles.statusReview]}>{article.status}</Text>
                        </View>
                        <View style={styles.cmsActions}>
                          <TouchableOpacity onPress={() => setEditor(article)}><Text style={styles.cmsAction}>Bearbeiten</Text></TouchableOpacity>
                          {(role === 'Administrator' || role === 'Chefredaktion' || role === 'Ressortleiter') && (
                            <>
                              <TouchableOpacity onPress={() => submitArticle(article)}><Text style={styles.cmsAction}>Einreichen</Text></TouchableOpacity>
                              <TouchableOpacity onPress={() => approveArticle(article)}><Text style={styles.cmsApprove}>Freigeben</Text></TouchableOpacity>
                              <TouchableOpacity onPress={() => rejectArticle(article)}><Text style={styles.cmsReject}>Zurückweisen</Text></TouchableOpacity>
                            </>
                          )}
                        </View>
                      </View>
                    ))}

                    <Text style={styles.sectionTitle}>Social-Medien-Warteschlange</Text>
                    {posts.filter((post) => post.status === 'Zur Prüfung').map((post) => (
                      <View key={post.id} style={styles.cmsRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cmsArticleTitle}>{post.text}</Text>
                          <Text style={styles.bodyText}>{post.creator} · {post.rating}</Text>
                        </View>
                        <View style={styles.cmsActions}>
                          <TouchableOpacity onPress={() => moderatePost(post.id, 'Freigegeben')}><Text style={styles.cmsApprove}>Freigeben</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => moderatePost(post.id, 'Abgelehnt')}><Text style={styles.cmsReject}>Ablehnen</Text></TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                  <View style={styles.cmsSidebar}>
                    <Text style={styles.sectionTitle}>Eilmeldung</Text>
                    <TouchableOpacity
                      style={[styles.primaryButton, breakingApproved && styles.primaryButtonActive]}
                      onPress={() => { setBreakingApproved((prev) => !prev); logChange(breakingApproved ? 'Eilmeldung deaktiviert' : 'Eilmeldung freigegeben'); }}
                    >
                      <Text style={styles.primaryButtonText}>{breakingApproved ? 'Eilmeldung live' : 'Gesondert freigeben'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.sectionTitle}>Änderungsprotokoll</Text>
                    {cmsHistory.slice(0, 8).map((item, index) => (
                      <Text key={`${item}-${index}`} style={styles.historyItem}>• {item}</Text>
                    ))}
                  </View>
                </View>
              </>
            )
          )}

          {tab === 'Hilfe & Schutz' && (
            <>
              <View style={styles.safetyHero}>
                <Text style={styles.kickerLight}>SAFETY & KRISEN-HUB</Text>
                <Text style={styles.helpTitle}>Ruhe bewahren. Hilfe finden.</Text>
                <TouchableOpacity style={styles.maskButton} onPress={() => setTab('News')}>
                  <Text style={styles.maskButtonText}>Schnell-Schutz: neutralen News-Tab öffnen</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.helpSection}>
                <Text style={styles.sectionTitle}>Jugendschutz & Altersfreigabe</Text>
                <View style={[styles.ageStatusRow, ageMode === '18+' ? styles.ageStatusAdult : styles.ageStatusMinor]}>
                  <Text style={styles.ageStatusText}>
                    Aktiver Modus: {ageMode === '18+' ? '18+' : 'U18'}
                  </Text>
                </View>
                <TextInput
                  style={styles.composerInput}
                  value={birthYear}
                  onChangeText={setBirthYear}
                  placeholder="Geburtsjahr (vierstellig)"
                  placeholderTextColor="#737373"
                  keyboardType="number-pad"
                  maxLength={4}
                />
                <View style={styles.teamActions}>
                  <TouchableOpacity style={styles.primaryButton} onPress={verifyAdult}>
                    <Text style={styles.primaryButtonText}>Altersfreigabe prüfen</Text>
                  </TouchableOpacity>
                  {ageMode === '18+' && (
                    <TouchableOpacity
                      style={styles.maskButton}
                      onPress={() => {
                        setAgeMode('U18');
                        setAgeNotice('18+-Modus deaktiviert. Jugendschutz aktiv.');
                      }}
                    >
                      <Text style={styles.maskButtonText}>18+ deaktivieren</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {ageNotice !== '' && <Text style={styles.bodyText}>{ageNotice}</Text>}
              </View>
              <View style={styles.helpSection}>
                <Text style={styles.sectionTitle}>Tageslimit</Text>
                <View style={styles.ratingRow}>
                  {([30, 60] as const).map((minutes) => (
                    <TouchableOpacity
                      key={minutes}
                      style={[styles.ratingButton, dailyLimitMinutes === minutes && styles.ratingActive]}
                      onPress={() => setDailyLimitMinutes(minutes)}
                    >
                      <Text style={styles.ratingText}>{minutes} Min.</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.bodyText}>
                  Heute genutzt: {Math.floor(dailyUsageSeconds / 60)}:{String(dailyUsageSeconds % 60).padStart(2, '0')} Min. von {dailyLimitMinutes} Min.
                </Text>
                {dailyUsageSeconds >= dailyLimitMinutes * 60 ? (
                  <Text style={styles.safetyTitle}>Tageslimit erreicht. Bitte die Nutzung heute beenden.</Text>
                ) : (
                  <Text style={styles.bodyText}>
                    Verbleibend: {Math.max(0, dailyLimitMinutes - Math.floor(dailyUsageSeconds / 60))} Minuten
                  </Text>
                )}
              </View>
              {[
                ['Akut-Notrufe', [['Euronotruf', '112'], ['Polizei', '133'], ['Rettung', '144'], ['Feuerwehr', '122']]],
                ['Kinder- & Jugendschutz', [['Rat auf Draht', '147']]],
                ['Frauen- & Gewaltschutz', [['Frauenhelpline gegen Gewalt', '0800222555'], ['Opfer-Notruf', '0800112112']]],
                ['Männer- & Krisenberatung', [['Männernotruf', '0800246247'], ['TelefonSeelsorge', '142']]],
              ].map(([title, numbers]) => (
                <View key={String(title)} style={styles.helpSection}>
                  <Text style={styles.sectionTitle}>{String(title)}</Text>
                  {(numbers as string[][]).map(([name, number]) => (
                    <TouchableOpacity key={number} style={styles.helpRow} onPress={() => openTel(number)}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.helpName}>{name}</Text>
                        <Text style={styles.helpNumber}>{number}</Text>
                      </View>
                      <Text style={styles.callText}>Anrufen</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
              <View style={styles.helpSection}>
                <Text style={styles.sectionTitle}>Blackout- & Krisen-Checkliste</Text>
                {CRISIS_ITEMS.map((item) => (
                  <TouchableOpacity key={item} style={styles.checkRow} onPress={() => setChecklist((prev) => ({ ...prev, [item]: !prev[item] }))}>
                    <View style={[styles.checkbox, checklist[item] && styles.checkboxActive]}>
                      {checklist[item] && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.checkText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.helpSection}>
                <Text style={styles.sectionTitle}>Impressum, Datenschutz & Transparenz</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={exportData}>
                  <Text style={styles.primaryButtonText}>DSGVO & Datenexport herunterladen</Text>
                </TouchableOpacity>
                {shareNote !== '' && <Text style={styles.bodyText}>{shareNote}</Text>}
                <Text style={styles.bodyText}>
                  ASPEKT.TV ist ein Medien- und Demo-Projekt. Verantwortlich für redaktionelle Inhalte
                  ist das jeweilige Medienhaus-Team. App-Daten werden lokal im Browser per localStorage
                  gespeichert; keine Server-Übermittlung erfolgt in diesem Prototyp.
                </Text>
                <Text style={styles.bodyText}>
                  Der Jugendschutz arbeitet mit U18/18+ Kennzeichnung und Altersprüfung. 18+-Inhalte
                  werden im U18-Modus ausgeblendet. Gemeldete oder blockierte Inhalte können zusätzlich
                  lokal ausgeblendet oder durch autorisierte Rollen moderiert werden.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </View>

      <SocialChatModal
        visible={socialChatVisible}
        onClose={() => setSocialChatVisible(false)}
      />

      {selectedArticle && (
        <Modal transparent animationType="slide" visible onRequestClose={() => setSelectedArticle(null)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.articleModal}>
              <TouchableOpacity onPress={() => setSelectedArticle(null)}><Text style={styles.modalClose}>Schließen ×</Text></TouchableOpacity>
              <Text style={styles.kicker}>{selectedArticle.kicker}</Text>
              <Text style={styles.articleModalTitle}>{selectedArticle.title}</Text>
              <Text style={styles.articleModalSummary}>{selectedArticle.summary}</Text>
              {selectedArticle.verified && <Text style={styles.verified}>VERIFIZIERTE QUELLE</Text>}
              <Text style={styles.articleBody}>{selectedArticle.body}</Text>
              <Text style={styles.byline}>Von {selectedArticle.author} · {selectedArticle.date}</Text>
            </View>
          </View>
        </Modal>
      )}

      {editor && (
        <Modal transparent animationType="slide" visible onRequestClose={() => setEditor(null)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.articleModal}>
              <Text style={styles.sectionTitle}>Artikel-Editor</Text>
              <TextInput style={styles.editorInput} value={editor.title} onChangeText={(title) => setEditor({ ...editor, title })} placeholder="Überschrift" placeholderTextColor="#737373" />
              <TextInput style={[styles.editorInput, styles.editorSummary]} value={editor.summary} onChangeText={(summary) => setEditor({ ...editor, summary })} placeholder="Teaser" placeholderTextColor="#737373" multiline />
              <TextInput style={[styles.editorInput, styles.editorBody]} value={editor.body} onChangeText={(body) => setEditor({ ...editor, body })} placeholder="Artikeltext" placeholderTextColor="#737373" multiline />
              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setEditor(null)}><Text style={styles.modalAction}>Schließen</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => {
                  setArticles((prev) => {
                    const exists = prev.some((article) => article.id === editor.id);
                    return exists ? prev.map((article) => article.id === editor.id ? editor : article) : [editor, ...prev];
                  });
                  setEditor(null);
                  logChange(`${editor.title || 'Neuer Entwurf'} gespeichert`);
                }}><Text style={styles.modalAction}>Speichern</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      <Modal transparent animationType="fade" visible={loginModal} onRequestClose={() => setLoginModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.loginModal}>
            <Text style={styles.sectionTitle}>Redaktions-Login</Text>
            <Text style={styles.bodyText}>Schnell-Login für Investoren und Sponsoren.</Text>
            <View style={styles.roleGrid}>
              {ROLE_OPTIONS.map((option) => (
                <TouchableOpacity key={option} style={[styles.roleOption, role === option && styles.roleOptionActive]} onPress={() => setRole(option)}>
                  <Text style={styles.roleOptionText}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={() => { setLoggedIn(true); setLoginModal(false); setTab('Redaktion'); }}>
              <Text style={styles.primaryButtonText}>Als {role} anmelden</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setLoginModal(false)}><Text style={styles.modalAction}>Abbrechen</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B' },
  shell: { width: '100%', maxWidth: 1080, alignSelf: 'center', flex: 1 },
  topbar: {
    backgroundColor: '#121215', minHeight: 72, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: '#27272A',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  brand: { color: '#FFF', fontSize: 25, fontWeight: '900', letterSpacing: -1 },
  brandAccent: { color: '#E11D48' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  ageBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  ageMinor: { backgroundColor: '#2563EB' },
  ageAdult: { backgroundColor: '#991B1B' },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  safetyHeader: { backgroundColor: '#27272A', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 7 },
  safetyHeaderText: { color: '#E4E4E7', fontSize: 11, fontWeight: '800' },
  loginButton: { backgroundColor: '#E11D48', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
  loginText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  breaking: {
    backgroundColor: '#991B1B', minHeight: 38, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  breakingLabel: { color: '#FFF', backgroundColor: '#7F1D1D', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4, fontSize: 10, fontWeight: '900' },
  breakingText: { color: '#FFF', flex: 1, fontSize: 13, fontWeight: '700' },
  nav: { backgroundColor: '#121215', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8 },
  navItem: { paddingHorizontal: 9, paddingVertical: 8, borderRadius: 6 },
  navItemActive: { backgroundColor: '#27272A' },
  navText: { color: '#E4E4E7', fontSize: 12, fontWeight: '700' },
  liveNav: { color: '#FB7185', fontSize: 12, fontWeight: '900' },
  pulseNav: { backgroundColor: '#E11D48', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginLeft: 4 },
  pulseNavText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  areaOrientation: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  areaLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: '#121215',
    borderColor: '#27272A',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  areaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E11D48',
  },
  areaDotSocial: { backgroundColor: '#FB7185' },
  areaLabelText: { color: '#E4E4E7', fontSize: 10, fontWeight: '900' },
  areaScopeText: { color: '#71717A', fontSize: 10, fontWeight: '700' },
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#09090B' },
  tabButton: { backgroundColor: '#18181B', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  tabButtonActive: { backgroundColor: '#E11D48' },
  tabText: { color: '#A1A1AA', fontSize: 12, fontWeight: '800' },
  tabTextActive: { color: '#FFF' },
  chatButtonRow: { flexDirection: 'row', justifyContent: 'flex-end', alignSelf: 'stretch', marginTop: 2, marginBottom: 2 },
  chatButton: { backgroundColor: '#27272A', borderColor: '#3F3F46', borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chatButtonText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  content: { gap: 14, paddingHorizontal: 16, paddingBottom: 28 },
  searchRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  search: { flex: 1, minWidth: 220, backgroundColor: '#121215', borderColor: '#27272A', borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, color: '#FFF' },
  ageSwitch: { backgroundColor: '#2563EB', borderRadius: 999, paddingHorizontal: 11, justifyContent: 'center' },
  ageSwitchText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  hero: { backgroundColor: '#121215', borderColor: '#27272A', borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  heroVisual: { height: 280, backgroundColor: '#18181B', alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#27272A' },
  heroVisualText: { color: '#FFF', fontSize: 55, fontWeight: '900', letterSpacing: 5 },
  heroVisualSub: { color: '#FB7185', fontSize: 11, fontWeight: '900', letterSpacing: 3, marginTop: 8 },
  heroCopy: { padding: 18, gap: 7 },
  kicker: { color: '#E11D48', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  kickerLight: { color: '#FDA4AF', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  heroTitle: { color: '#FFF', fontSize: 30, lineHeight: 36, fontWeight: '900' },
  heroSummary: { color: '#D4D4D8', fontSize: 16, lineHeight: 23 },
  byline: { color: '#71717A', fontSize: 11, marginTop: 4 },
  verified: { alignSelf: 'flex-start', color: '#DCFCE7', backgroundColor: '#166534', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, fontSize: 9, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sectionTitle: { color: '#FFF', fontSize: 19, fontWeight: '900' },
  sectionLink: { color: '#FB7185', fontSize: 12, fontWeight: '800' },
  newsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  newsCard: { backgroundColor: '#121215', borderColor: '#27272A', borderWidth: 1, borderRadius: 10, overflow: 'hidden', width: '48%', minWidth: 260, flexGrow: 1 },
  cardVisual: { height: 140, backgroundColor: '#18181B', alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#27272A' },
  cardVisualText: { color: '#52525B', fontSize: 20, fontWeight: '900', letterSpacing: 3 },
  cardCopy: { padding: 12, gap: 6 },
  cardTitle: { color: '#FFF', fontSize: 16, fontWeight: '800', lineHeight: 21 },
  cardSummary: { color: '#D4D4D8', fontSize: 13, lineHeight: 19 },
  debateBlock: { backgroundColor: '#7F1D1D', borderRadius: 12, padding: 18, gap: 6 },
  debateTitle: { color: '#FFF', fontSize: 21, fontWeight: '900' },
  debateMeta: { color: '#FECACA', fontSize: 12 },
  liveLayout: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  playerPlaceholder: { flexGrow: 1, minWidth: 300, width: '68%', height: 390, backgroundColor: '#18181B', borderColor: '#27272A', borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  livePill: { backgroundColor: '#E11D48', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, marginBottom: 12 },
  playerTitle: { color: '#FFF', fontSize: 30, fontWeight: '900' },
  playerText: { color: '#A1A1AA', fontSize: 14, marginTop: 5 },
  liveAside: { flexGrow: 1, minWidth: 220, backgroundColor: '#121215', borderColor: '#27272A', borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  programRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 8, padding: 10 },
  programActive: { backgroundColor: '#27272A' },
  programTime: { color: '#FB7185', fontSize: 11, fontWeight: '900' },
  programTitle: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  safetyNotice: { backgroundColor: '#172554', borderColor: '#2563EB', borderWidth: 1, borderRadius: 10, padding: 12, gap: 4 },
  safetyTitle: { color: '#BFDBFE', fontSize: 14, fontWeight: '900' },
  bodyText: { color: '#A1A1AA', fontSize: 13, lineHeight: 19 },
  storyRail: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  story: { width: 86, alignItems: 'center', gap: 6 },
  storyRing: { width: 70, height: 70, borderRadius: 35, borderWidth: 3, borderColor: '#E11D48', alignItems: 'center', justifyContent: 'center', backgroundColor: '#18181B', shadowColor: '#E11D48', shadowOpacity: 0.28, shadowRadius: 8 },
  storySeen: { borderColor: '#52525B' },
  storyInitial: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  storyName: { color: '#F4F4F5', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  storyOrigin: { color: '#71717A', fontSize: 9, fontWeight: '700', textAlign: 'center' },
  progress: { height: 4, backgroundColor: '#27272A', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: '#E11D48' },
  storyModal: { width: '92%', maxWidth: 420, backgroundColor: '#121215', borderRadius: 14, borderWidth: 1, borderColor: '#27272A', padding: 14, gap: 12 },
  storyCard: { height: 300, backgroundColor: '#09090B', borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 20 },
  storyText: { color: '#FFF', fontSize: 24, lineHeight: 31, fontWeight: '800', textAlign: 'center' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  modalAction: { color: '#FB7185', fontSize: 12, fontWeight: '800', padding: 8 },
  composer: { backgroundColor: '#121215', borderColor: '#27272A', borderWidth: 1, borderRadius: 14, padding: 16, gap: 12, marginBottom: 4 },
  composerInput: { minHeight: 72, backgroundColor: '#09090B', borderColor: '#27272A', borderWidth: 1, borderRadius: 8, color: '#FFF', padding: 10, textAlignVertical: 'top' },
  ratingRow: { flexDirection: 'row', gap: 7 },
  ratingButton: { backgroundColor: '#27272A', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  ratingActive: { backgroundColor: '#E11D48' },
  ratingText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  primaryButton: { backgroundColor: '#E11D48', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  primaryButtonActive: { backgroundColor: '#166534' },
  primaryButtonText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
  pulseCard: { backgroundColor: '#121215', borderColor: '#27272A', borderWidth: 1, borderRadius: 16, padding: 16, gap: 14, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 14 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  creatorAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#27272A', borderColor: '#3F3F46', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  creatorInitial: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  creatorName: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  creatorHandle: { color: '#71717A', fontSize: 11 },
  originBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#27272A',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
    marginTop: 4,
  },
  originOfficial: { backgroundColor: '#166534' },
  originText: { color: '#DCFCE7', fontSize: 9, fontWeight: '900' },
  teamActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  followButton: { backgroundColor: '#27272A', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  followed: { backgroundColor: '#E11D48' },
  followText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  adultBadge: { alignSelf: 'flex-start', backgroundColor: '#991B1B', color: '#FFF', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: '900' },
  socialMediaPlaceholder: { height: 220, backgroundColor: '#09090B', borderColor: '#27272A', borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  socialMediaText: { color: '#52525B', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  pulseText: { color: '#F4F4F5', fontSize: 16, lineHeight: 24, letterSpacing: 0.1 },
  hashtagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  hashtagChip: { color: '#FDA4AF', backgroundColor: '#2A171C', borderColor: '#7F1D1D', borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '800' },
  socialActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#27272A' },
  actionText: { color: '#D4D4D8', fontSize: 12, fontWeight: '700' },
  commentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 },
  commentInput: { flex: 1, minHeight: 42, backgroundColor: '#09090B', borderColor: '#27272A', borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, color: '#FFF' },
  commentSend: { color: '#FB7185', fontWeight: '800', padding: 8 },
  shareToast: { alignSelf: 'center', backgroundColor: '#166534', color: '#DCFCE7', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, fontSize: 12, fontWeight: '800' },
  channelCard: { backgroundColor: '#121215', borderColor: '#27272A', borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#09090B', borderRadius: 8, padding: 10 },
  channelDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#E11D48' },
  channelTitle: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  channelMeta: { color: '#71717A', fontSize: 11, marginTop: 2 },
  cmsLocked: { backgroundColor: '#121215', borderColor: '#27272A', borderWidth: 1, borderRadius: 12, padding: 18, gap: 12 },
  cmsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  cmsTitle: { color: '#FFF', fontSize: 24, fontWeight: '900' },
  statusFilters: { flexDirection: 'row', gap: 7 },
  filterButton: { backgroundColor: '#27272A', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  filterActive: { backgroundColor: '#E11D48' },
  filterText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  cmsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cmsMain: { flexGrow: 1, flexBasis: 430, gap: 8 },
  cmsSidebar: { width: 260, flexGrow: 1, backgroundColor: '#121215', borderColor: '#27272A', borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  cmsRow: { backgroundColor: '#121215', borderColor: '#27272A', borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  cmsArticleTitle: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  statusText: { alignSelf: 'flex-start', color: '#A1A1AA', fontSize: 10, fontWeight: '800', marginTop: 5 },
  statusReview: { color: '#FDE68A' },
  cmsActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cmsAction: { color: '#60A5FA', fontSize: 11, fontWeight: '800', padding: 5 },
  cmsApprove: { color: '#86EFAC', fontSize: 11, fontWeight: '800', padding: 5 },
  cmsReject: { color: '#FDA4AF', fontSize: 11, fontWeight: '800', padding: 5 },
  historyItem: { color: '#A1A1AA', fontSize: 11, lineHeight: 17 },
  safetyHero: { backgroundColor: '#172554', borderColor: '#2563EB', borderWidth: 1, borderRadius: 12, padding: 18, gap: 10 },
  ageStatusRow: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  ageStatusMinor: { backgroundColor: '#2563EB' },
  ageStatusAdult: { backgroundColor: '#991B1B' },
  ageStatusText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  helpTitle: { color: '#FFF', fontSize: 28, fontWeight: '900' },
  maskButton: { alignSelf: 'flex-start', backgroundColor: '#991B1B', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  maskButtonText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  helpSection: { backgroundColor: '#121215', borderColor: '#27272A', borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  helpRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#09090B', borderRadius: 8, padding: 10 },
  helpName: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  helpNumber: { color: '#A1A1AA', fontSize: 11, marginTop: 3 },
  callText: { color: '#86EFAC', fontSize: 11, fontWeight: '900' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#09090B', borderRadius: 8, padding: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: '#52525B', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: '#166534', borderColor: '#166534' },
  checkmark: { color: '#FFF', fontWeight: '900' },
  checkText: { color: '#D4D4D8', fontSize: 13, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  articleModal: { width: '100%', maxWidth: 720, maxHeight: '88%', backgroundColor: '#121215', borderColor: '#27272A', borderWidth: 1, borderRadius: 14, padding: 18, gap: 10 },
  modalClose: { alignSelf: 'flex-end', color: '#FB7185', fontWeight: '800' },
  articleModalTitle: { color: '#FFF', fontSize: 28, lineHeight: 34, fontWeight: '900' },
  articleModalSummary: { color: '#D4D4D8', fontSize: 16, lineHeight: 23 },
  articleBody: { color: '#E4E4E7', fontSize: 15, lineHeight: 24 },
  editorInput: { backgroundColor: '#09090B', borderColor: '#27272A', borderWidth: 1, borderRadius: 8, color: '#FFF', padding: 10 },
  editorSummary: { minHeight: 70, textAlignVertical: 'top' },
  editorBody: { minHeight: 150, textAlignVertical: 'top' },
  loginModal: { width: '100%', maxWidth: 520, backgroundColor: '#121215', borderColor: '#27272A', borderWidth: 1, borderRadius: 14, padding: 18, gap: 12 },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  roleOption: { backgroundColor: '#27272A', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 },
  roleOptionActive: { backgroundColor: '#E11D48' },
  roleOptionText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  shortFeedToggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: '#121215',
    borderColor: '#27272A',
    borderWidth: 1,
    borderRadius: 999,
    padding: 4,
  },
  shortFeedButton: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  shortFeedActive: { backgroundColor: '#E11D48' },
  shortFeedText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
  shortPlayerCard: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  shortPlayer: {
    width: '78%',
    maxWidth: 430,
    minHeight: 620,
    aspectRatio: 9 / 16,
    backgroundColor: '#09090B',
    borderColor: '#27272A',
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
  },
  shortPlayerTop: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  shortPlayerPlaceholder: {
    color: '#52525B',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
  },
  soundLine: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    color: '#FFF',
    backgroundColor: 'rgba(9,9,11,0.72)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 11,
    fontWeight: '800',
  },
  shortCaptionOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 66,
    gap: 8,
  },
  shortCreatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shortHandle: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  shortCaption: {
    color: '#FFF',
    backgroundColor: 'rgba(9,9,11,0.66)',
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    fontSize: 14,
    fontWeight: '800',
  },
  shortPlayerControls: {
    position: 'absolute',
    top: 52,
    left: 10,
    gap: 6,
  },
  shortControl: {
    backgroundColor: 'rgba(39,39,42,0.88)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  shortControlText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  actionRail: {
    width: 74,
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#121215',
    borderColor: '#27272A',
    borderWidth: 1,
    borderRadius: 38,
    paddingVertical: 8,
  },
  railButton: {
    alignItems: 'center',
    backgroundColor: '#18181B',
    borderColor: '#3F3F46',
    borderWidth: 1,
    borderRadius: 999,
    width: 58,
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 6,
  },
  railIcon: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  railCount: { color: '#D4D4D8', fontSize: 9, fontWeight: '800', textAlign: 'center' },
  shortNavRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  shortNavButton: {
    backgroundColor: '#27272A',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  shortNavButtonPrimary: {
    backgroundColor: '#E11D48',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  shortNavButtonText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  shortCounterPill: { backgroundColor: '#09090B', borderColor: '#27272A', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 9 },
  shortCounterText: { color: '#D4D4D8', fontSize: 11, fontWeight: '900' },
  commentItem: {
    color: '#D4D4D8',
    backgroundColor: '#09090B',
    borderRadius: 8,
    padding: 9,
  },
});
