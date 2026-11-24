import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { aspectTheme } from '../aspectTheme';

interface Profile {
  id: string;
  handle: string;
  display_name: string;
  role: 'user' | 'creator' | 'moderator';
  age_verified: boolean;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  group_id: string | null;
  reply_to_message_id: string | null;
  body: string;
  image_path: string | null;
  created_at: string;
}

interface ChatGroup {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

interface MessageRead {
  message_id: string;
  user_id: string;
  read_at: string;
}

interface MessageReaction {
  message_id: string;
  user_id: string;
  emoji: string;
}

type RetentionOption = 'off' | '24h' | '7d';
const REACTION_OPTIONS = ['❤️', '😂', '👍', '😮'] as const;

interface SocialChatModalProps {
  visible: boolean;
  onClose: () => void;
  prefillMessage?: {
    id: string;
    label: string;
    text: string;
  } | null;
}

const RETENTION_MS: Record<Exclude<RetentionOption, 'off'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};
const CHAT_IMAGES_BUCKET = 'chat-images';
const CHAT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const CHAT_IMAGE_URL_TTL_SECONDS = 60 * 60;
const CHAT_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];
const MESSAGE_GROUP_WINDOW_MS = 5 * 60 * 1000;

const formatMessageTime = (createdAt: string) => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return date.toDateString() === new Date().toDateString()
    ? time
    : `${date.toLocaleDateString('de-AT', {
        day: '2-digit',
        month: '2-digit',
      })} ${time}`;
};

export default function SocialChatModal({
  visible,
  onClose,
  prefillMessage,
}: SocialChatModalProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [blockedProfiles, setBlockedProfiles] = useState<Profile[]>([]);
  const [userTab, setUserTab] = useState<'active' | 'blocked' | 'privacy'>('active');
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ChatGroup | null>(null);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messageScrollRef = useRef<ScrollView | null>(null);
  const shouldAutoScrollToLatestRef = useRef(true);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTypingBroadcastAtRef = useRef(0);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [confirmDeleteMessageId, setConfirmDeleteMessageId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [messageImageUrls, setMessageImageUrls] = useState<Record<string, string>>({});
  const [messageImageErrors, setMessageImageErrors] = useState<Record<string, string>>({});
  const [loadingImageIds, setLoadingImageIds] = useState<string[]>([]);
  const [messageReads, setMessageReads] = useState<MessageRead[]>([]);
  const [messageReactions, setMessageReactions] = useState<MessageReaction[]>([]);
  const [pendingReactionKeys, setPendingReactionKeys] = useState<string[]>([]);
  const pendingReactionKeysRef = useRef(new Set<string>());
  const appliedPrefillIdRef = useRef<string | null>(null);
  const reactionRevisionRef = useRef(0);
  const chatLoadRevisionRef = useRef(0);
  const readRevisionRef = useRef(0);
  const visibleMessageIdsRef = useRef(new Set<string>());
  const groupLoadRevisionRef = useRef(0);
  const previewLoadRevisionRef = useRef(0);
  const lastMessageTimesRef = useRef<Record<string, string>>({});
  const uploadingImageRef = useRef(false);
  const sendingMessageRef = useRef(false);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [retention, setRetention] = useState<RetentionOption>('off');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [groupCreatorOpen, setGroupCreatorOpen] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [status, setStatus] = useState('');
  const [reportedUserId, setReportedUserId] = useState<string | null>(null);
  const [reportedMessageId, setReportedMessageId] = useState<string | null>(null);
  const [reportedUserIds, setReportedUserIds] = useState<string[]>([]);
  const [reportedMessageIds, setReportedMessageIds] = useState<string[]>([]);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [blockingUserId, setBlockingUserId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const prefillId = prefillMessage?.id;
  const prefillLabel = prefillMessage?.label;
  const prefillText = prefillMessage?.text;

  useEffect(() => {
    if (!visible || !prefillId || !prefillText) {
      if (!visible) appliedPrefillIdRef.current = null;
      return;
    }
    if (appliedPrefillIdRef.current === prefillId) return;

    appliedPrefillIdRef.current = prefillId;
    const contextText = prefillText.trim();
    const currentDraft = messageDraft.trim();
    const nextDraft = [currentDraft, contextText].filter(Boolean).join('\n\n');
    if (nextDraft.length > 1000) {
      setStatus('Der Chat-Entwurf ist zu lang für den Bezug. Kürze ihn und wähle den Bezug erneut.');
      return;
    }

    setMessageDraft(nextDraft);
    setStatus(
      `${prefillLabel ?? 'Der Bezug'} wurde in den Nachrichtenentwurf übernommen. Wähle einen Nutzer oder Gruppenchat aus.`,
    );
  }, [visible, prefillId, prefillLabel, prefillText, messageDraft]);

  const isExpiredMessage = (createdAt: string, mode: RetentionOption): boolean => {
    if (mode === 'off') return false;
    const timestamp = Date.parse(createdAt);
    if (Number.isNaN(timestamp)) return false;
    return Date.now() - timestamp > RETENTION_MS[mode];
  };

  const loadProfiles = async (userId: string) => {
    if (!isSupabaseConfigured) return;
    const { data: blocks } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', userId);
    const ownBlockedIds =
      ((blocks as { blocked_id: string }[] | null) ?? []).map(
        (block) => block.blocked_id,
      );
    setBlockedIds(ownBlockedIds);

    const { data } = await supabase
      .from('profiles')
      .select('id, handle, display_name, role, age_verified')
      .order('display_name');
    const allOtherProfiles = ((data as Profile[] | null) ?? []).filter(
      (profile) => profile.id !== userId,
    );

    setProfiles(
      allOtherProfiles.filter((profile) => !ownBlockedIds.includes(profile.id)),
    );
    setBlockedProfiles(
      allOtherProfiles.filter((profile) => ownBlockedIds.includes(profile.id)),
    );
  };

  const loadGroups = async (userId: string) => {
    if (!isSupabaseConfigured) return;
    const revision = ++groupLoadRevisionRef.current;
    const { data: memberships, error: membershipError } = await supabase
      .from('chat_group_members')
      .select('group_id')
      .eq('user_id', userId);
    if (revision !== groupLoadRevisionRef.current) return;
    if (membershipError) {
      setStatus(`Gruppen konnten nicht geladen werden: ${membershipError.message}`);
      return;
    }

    const groupIds = [
      ...new Set(
        ((memberships as { group_id: string }[] | null) ?? []).map(
          (membership) => membership.group_id,
        ),
      ),
    ];
    if (groupIds.length === 0) {
      setGroups([]);
      return;
    }

    const { data, error } = await supabase
      .from('chat_groups')
      .select('id, name, created_by, created_at')
      .in('id', groupIds)
      .order('created_at', { ascending: false });
    if (revision !== groupLoadRevisionRef.current) return;
    if (error) {
      setStatus(`Gruppen konnten nicht geladen werden: ${error.message}`);
      return;
    }
    const nextGroups = (data as ChatGroup[] | null) ?? [];
    setGroups(nextGroups);
    setSelectedGroup((current) => {
      if (!current) return null;
      const latest = nextGroups.find((group) => group.id === current.id);
      if (!latest) return null;
      return current.name === latest.name ? current : latest;
    });
  };

  const loadChatPreviews = async (userId: string) => {
    if (!isSupabaseConfigured) return;
    const revision = ++previewLoadRevisionRef.current;
    const { data, error } = await supabase
      .from('messages')
      .select('sender_id, receiver_id, group_id, body, image_path, created_at')
      .order('created_at', { ascending: false })
      .limit(250);
    if (revision !== previewLoadRevisionRef.current) return;
    if (error) {
      setStatus(`Chat-Vorschauen konnten nicht geladen werden: ${error.message}`);
      return;
    }

    const previews: Record<string, string> = {};
    const previewTimes: Record<string, string> = {};
    for (const message of (data as Array<{
      sender_id: string;
      receiver_id: string | null;
      group_id: string | null;
      body: string;
      image_path: string | null;
      created_at: string;
    }> | null) ?? []) {
      const preview = message.image_path
        ? message.body === 'Bild'
          ? '🖼 Bild'
          : message.body
        : message.body;
      if (message.group_id) {
        const key = `group:${message.group_id}`;
        previews[key] ??= preview;
        previewTimes[key] ??= message.created_at;
      } else if (message.receiver_id) {
        const otherUserId =
          message.sender_id === userId ? message.receiver_id : message.sender_id;
        const key = `user:${otherUserId}`;
        previews[key] ??= preview;
        previewTimes[key] ??= message.created_at;
      }
    }
    lastMessageTimesRef.current = previewTimes;
    setLastMessages(previews);
  };

  const updateChatPreview = (message: ChatMessage) => {
    const key = message.group_id
      ? `group:${message.group_id}`
      : `user:${message.sender_id === session?.user.id
          ? message.receiver_id ?? ''
          : message.sender_id}`;
    const previousTime = lastMessageTimesRef.current[key];
    if (previousTime && previousTime > message.created_at) return;
    lastMessageTimesRef.current[key] = message.created_at;
    previewLoadRevisionRef.current += 1;
    setLastMessages((previous) => ({
      ...previous,
      [key]: message.image_path
        ? message.body === 'Bild'
          ? '🖼 Bild'
          : message.body
        : message.body,
    }));
  };

  const loadBlocks = async (userId: string) => {
    if (!isSupabaseConfigured) return;
    const { data } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', userId);
    setBlockedIds(
      ((data as { blocked_id: string }[] | null) ?? []).map(
        (block) => block.blocked_id,
      ),
    );
  };

  const loadMessages = async (
    otherUserId: string,
    groupId: string | null = null,
    mode: RetentionOption = retention,
  ) => {
    if (!session) return;
    const userId = session.user.id;
    const reactionRevision = reactionRevisionRef.current;
    const loadRevision = ++chatLoadRevisionRef.current;
    let query = supabase
      .from('messages')
      .select('id, sender_id, receiver_id, group_id, reply_to_message_id, body, image_path, created_at')
      .order('created_at', { ascending: true });
    query = groupId
      ? query.eq('group_id', groupId)
      : query.or(
          `and(sender_id.eq.${userId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${userId})`,
        );
    const { data, error } = await query;

    if (loadRevision !== chatLoadRevisionRef.current) return;
    if (error) {
      setStatus(`Nachrichten konnten nicht geladen werden: ${error.message}`);
      return;
    }
    const allItems = (data as ChatMessage[] | null) ?? [];

    if (mode !== 'off') {
      const expiredOwnIds = allItems
        .filter((item) => item.sender_id === userId && isExpiredMessage(item.created_at, mode))
        .map((item) => item.id);

      if (expiredOwnIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('messages')
          .delete()
          .in('id', expiredOwnIds);
        if (deleteError) setStatus(`Abgelaufene Nachrichten: ${deleteError.message}`);
      }
    }

    const visibleItems = allItems.filter(
      (item) => !isExpiredMessage(item.created_at, mode),
    );
    visibleMessageIdsRef.current = new Set(visibleItems.map((item) => item.id));
    setMessages(visibleItems);
    const imageResults = await Promise.all(
      visibleItems
        .filter(
          (item): item is ChatMessage & { image_path: string } =>
            item.image_path !== null,
        )
        .map(async (item) => {
          try {
            const { data: signedImage, error: imageError } = await supabase.storage
              .from(CHAT_IMAGES_BUCKET)
              .createSignedUrl(item.image_path, CHAT_IMAGE_URL_TTL_SECONDS);
            return {
              messageId: item.id,
              url: signedImage?.signedUrl,
              error: imageError?.message,
            };
          } catch (error) {
            return {
              messageId: item.id,
              url: undefined,
              error:
                error instanceof Error
                  ? error.message
                  : 'Unbekannter Storage-Fehler.',
            };
          }
        }),
    );
    if (loadRevision !== chatLoadRevisionRef.current) return;
    const imageUrls: Record<string, string> = {};
    const imageErrors: Record<string, string> = {};
    for (const result of imageResults) {
      if (result.url) imageUrls[result.messageId] = result.url;
      if (result.error) imageErrors[result.messageId] = result.error;
    }
    setMessageImageUrls(imageUrls);
    setMessageImageErrors(imageErrors);
    if (Object.keys(imageErrors).length > 0) {
      setStatus('Ein oder mehrere Chatbilder konnten nicht geladen werden.');
    }

    const incomingUnread = visibleItems
      .filter((item) => item.sender_id !== userId)
      .map((item) => ({ message_id: item.id, user_id: userId }));
    if (incomingUnread.length > 0) {
      const { error: readError } = await supabase
        .from('message_reads')
        .upsert(incomingUnread, {
          onConflict: 'message_id,user_id',
          ignoreDuplicates: true,
        });
      if (readError) setStatus(`Lesestatus konnte nicht gespeichert werden: ${readError.message}`);
    }
    if (loadRevision !== chatLoadRevisionRef.current) return;

    const messageIds = visibleItems.map((item) => item.id);
    if (messageIds.length === 0) {
      visibleMessageIdsRef.current = new Set();
      setMessageReads([]);
      setMessageReactions([]);
      return;
    }
    const readRevision = readRevisionRef.current;
    const [readsResult, reactionsResult] = await Promise.all([
      supabase
        .from('message_reads')
        .select('message_id, user_id, read_at')
        .in('message_id', messageIds),
      supabase
        .from('message_reactions')
        .select('message_id, user_id, emoji')
        .in('message_id', messageIds),
    ]);
    if (loadRevision !== chatLoadRevisionRef.current) return;
    if (readsResult.error) {
      setStatus(`Lesebestätigungen konnten nicht geladen werden: ${readsResult.error.message}`);
    } else if (readRevisionRef.current === readRevision) {
      setMessageReads((readsResult.data as MessageRead[] | null) ?? []);
    } else {
      const loadedReads = (readsResult.data as MessageRead[] | null) ?? [];
      setMessageReads((previous) => {
        const merged = new Map<string, MessageRead>();
        for (const read of loadedReads) {
          merged.set(`${read.message_id}:${read.user_id}`, read);
        }
        for (const read of previous) {
          if (messageIds.includes(read.message_id)) {
            merged.set(`${read.message_id}:${read.user_id}`, read);
          }
        }
        return [...merged.values()];
      });
    }
    if (reactionsResult.error) {
      setStatus(`Reaktionen konnten nicht geladen werden: ${reactionsResult.error.message}`);
    } else if (reactionRevisionRef.current === reactionRevision) {
      setMessageReactions(
        (reactionsResult.data as MessageReaction[] | null) ?? [],
      );
    }
  };

  const removeMessageFromLocalState = (messageId: string) => {
    chatLoadRevisionRef.current += 1;
    visibleMessageIdsRef.current.delete(messageId);
    setMessages((previous) =>
      previous
        .filter((message) => message.id !== messageId)
        .map((message) =>
          message.reply_to_message_id === messageId
            ? { ...message, reply_to_message_id: null }
            : message,
        ),
    );
    setMessageReads((previous) =>
      previous.filter((read) => read.message_id !== messageId),
    );
    setMessageReactions((previous) =>
      previous.filter((reaction) => reaction.message_id !== messageId),
    );
    setMessageImageUrls((previous) => {
      const next = { ...previous };
      delete next[messageId];
      return next;
    });
    setMessageImageErrors((previous) => {
      const next = { ...previous };
      delete next[messageId];
      return next;
    });
    setLoadingImageIds((previous) => previous.filter((id) => id !== messageId));
    setReplyingTo((current) => current?.id === messageId ? null : current);
    setConfirmDeleteMessageId((current) => current === messageId ? null : current);
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStatus('Supabase ist nicht konfiguriert. Bitte EXPO_PUBLIC_* in der .env-Datei setzen.');
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        void loadProfiles(data.session.user.id);
        void loadBlocks(data.session.user.id);
        void loadGroups(data.session.user.id);
        void loadChatPreviews(data.session.user.id);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        void loadProfiles(nextSession.user.id);
        void loadBlocks(nextSession.user.id);
        void loadGroups(nextSession.user.id);
        void loadChatPreviews(nextSession.user.id);
      } else {
        chatLoadRevisionRef.current += 1;
        groupLoadRevisionRef.current += 1;
        previewLoadRevisionRef.current += 1;
        setProfiles([]);
        setBlockedProfiles([]);
        setUserTab('active');
        setSelectedProfile(null);
        setSelectedGroup(null);
        setReportedUserId(null);
        setReportedMessageId(null);
        setReportedUserIds([]);
        setReportedMessageIds([]);
        setReportReason('');
        setReportSubmitting(false);
        setGroups([]);
        setLastMessages({});
        setMessages([]);
        setReplyingTo(null);
        setConfirmDeleteMessageId(null);
        setMessageImageUrls({});
        setMessageImageErrors({});
        setLoadingImageIds([]);
        setMessageReads([]);
        setMessageReactions([]);
        setBlockedIds([]);
        setConfirmDeleteAll(false);
        lastMessageTimesRef.current = {};
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    chatLoadRevisionRef.current += 1;
    visibleMessageIdsRef.current.clear();
    shouldAutoScrollToLatestRef.current = true;
    setShowScrollToLatest(false);
    setMessages([]);
    setReplyingTo(null);
    setConfirmDeleteMessageId(null);
    setMessageReads([]);
    setMessageReactions([]);
    setMessageImageUrls({});
    setMessageImageErrors({});
    setLoadingImageIds([]);
  }, [session?.user.id, selectedProfile?.id, selectedGroup?.id]);

  useEffect(() => {
    if (!selectedGroup || groups.some((group) => group.id === selectedGroup.id)) {
      return;
    }
    setSelectedGroup(null);
  }, [groups, selectedGroup]);

  useEffect(() => {
    if (!session || (!selectedProfile && !selectedGroup)) return;
    const groupId = selectedGroup?.id ?? null;
    const otherUserId = selectedProfile?.id ?? '';
    let isActive = true;
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = null;
    lastTypingBroadcastAtRef.current = 0;
    setTypingUserIds([]);
    void loadMessages(otherUserId, groupId, retention);

    const channel = supabase
      .channel(
        `chat:${session.user.id}:${groupId ? `group:${groupId}` : `user:${otherUserId}`}`,
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const typingEvent = payload as {
          user_id?: unknown;
          is_typing?: unknown;
        };
        if (
          typeof typingEvent.user_id !== 'string' ||
          typingEvent.user_id === session.user.id
        ) return;

        const typingUserId = typingEvent.user_id;
        const existingTimeout = typingTimeoutsRef.current[typingUserId];
        if (existingTimeout) clearTimeout(existingTimeout);
        if (typingEvent.is_typing === true) {
          setTypingUserIds((previous) =>
            previous.includes(typingUserId)
              ? previous
              : [...previous, typingUserId],
          );
          typingTimeoutsRef.current[typingUserId] = setTimeout(() => {
            setTypingUserIds((previous) =>
              previous.filter((userId) => userId !== typingUserId),
            );
            delete typingTimeoutsRef.current[typingUserId];
          }, 2600);
        } else if (typingEvent.is_typing === false) {
          setTypingUserIds((previous) =>
            previous.filter((userId) => userId !== typingUserId),
          );
          delete typingTimeoutsRef.current[typingUserId];
        }
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const message = payload.new as ChatMessage;
          const belongsToChat = groupId
            ? message.group_id === groupId
            : ((message.sender_id === session.user.id &&
                message.receiver_id === otherUserId) ||
                (message.sender_id === otherUserId &&
                  message.receiver_id === session.user.id));
          if (belongsToChat && !isExpiredMessage(message.created_at, retention)) {
            visibleMessageIdsRef.current.add(message.id);
            setMessages((prev) =>
              prev.some((item) => item.id === message.id)
                ? prev
                : [...prev, message],
            );
            updateChatPreview(message);
            if (message.image_path) {
              void supabase.storage
                .from(CHAT_IMAGES_BUCKET)
                .createSignedUrl(message.image_path, CHAT_IMAGE_URL_TTL_SECONDS)
                .then(({ data: signedImage, error: imageError }) => {
                  if (imageError) {
                    setMessageImageErrors((previous) => ({
                      ...previous,
                      [message.id]: imageError.message,
                    }));
                    return;
                  }
                  setMessageImageUrls((previous) => ({
                    ...previous,
                    [message.id]: signedImage.signedUrl,
                  }));
                })
                .catch((error: unknown) => {
                  const detail =
                    error instanceof Error
                      ? error.message
                      : 'Unbekannter Storage-Fehler.';
                  setMessageImageErrors((previous) => ({
                    ...previous,
                    [message.id]: detail,
                  }));
                });
            }
            if (message.sender_id !== session.user.id) {
              void supabase
                .from('message_reads')
                .upsert(
                  { message_id: message.id, user_id: session.user.id },
                  { onConflict: 'message_id,user_id', ignoreDuplicates: true },
                )
                .then(({ error }) => {
                  if (error) {
                    setStatus(`Lesestatus konnte nicht gespeichert werden: ${error.message}`);
                  } else {
                    readRevisionRef.current += 1;
                    setMessageReads((previous) => [
                      ...previous.filter(
                        (item) =>
                          !(
                            item.message_id === message.id &&
                            item.user_id === session.user.id
                          ),
                      ),
                      {
                        message_id: message.id,
                        user_id: session.user.id,
                        read_at: new Date().toISOString(),
                      },
                    ]);
                  }
                });
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const deletedMessage = payload.old as Pick<ChatMessage, 'id'>;
          if (!visibleMessageIdsRef.current.has(deletedMessage.id)) return;
          removeMessageFromLocalState(deletedMessage.id);
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const reaction = payload.new as MessageReaction;
          reactionRevisionRef.current += 1;
          setMessageReactions((previous) => [
            ...previous.filter(
              (item) =>
                !(
                  item.message_id === reaction.message_id &&
                  item.user_id === reaction.user_id
                ),
            ),
            reaction,
          ]);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const reaction = payload.new as MessageReaction;
          reactionRevisionRef.current += 1;
          setMessageReactions((previous) => [
            ...previous.filter(
              (item) =>
                !(
                  item.message_id === reaction.message_id &&
                  item.user_id === reaction.user_id
                ),
            ),
            reaction,
          ]);
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const reaction = payload.old as Pick<
            MessageReaction,
            'message_id' | 'user_id'
          >;
          reactionRevisionRef.current += 1;
          setMessageReactions((previous) =>
            previous.filter(
              (item) =>
                !(
                  item.message_id === reaction.message_id &&
                  item.user_id === reaction.user_id
                ),
            ),
          );
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reads' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const read = payload.old as Pick<MessageRead, 'message_id' | 'user_id'>;
            if (!visibleMessageIdsRef.current.has(read.message_id)) return;
            readRevisionRef.current += 1;
            setMessageReads((previous) =>
              previous.filter(
                (item) =>
                  item.message_id !== read.message_id ||
                  item.user_id !== read.user_id,
              ),
            );
            return;
          }
          const read = payload.new as MessageRead;
          if (!visibleMessageIdsRef.current.has(read.message_id)) return;
          readRevisionRef.current += 1;
          setMessageReads((previous) => [
            ...previous.filter(
              (item) =>
                item.message_id !== read.message_id ||
                item.user_id !== read.user_id,
            ),
            read,
          ]);
        },
      )
      .subscribe((subscriptionStatus) => {
        if (isActive && subscriptionStatus === 'SUBSCRIBED') {
          typingChannelRef.current = channel;
        }
      });

    return () => {
      isActive = false;
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
      if (typingChannelRef.current === channel) typingChannelRef.current = null;
      Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
      typingTimeoutsRef.current = {};
      setTypingUserIds([]);
      void supabase.removeChannel(channel);
    };
  }, [selectedProfile, selectedGroup, session, retention]);

  useEffect(() => {
    if (session) void loadChatPreviews(session.user.id);
  }, [session, messages]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`chat-list:${session.user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const message = payload.new as ChatMessage;
          updateChatPreview(message);
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        () => {
          void loadChatPreviews(session.user.id);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_group_members' },
        (payload) => {
          const membership = (payload.eventType === 'DELETE'
            ? payload.old
            : payload.new) as { user_id?: string } | null;
          if (membership?.user_id !== session.user.id) return;
          void loadGroups(session.user.id);
          void loadChatPreviews(session.user.id);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_groups' },
        () => {
          void loadGroups(session.user.id);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session]);

  useEffect(() => {
    if (!visible || !session) return;
    void loadProfiles(session.user.id);
    void loadGroups(session.user.id);
    void loadChatPreviews(session.user.id);
  }, [visible, session]);

  const register = async () => {
    if (!isSupabaseConfigured) {
      setStatus('Supabase ist nicht konfiguriert.');
      return;
    }
    setStatus('');
    if (!email.trim() || !password.trim()) {
      setStatus('E-Mail und Passwort sind erforderlich.');
      return;
    }
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          handle: handle.trim(),
          display_name: displayName.trim(),
        },
      },
    });
    setStatus(error ? error.message : 'Registrierung erfolgreich. Bitte E-Mail bestätigen.');
  };

  const login = async () => {
    if (!isSupabaseConfigured) {
      setStatus('Supabase ist nicht konfiguriert.');
      return;
    }
    setStatus('');
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setStatus(error ? error.message : 'Angemeldet.');
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const sendTypingState = (isTyping: boolean) => {
    const channel = typingChannelRef.current;
    if (!channel || !session) return;
    const now = Date.now();
    if (isTyping && now - lastTypingBroadcastAtRef.current < 800) return;
    if (isTyping) lastTypingBroadcastAtRef.current = now;

    void channel
      .send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: session.user.id, is_typing: isTyping },
      })
      .then((sendStatus) => {
        if (sendStatus !== 'ok') {
          setStatus('Schreibstatus ist gerade nicht verfügbar.');
        }
      })
      .catch((error: unknown) => {
        const detail =
          error instanceof Error ? error.message : 'Unbekannter Realtime-Fehler.';
        setStatus(`Schreibstatus konnte nicht aktualisiert werden: ${detail}`);
      });
  };

  const handleMessageDraftChange = (value: string) => {
    setMessageDraft(value);
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (!value.trim()) {
      sendTypingState(false);
      typingStopTimerRef.current = null;
      return;
    }

    sendTypingState(true);
    typingStopTimerRef.current = setTimeout(() => {
      sendTypingState(false);
      typingStopTimerRef.current = null;
    }, 1800);
  };

  const sendMessage = async () => {
    if (!isSupabaseConfigured) {
      setStatus('Supabase ist nicht konfiguriert.');
      return;
    }
    if (
      sendingMessageRef.current ||
      uploadingImageRef.current ||
      !session ||
      (!selectedProfile && !selectedGroup) ||
      !messageDraft.trim() ||
      (selectedProfile && blockedIds.includes(selectedProfile.id))
    ) return;
    sendingMessageRef.current = true;
    setSendingMessage(true);
    const body = messageDraft.trim();
    const replyToMessageId = replyingTo?.id ?? null;
    const replySnapshot = replyingTo;
    const optimisticMessage: ChatMessage = {
      id: `pending:${session.user.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      sender_id: session.user.id,
      receiver_id: selectedProfile?.id ?? null,
      group_id: selectedGroup?.id ?? null,
      reply_to_message_id: replyToMessageId,
      body,
      image_path: null,
      created_at: new Date().toISOString(),
    };
    const message = {
      sender_id: session.user.id,
      receiver_id: selectedProfile?.id ?? null,
      group_id: selectedGroup?.id ?? null,
      reply_to_message_id: replyToMessageId,
      body,
      image_path: null,
    };
    visibleMessageIdsRef.current.add(optimisticMessage.id);
    setMessages((previous) => [...previous, optimisticMessage]);
    setMessageDraft('');
    setReplyingTo(null);
    setStatus('Nachricht wird gesendet …');
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = null;
    sendTypingState(false);
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert(message)
        .select('id, sender_id, receiver_id, group_id, reply_to_message_id, body, image_path, created_at')
        .single();
      if (error) throw error;
      const sentMessage = data as ChatMessage;
      visibleMessageIdsRef.current.delete(optimisticMessage.id);
      visibleMessageIdsRef.current.add(sentMessage.id);
      setMessages((previous) => {
        const withoutOptimistic = previous.filter(
          (item) => item.id !== optimisticMessage.id,
        );
        return withoutOptimistic.some((item) => item.id === sentMessage.id)
          ? withoutOptimistic
          : [...withoutOptimistic, sentMessage];
      });
      updateChatPreview(sentMessage);
      setStatus('Nachricht gesendet.');
    } catch (error) {
      visibleMessageIdsRef.current.delete(optimisticMessage.id);
      setMessages((previous) =>
        previous.filter((item) => item.id !== optimisticMessage.id),
      );
      setMessageDraft((current) => current || body);
      if (replySnapshot) {
        setReplyingTo((current) => current ?? replySnapshot);
      }
      const detail =
        error instanceof Error ? error.message : 'Unbekannter Datenbankfehler.';
      setStatus(`Nachricht konnte nicht gesendet werden: ${detail}`);
    } finally {
      sendingMessageRef.current = false;
      setSendingMessage(false);
    }
  };

  const uploadChatImage = async (file: File) => {
    if (
      uploadingImageRef.current ||
      sendingMessageRef.current ||
      !session ||
      (!selectedProfile && !selectedGroup) ||
      (selectedProfile && blockedIds.includes(selectedProfile.id))
    ) return;
    if (!CHAT_IMAGE_MIME_TYPES.includes(file.type)) {
      setStatus('Bitte wähle ein JPEG-, PNG-, WebP- oder GIF-Bild aus.');
      return;
    }
    if (file.size === 0) {
      setStatus('Die ausgewählte Datei enthält keine Bilddaten.');
      return;
    }
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      setStatus('Das Bild darf höchstens 8 MB groß sein.');
      return;
    }

    uploadingImageRef.current = true;
    setUploadingImage(true);
    setStatus('Bild wird hochgeladen …');
    let uploadedPath: string | null = null;
    let objectUploaded = false;
    let messageSaved = false;
    try {
      const extensionByMimeType: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
      };
      const fileToken = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      uploadedPath = `${session.user.id}/${fileToken}.${extensionByMimeType[file.type]}`;
      const { error: uploadError } = await supabase.storage
        .from(CHAT_IMAGES_BUCKET)
        .upload(uploadedPath, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      objectUploaded = true;

      const message = {
        sender_id: session.user.id,
        receiver_id: selectedProfile?.id ?? null,
        group_id: selectedGroup?.id ?? null,
        reply_to_message_id: replyingTo?.id ?? null,
        body: messageDraft.trim() || 'Bild',
        image_path: uploadedPath,
      };
      const { data, error: messageError } = await supabase
        .from('messages')
        .insert(message)
        .select('id, sender_id, receiver_id, group_id, reply_to_message_id, body, image_path, created_at')
        .single();
      if (messageError) throw messageError;
      messageSaved = true;

      const sentMessage = data as ChatMessage;
      setMessages((previous) =>
        previous.some((item) => item.id === sentMessage.id)
          ? previous
          : [...previous, sentMessage],
      );
      updateChatPreview(sentMessage);
      setMessageDraft('');
      setReplyingTo(null);

      const { data: signedImage, error: signedImageError } = await supabase.storage
        .from(CHAT_IMAGES_BUCKET)
        .createSignedUrl(uploadedPath, CHAT_IMAGE_URL_TTL_SECONDS);
      if (signedImageError) {
        setMessageImageErrors((previous) => ({
          ...previous,
          [sentMessage.id]: signedImageError.message,
        }));
        setStatus('Bild wurde gesendet, kann aber gerade nicht angezeigt werden.');
      } else {
        setMessageImageUrls((previous) => ({
          ...previous,
          [sentMessage.id]: signedImage.signedUrl,
        }));
        setStatus('Bild gesendet.');
      }
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Unbekannter Uploadfehler.';
      let cleanupDetail = '';
      if (uploadedPath && objectUploaded && !messageSaved) {
        const { error: cleanupError } = await supabase.storage
          .from(CHAT_IMAGES_BUCKET)
          .remove([uploadedPath]);
        if (cleanupError) cleanupDetail = ` Das nicht gesendete Bild konnte nicht entfernt werden: ${cleanupError.message}`;
      }
      setStatus(`Bild konnte nicht gesendet werden: ${detail}.${cleanupDetail}`);
    } finally {
      uploadingImageRef.current = false;
      setUploadingImage(false);
    }
  };

  const chooseChatImage = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (uploadingImageRef.current || sendingMessageRef.current) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = CHAT_IMAGE_MIME_TYPES.join(',');
    input.onchange = () => {
      const file = input.files?.[0];
      input.value = '';
      if (file) void uploadChatImage(file);
    };
    input.click();
  };

  const retryMessageImage = async (message: ChatMessage) => {
    const imagePath = message.image_path;
    if (!imagePath) return;
    setLoadingImageIds((previous) =>
      previous.includes(message.id) ? previous : [...previous, message.id],
    );
    setMessageImageErrors((previous) => {
      const next = { ...previous };
      delete next[message.id];
      return next;
    });
    try {
      const { data, error } = await supabase.storage
        .from(CHAT_IMAGES_BUCKET)
        .createSignedUrl(imagePath, CHAT_IMAGE_URL_TTL_SECONDS);
      if (error) throw error;
      setMessageImageUrls((previous) => ({
        ...previous,
        [message.id]: data.signedUrl,
      }));
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Unbekannter Storage-Fehler.';
      setMessageImageErrors((previous) => ({
        ...previous,
        [message.id]: detail,
      }));
    } finally {
      setLoadingImageIds((previous) => previous.filter((id) => id !== message.id));
    }
  };

  const createGroup = async () => {
    if (!isSupabaseConfigured || !session) {
      setStatus('Bitte melde dich an, um eine Gruppe zu erstellen.');
      return;
    }
    if (!groupNameDraft.trim() || groupMemberIds.length === 0) {
      setStatus('Gib einen Gruppennamen ein und wähle mindestens eine Person aus.');
      return;
    }
    setCreatingGroup(true);
    const { data, error } = await supabase.rpc('create_chat_group', {
      group_name: groupNameDraft.trim(),
      member_ids: groupMemberIds,
    });
    setCreatingGroup(false);
    if (error) {
      setStatus(`Gruppe konnte nicht erstellt werden: ${error.message}`);
      return;
    }
    if (typeof data !== 'string') {
      setStatus('Gruppenchat wurde ohne gültige Gruppen-ID erstellt.');
      return;
    }
    const groupId = data;
    const { data: groupData, error: groupError } = await supabase
      .from('chat_groups')
      .select('id, name, created_by, created_at')
      .eq('id', groupId)
      .single();
    if (groupError) {
      setStatus(`Gruppe erstellt, aber konnte nicht geladen werden: ${groupError.message}`);
      await loadGroups(session.user.id);
      return;
    }
    const group = groupData as ChatGroup;
    setGroups((previous) => [group, ...previous.filter((item) => item.id !== group.id)]);
    setSelectedProfile(null);
    setSelectedGroup(group);
    setReportedUserId(null);
    setReportedMessageId(null);
    setReportReason('');
    setGroupNameDraft('');
    setGroupMemberIds([]);
    setStatus('Gruppenchat erstellt.');
  };

  const toggleGroupMember = (profileId: string) => {
    setGroupMemberIds((previous) =>
      previous.includes(profileId)
        ? previous.filter((id) => id !== profileId)
        : [...previous, profileId],
    );
  };

  const deleteOwnMessage = async (message: ChatMessage) => {
    if (!isSupabaseConfigured) {
      setStatus('Supabase ist nicht konfiguriert.');
      return;
    }
    if (!session || message.sender_id !== session.user.id) return;

    setDeletingMessageId(message.id);
    try {
      const { data, error } = await supabase
        .from('messages')
        .delete()
        .eq('id', message.id)
        .eq('sender_id', session.user.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Nachricht nicht gefunden oder keine Löschberechtigung.');
      }

      removeMessageFromLocalState(message.id);
      if (message.image_path) {
        const { error: imageDeleteError } = await supabase.storage
          .from(CHAT_IMAGES_BUCKET)
          .remove([message.image_path]);
        if (imageDeleteError) {
          setStatus(`Nachricht gelöscht, Chatbild konnte aber nicht gelöscht werden: ${imageDeleteError.message}`);
          return;
        }
      }
      setStatus('Eigene Nachricht gelöscht.');
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Unbekannter Datenbankfehler.';
      setStatus(`Nachricht konnte nicht gelöscht werden: ${detail}`);
    } finally {
      setDeletingMessageId(null);
    }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!session) return;
    const userId = session.user.id;
    const pendingKey = `${messageId}:${userId}`;
    if (pendingReactionKeysRef.current.has(pendingKey)) return;

    const currentReaction = messageReactions.find(
      (reaction) =>
        reaction.message_id === messageId &&
        reaction.user_id === userId,
    );
    const nextReaction =
      currentReaction?.emoji === emoji
        ? null
        : { message_id: messageId, user_id: userId, emoji };

    reactionRevisionRef.current += 1;
    pendingReactionKeysRef.current.add(pendingKey);
    setPendingReactionKeys((previous) => [...previous, pendingKey]);
    setMessageReactions((previous) => [
      ...previous.filter(
        (reaction) =>
          !(
            reaction.message_id === messageId &&
            reaction.user_id === userId
          ),
      ),
      ...(nextReaction ? [nextReaction] : []),
    ]);

    try {
      if (nextReaction) {
        const { error } = await supabase
          .from('message_reactions')
          .upsert(nextReaction, { onConflict: 'message_id,user_id' });
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', userId)
          .select('message_id');
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('Die Reaktion wurde nicht gefunden oder konnte nicht entfernt werden.');
        }
      }
    } catch (error) {
      setMessageReactions((previous) => [
        ...previous.filter(
          (reaction) =>
            !(
              reaction.message_id === messageId &&
              reaction.user_id === userId
            ),
        ),
        ...(currentReaction ? [currentReaction] : []),
      ]);
      const detail =
        error instanceof Error ? error.message : 'Unbekannter Datenbankfehler.';
      setStatus(`Reaktion konnte nicht aktualisiert werden: ${detail}`);
    } finally {
      pendingReactionKeysRef.current.delete(pendingKey);
      setPendingReactionKeys((previous) =>
        previous.filter((key) => key !== pendingKey),
      );
    }
  };

  const blockUser = async () => {
    if (!isSupabaseConfigured) {
      setStatus('Supabase ist nicht konfiguriert.');
      return;
    }
    if (!session) {
      setStatus('Bitte melde dich an, um Nutzer zu blockieren.');
      return;
    }
    if (!selectedProfile || blockingUserId) return;
    const targetProfile = selectedProfile;
    setBlockingUserId(targetProfile.id);
    setStatus('Blockierung wird gespeichert …');
    try {
      const { error } = await supabase.from('blocked_users').upsert(
        {
          blocker_id: session.user.id,
          blocked_id: targetProfile.id,
        },
        { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
      );
      if (error) throw error;

      setBlockedIds((previous) =>
        previous.includes(targetProfile.id)
          ? previous
          : [...previous, targetProfile.id],
      );
      setProfiles((previous) =>
        previous.filter((profile) => profile.id !== targetProfile.id),
      );
      setBlockedProfiles((previous) =>
        previous.some((profile) => profile.id === targetProfile.id)
          ? previous
          : [...previous, targetProfile].sort((a, b) =>
              a.display_name.localeCompare(b.display_name),
            ),
      );
      setSelectedProfile(null);
      setMessages([]);
      setReportedUserId(null);
      setReportedMessageId(null);
      setReportReason('');
      setStatus('Nutzer wurde blockiert. Neue Direktnachrichten mit diesem Nutzer sind gesperrt.');
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Unbekannter Datenbankfehler.';
      setStatus(`Nutzer konnte nicht blockiert werden: ${detail}`);
    } finally {
      setBlockingUserId(null);
    }
  };

  const unblockUserById = async (targetUserId: string) => {
    if (!isSupabaseConfigured) {
      setStatus('Supabase ist nicht konfiguriert.');
      return;
    }
    if (!session) {
      setStatus('Bitte melde dich an, um die Blockierung aufzuheben.');
      return;
    }
    if (blockingUserId) return;
    setBlockingUserId(targetUserId);
    setStatus('Blockierung wird aufgehoben …');
    try {
      const { error } = await supabase
        .from('blocked_users')
        .delete()
        .eq('blocker_id', session.user.id)
        .eq('blocked_id', targetUserId);
      if (error) throw error;

      setBlockedIds((previous) =>
        previous.filter((id) => id !== targetUserId),
      );
      setStatus('Blockierung aufgehoben.');
      await loadProfiles(session.user.id);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Unbekannter Datenbankfehler.';
      setStatus(`Blockierung konnte nicht aufgehoben werden: ${detail}`);
    } finally {
      setBlockingUserId(null);
    }
  };

  const unblockUser = async () => {
    if (!selectedProfile) return;
    await unblockUserById(selectedProfile.id);
  };

  const reportUser = async (
    targetUserId = reportedUserId ?? selectedProfile?.id ?? null,
    messageId = reportedMessageId,
    reasonText = reportReason,
  ) => {
    if (!isSupabaseConfigured) {
      setStatus('Supabase ist nicht konfiguriert.');
      return;
    }
    if (reportSubmitting) return;
    if (!session) {
      setStatus('Bitte melde dich an, um eine Meldung abzusenden.');
      return;
    }
    if (!targetUserId) {
      setStatus('Bitte wähle einen Nutzer oder eine Nachricht zum Melden aus.');
      return;
    }
    if (targetUserId === session.user.id) {
      setStatus('Du kannst dich nicht selbst melden.');
      return;
    }
    const reason = reasonText.trim();
    if (reason.length < 3 || reason.length > 500) {
      setStatus('Der Meldegrund muss zwischen 3 und 500 Zeichen lang sein.');
      return;
    }
    setReportSubmitting(true);
    setStatus('Meldung wird übermittelt …');
    try {
      const { error } = await supabase.from('reports').insert({
        reporter_id: session.user.id,
        reported_user_id: targetUserId,
        reason,
        message_id: messageId,
      });
      if (error) throw error;

      setStatus('Meldung wurde abgesendet. Danke für deinen Hinweis.');
      setReportedUserIds((previous) =>
        previous.includes(targetUserId) ? previous : [...previous, targetUserId],
      );
      if (messageId) {
        setReportedMessageIds((previous) =>
          previous.includes(messageId) ? previous : [...previous, messageId],
        );
      }
      setReportReason('');
      setReportedUserId(null);
      setReportedMessageId(null);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Unbekannter Datenbankfehler.';
      setStatus(`Meldung konnte nicht abgesendet werden: ${detail}`);
    } finally {
      setReportSubmitting(false);
    }
  };

  const exportMyData = async () => {
    if (!isSupabaseConfigured || !session) return;
    const userId = session.user.id;
    setStatus('DSGVO-Datenexport wird erstellt...');

    const [
      profileRes,
      messagesRes,
      blocksRes,
      reportsRes,
      groupsRes,
      groupDetailsRes,
      readsRes,
      reactionsRes,
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true }),
      supabase.from('blocked_users').select('*').eq('blocker_id', userId),
      supabase.from('reports').select('*').eq('reporter_id', userId),
      supabase.from('chat_group_members').select('group_id, role, joined_at').eq('user_id', userId),
      supabase.from('chat_groups').select('id, name, created_by, created_at'),
      supabase.from('message_reads').select('*').eq('user_id', userId),
      supabase.from('message_reactions').select('*').eq('user_id', userId),
    ]);

    const failedExport = [
      profileRes,
      messagesRes,
      blocksRes,
      reportsRes,
      groupsRes,
      groupDetailsRes,
      readsRes,
      reactionsRes,
    ].find((result) => result.error);
    if (failedExport?.error) {
      setStatus(`DSGVO-Export fehlgeschlagen: ${failedExport.error.message}`);
      return;
    }

    const exportPayload = {
      exported_at: new Date().toISOString(),
      gdpr_notice: 'DSGVO Art. 15 & 20 Datenauskunft – ASPEKT.TV',
      account: {
        id: userId,
        email: session.user.email ?? null,
        created_at: session.user.created_at ?? null,
      },
      profile: profileRes.data ?? null,
      messages: messagesRes.data ?? [],
      blocked_users: blocksRes.data ?? [],
      reports: reportsRes.data ?? [],
      group_memberships: groupsRes.data ?? [],
      group_chats: groupDetailsRes.data ?? [],
      message_reads: readsRes.data ?? [],
      message_reactions: reactionsRes.data ?? [],
    };

    const jsonString = JSON.stringify(exportPayload, null, 2);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `aspekt-dsgvo-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStatus('DSGVO-Datenpaket wurde als JSON heruntergeladen.');
    } else {
      setStatus(`Export bereit (${(messagesRes.data ?? []).length} Nachrichten erfasst).`);
    }
  };

  const deleteMyData = async () => {
    if (!isSupabaseConfigured || !session) return;
    const userId = session.user.id;
    setStatus('Eigene Daten werden gemäß Art. 17 DSGVO gelöscht...');

    const { error: messageDeleteError } = await supabase
      .from('messages')
      .delete()
      .eq('sender_id', userId);
    if (messageDeleteError) {
      setStatus(`Gesendete Nachrichten konnten nicht gelöscht werden: ${messageDeleteError.message}`);
      return;
    }

    try {
      while (true) {
        const { data: files, error: listError } = await supabase.storage
          .from(CHAT_IMAGES_BUCKET)
          .list(userId, { limit: 100, offset: 0 });
        if (listError) throw listError;
        const paths = (files ?? [])
          .filter((file) => file.id !== null)
          .map((file) => `${userId}/${file.name}`);
        if (paths.length === 0) break;
        const { error: removeError } = await supabase.storage
          .from(CHAT_IMAGES_BUCKET)
          .remove(paths);
        if (removeError) throw removeError;
      }
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Unbekannter Storage-Fehler.';
      setStatus(`Chatbilder konnten nicht gelöscht werden: ${detail}`);
      return;
    }

    await supabase.from('message_reads').delete().eq('user_id', userId);
    await supabase.from('message_reactions').delete().eq('user_id', userId);
    await supabase.from('chat_group_members').delete().eq('user_id', userId);
    await supabase.from('blocked_users').delete().eq('blocker_id', userId);
    await supabase.from('reports').delete().eq('reporter_id', userId);
    await supabase.from('profiles').delete().eq('id', userId);

    setConfirmDeleteAll(false);
    setSelectedProfile(null);
    setMessages([]);
    await supabase.auth.signOut();
    setStatus('Eigene Profildaten, gesendete Nachrichten, Chatbilder und Sperren wurden gelöscht.');
  };

  const isBlocked = selectedProfile
    ? blockedIds.includes(selectedProfile.id)
    : false;
  const typingNames = typingUserIds
    .map(
      (userId) =>
        profiles.find((profile) => profile.id === userId)?.display_name,
    )
    .filter((name): name is string => Boolean(name));
  const typingIndicatorText = selectedGroup
    ? typingNames.length > 1
      ? 'Mehrere Mitglieder schreiben gerade…'
      : `${typingNames[0] ?? 'Ein Mitglied'} schreibt gerade…`
    : 'Schreibt gerade…';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>ASPEKT Direktchat</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.close}>Schließen</Text>
            </TouchableOpacity>
          </View>

          {!session ? (
            <ScrollView contentContainerStyle={styles.auth}>
              <Text style={styles.sectionTitle}>Registrieren / Anmelden</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="E-Mail"
                placeholderTextColor="#71717A"
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Passwort"
                placeholderTextColor="#71717A"
                secureTextEntry
              />
              <TextInput
                style={styles.input}
                value={handle}
                onChangeText={setHandle}
                placeholder="Handle"
                placeholderTextColor="#71717A"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Anzeigename"
                placeholderTextColor="#71717A"
              />
              <View style={styles.actions}>
                <TouchableOpacity style={styles.primary} onPress={register}>
                  <Text style={styles.primaryText}>Registrieren</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondary} onPress={login}>
                  <Text style={styles.secondaryText}>Anmelden</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.chatLayout}>
              <View style={styles.profileList}>
                <View style={styles.userHeader}>
                  <Text style={styles.sectionTitle}>Nachrichten</Text>
                  <TouchableOpacity onPress={logout}>
                    <Text style={styles.logout}>Logout</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.tabBar}>
                  <TouchableOpacity
                    style={[
                      styles.tabButton,
                      userTab === 'active' && styles.tabButtonActive,
                    ]}
                    onPress={() => setUserTab('active')}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        userTab === 'active' && styles.tabTextActive,
                      ]}
                    >
                      Aktiv ({profiles.length + groups.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.tabButton,
                      userTab === 'blocked' && styles.tabButtonActive,
                    ]}
                    onPress={() => setUserTab('blocked')}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        userTab === 'blocked' && styles.tabTextActive,
                      ]}
                    >
                      Blockiert ({blockedProfiles.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.tabButton,
                      userTab === 'privacy' && styles.tabButtonActive,
                    ]}
                    onPress={() => setUserTab('privacy')}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        userTab === 'privacy' && styles.tabTextActive,
                      ]}
                    >
                      DSGVO
                    </Text>
                  </TouchableOpacity>
                </View>

                {userTab === 'active' && (
                  <ScrollView>
                    <TouchableOpacity
                      style={styles.newGroupButton}
                      onPress={() => setGroupCreatorOpen((open) => !open)}
                    >
                      <Text style={styles.newGroupText}>
                        {groupCreatorOpen ? 'Gruppenerstellung schließen' : '+ Gruppenchat'}
                      </Text>
                    </TouchableOpacity>
                    {groupCreatorOpen && (
                      <View style={styles.groupCreator}>
                        <TextInput
                          style={styles.groupNameInput}
                          value={groupNameDraft}
                          onChangeText={setGroupNameDraft}
                          placeholder="Gruppenname"
                          placeholderTextColor="#71717A"
                          maxLength={60}
                        />
                        <Text style={styles.groupPickerLabel}>Mitglieder auswählen</Text>
                        {profiles.map((profile) => {
                          const selected = groupMemberIds.includes(profile.id);
                          return (
                            <TouchableOpacity
                              key={`pick-${profile.id}`}
                              style={[
                                styles.groupMemberOption,
                                selected && styles.groupMemberSelected,
                              ]}
                              onPress={() => toggleGroupMember(profile.id)}
                            >
                              <Text style={styles.groupMemberOptionText}>
                                {selected ? '✓ ' : '+ '}
                                {profile.display_name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                        <TouchableOpacity
                          style={[styles.primary, creatingGroup && styles.disabled]}
                          onPress={() => void createGroup()}
                          disabled={creatingGroup}
                        >
                          <Text style={styles.primaryText}>
                            {creatingGroup ? 'Erstellen …' : 'Gruppe erstellen'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {groups.map((group) => (
                      <TouchableOpacity
                        key={group.id}
                        style={[
                          styles.profileRow,
                          selectedGroup?.id === group.id && styles.profileActive,
                        ]}
                        onPress={() => {
                          setSelectedProfile(null);
                          setSelectedGroup(group);
                          setGroupCreatorOpen(false);
                          setReportedUserId(null);
                          setReportedMessageId(null);
                          setReportReason('');
                        }}
                      >
                        <Text style={styles.profileName}>◉ {group.name}</Text>
                        <Text style={styles.conversationPreview} numberOfLines={1}>
                          {lastMessages[`group:${group.id}`] ?? 'Noch keine Nachrichten'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {profiles.map((profile) => (
                      <TouchableOpacity
                        key={profile.id}
                        style={[
                          styles.profileRow,
                          selectedProfile?.id === profile.id && styles.profileActive,
                        ]}
                        onPress={() => {
                          setSelectedProfile(profile);
                          setSelectedGroup(null);
                          setReportedUserId(null);
                          setReportedMessageId(null);
                          setReportReason('');
                        }}
                      >
                        <Text style={styles.profileName}>
                          {profile.display_name}
                          {profile.role !== 'user' ? ' ✓' : ''}
                        </Text>
                        <Text style={styles.profileHandle}>@{profile.handle}</Text>
                        {reportedUserIds.includes(profile.id) && (
                          <Text style={styles.reportedSessionBadge}>
                            In dieser Sitzung gemeldet
                          </Text>
                        )}
                        <Text style={styles.conversationPreview} numberOfLines={1}>
                          {lastMessages[`user:${profile.id}`] ?? 'Nachricht schreiben'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                {userTab === 'blocked' && (
                  <ScrollView>
                    {(status.startsWith('Blockierung') || status.includes('blockiert')) && (
                      <Text style={[
                        styles.blockedStatus,
                        status.startsWith('Blockierung aufgehoben') ||
                        status.startsWith('Nutzer wurde blockiert')
                          ? styles.blockedStatusSuccess
                          : status.includes('konnte nicht')
                            ? styles.blockedStatusError
                            : styles.blockedStatusInfo,
                      ]}>
                        {status}
                      </Text>
                    )}
                    <View style={styles.blockedListHeader}>
                      <Text style={styles.blockedListTitle}>Blockierte Nutzer</Text>
                      <Text style={styles.blockedCount}>{blockedProfiles.length}</Text>
                    </View>
                    {blockedProfiles.length === 0 ? (
                      <Text style={styles.emptyBlockedText}>
                        Keine blockierten Nutzer.
                      </Text>
                    ) : (
                      blockedProfiles.map((profile) => (
                        <View key={profile.id} style={styles.blockedRow}>
                          <View style={styles.blockedInfo}>
                            <Text style={styles.profileName} numberOfLines={1}>
                              {profile.display_name}
                            </Text>
                            <Text style={styles.profileHandle} numberOfLines={1}>
                              @{profile.handle}
                            </Text>
                            {reportedUserIds.includes(profile.id) && (
                              <Text style={styles.reportedSessionBadge}>
                                In dieser Sitzung gemeldet
                              </Text>
                            )}
                          </View>
                          <TouchableOpacity
                            style={styles.unblockButton}
                            disabled={blockingUserId !== null}
                            onPress={() => void unblockUserById(profile.id)}
                          >
                            <Text style={styles.unblockText}>
                              {blockingUserId === profile.id ? 'Wird aufgehoben …' : 'Entblocken'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </ScrollView>
                )}

                {userTab === 'privacy' && (
                  <ScrollView contentContainerStyle={styles.privacyPane}>
                    <View style={styles.privacyCard}>
                      <Text style={styles.privacyTitle}>Transparente Datenkontrolle</Text>
                      <Text style={styles.privacyDesc}>
                        Kein Werbe-Tracking. Beim Löschen werden dein Profil, deine
                        Sperren, deine Meldungen und von dir gesendete Nachrichten
                        entfernt (fremde Nachrichten bleiben beim jeweiligen Absender;
                        das Auth-Login-Konto wird separat verwaltet). Chatbilder
                        werden privat gespeichert, nur Chatteilnehmern angezeigt und
                        bei der Datenlöschung mit entfernt.
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.exportButton}
                      onPress={() => void exportMyData()}
                    >
                      <Text style={styles.exportButtonText}>
                        Daten exportieren (JSON)
                      </Text>
                    </TouchableOpacity>

                    {!confirmDeleteAll ? (
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => setConfirmDeleteAll(true)}
                      >
                        <Text style={styles.deleteButtonText}>
                          Eigene Daten löschen
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.confirmBox}>
                        <Text style={styles.confirmText}>
                          Profil, gesendete Nachrichten, Sperren & Meldungen löschen?
                        </Text>
                        <View style={styles.confirmActions}>
                          <TouchableOpacity
                            style={styles.confirmYes}
                            onPress={() => void deleteMyData()}
                          >
                            <Text style={styles.confirmYesText}>Ja, löschen</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.confirmNo}
                            onPress={() => setConfirmDeleteAll(false)}
                          >
                            <Text style={styles.confirmNoText}>Abbrechen</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </ScrollView>
                )}
              </View>

              <View style={styles.chatPane}>
                {selectedProfile || selectedGroup ? (
                  <>
                    <View style={styles.chatHeader}>
                      <View>
                        <Text style={styles.profileName}>
                          {selectedGroup?.name ?? selectedProfile?.display_name}
                        </Text>
                        <Text style={styles.profileHandle}>
                          {selectedGroup
                            ? 'Gruppenchat'
                            : `@${selectedProfile?.handle ?? ''}`}
                        </Text>
                        {selectedProfile &&
                          reportedUserIds.includes(selectedProfile.id) && (
                            <Text style={styles.reportedSessionBadge}>
                              Nutzer in dieser Sitzung gemeldet
                            </Text>
                          )}
                      </View>
                      {(selectedProfile || reportedMessageId) && (
                        <View style={styles.chatActions}>
                          {selectedProfile && (
                            <TouchableOpacity
                              style={styles.secondary}
                              disabled={blockingUserId !== null}
                              onPress={isBlocked ? unblockUser : blockUser}
                            >
                              <Text style={styles.secondaryText}>
                                {blockingUserId === selectedProfile.id
                                  ? 'Bitte warten …'
                                  : isBlocked
                                    ? 'Entblocken'
                                    : 'Blockieren'}
                              </Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={styles.reportButton}
                            disabled={reportSubmitting}
                            onPress={() => void reportUser()}
                          >
                            <Text style={styles.reportText}>
                              {reportSubmitting ? 'Wird gesendet …' : 'Melden'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    <View style={styles.retentionRow}>
                      <Text style={styles.retentionLabel}>Ablaufzeit:</Text>
                      {(['off', '24h', '7d'] as RetentionOption[]).map((option) => (
                        <TouchableOpacity
                          key={option}
                          style={[
                            styles.retentionChip,
                            retention === option && styles.retentionChipActive,
                          ]}
                          onPress={() => setRetention(option)}
                        >
                          <Text
                            style={[
                              styles.retentionText,
                              retention === option && styles.retentionTextActive,
                            ]}
                          >
                            {option === 'off' ? 'Aus' : option}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {(selectedProfile || reportedMessageId) && (
                      <View>
                        <TextInput
                          style={styles.reportInput}
                          value={reportReason}
                          onChangeText={setReportReason}
                          placeholder="Meldegrund (3-500 Zeichen)"
                          placeholderTextColor="#71717A"
                          maxLength={500}
                        />
                        {reportedMessageId && (
                          <TouchableOpacity
                            disabled={reportSubmitting}
                            onPress={() => {
                              setReportedUserId(null);
                              setReportedMessageId(null);
                              setReportReason('');
                              setStatus('');
                            }}
                          >
                            <Text style={styles.messageAction}>Meldung abbrechen</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                    <View style={styles.messageListWrap}>
                      <ScrollView
                        ref={messageScrollRef}
                        style={styles.messageList}
                        contentContainerStyle={styles.messageContent}
                        scrollEventThrottle={16}
                        onScroll={(event) => {
                          const {
                            contentOffset,
                            contentSize,
                            layoutMeasurement,
                          } = event.nativeEvent;
                          const shouldShowButton =
                            contentSize.height -
                              contentOffset.y -
                              layoutMeasurement.height >
                            100;
                          shouldAutoScrollToLatestRef.current = !shouldShowButton;
                          setShowScrollToLatest((current) =>
                            current === shouldShowButton
                              ? current
                              : shouldShowButton,
                          );
                        }}
                        onContentSizeChange={() => {
                          if (shouldAutoScrollToLatestRef.current) {
                            messageScrollRef.current?.scrollToEnd({
                              animated: true,
                            });
                          }
                        }}
                      >
                      {messages.map((message, messageIndex) => {
                        const own = message.sender_id === session.user.id;
                        const previousMessage = messages[messageIndex - 1];
                        const nextMessage = messages[messageIndex + 1];
                        const sameSenderPrevious = Boolean(
                          previousMessage &&
                            previousMessage.sender_id === message.sender_id &&
                            Math.abs(
                              Date.parse(message.created_at) -
                                Date.parse(previousMessage.created_at),
                            ) <= MESSAGE_GROUP_WINDOW_MS,
                        );
                        const sameSenderNext = Boolean(
                          nextMessage &&
                            nextMessage.sender_id === message.sender_id &&
                            Math.abs(
                              Date.parse(nextMessage.created_at) -
                                Date.parse(message.created_at),
                            ) <= MESSAGE_GROUP_WINDOW_MS,
                        );
                        const isPending = message.id.startsWith('pending:');
                        const reactionPending =
                          isPending ||
                          pendingReactionKeys.includes(
                            `${message.id}:${session.user.id}`,
                          );
                        const readsForMessage = messageReads.filter(
                          (read) => read.message_id === message.id,
                        );
                        const groupReaders = readsForMessage
                          .filter((read) => read.user_id !== session.user.id)
                          .map(
                            (read) =>
                              profiles.find((profile) => profile.id === read.user_id)
                                ?.display_name ?? 'Mitglied',
                          );
                        const readReceipt = selectedGroup
                          ? groupReaders.length > 0
                            ? `Gesehen von ${groupReaders.slice(0, 2).join(', ')}${
                                groupReaders.length > 2
                                  ? ` +${groupReaders.length - 2}`
                                  : ''
                              }`
                            : 'Noch nicht gesehen'
                          : readsForMessage.some(
                                (read) => read.user_id === selectedProfile?.id,
                              )
                            ? 'Gesehen'
                            : 'Gesendet';
                        const imageUrl = messageImageUrls[message.id];
                        const imageError = messageImageErrors[message.id];
                        const imageLoading = loadingImageIds.includes(message.id);
                        const reactionsForMessage = messageReactions.filter(
                          (reaction) => reaction.message_id === message.id,
                        );
                        const repliedMessage = message.reply_to_message_id
                          ? messages.find(
                              (item) => item.id === message.reply_to_message_id,
                            )
                          : undefined;
                        const repliedSender = repliedMessage
                          ? repliedMessage.sender_id === session.user.id
                            ? 'Du'
                            : profiles.find(
                                (profile) => profile.id === repliedMessage.sender_id,
                              )?.display_name ?? 'Mitglied'
                          : null;
                        return (
                          <View
                            key={message.id}
                            style={[
                              styles.message,
                              own ? styles.own : styles.other,
                              sameSenderPrevious && styles.messageGrouped,
                              sameSenderPrevious
                                ? own
                                  ? styles.ownGrouped
                                  : styles.otherGrouped
                                : null,
                              sameSenderPrevious && !sameSenderNext
                                ? own
                                  ? styles.ownGroupEnd
                                  : styles.otherGroupEnd
                                : null,
                              !sameSenderPrevious && sameSenderNext
                                ? own
                                  ? styles.ownGroupStart
                                  : styles.otherGroupStart
                                : null,
                            ]}
                          >
                            {selectedGroup && !own && !sameSenderPrevious && (
                              <Text style={styles.messageSender}>
                                {profiles.find((profile) => profile.id === message.sender_id)
                                  ?.display_name ?? 'Mitglied'}
                              </Text>
                            )}
                            {message.reply_to_message_id && (
                              <View style={styles.replyQuote}>
                                <Text style={styles.replyQuoteLabel}>
                                  Antwort auf {repliedSender ?? 'nicht verfügbare Nachricht'}
                                </Text>
                                {repliedMessage && (
                                  <Text style={styles.replyQuoteText} numberOfLines={2}>
                                    {repliedMessage.body}
                                  </Text>
                                )}
                              </View>
                            )}
                            {message.image_path && (
                              <View style={styles.messageImageWrap}>
                                {imageUrl ? (
                                  <Image
                                    style={styles.messageImage}
                                    source={{ uri: imageUrl }}
                                    resizeMode="cover"
                                    accessibilityLabel="Chatbild"
                                    onLoadStart={() =>
                                      setLoadingImageIds((previous) =>
                                        previous.includes(message.id)
                                          ? previous
                                          : [...previous, message.id],
                                      )
                                    }
                                    onLoadEnd={() =>
                                      setLoadingImageIds((previous) =>
                                        previous.filter((id) => id !== message.id),
                                      )
                                    }
                                    onError={() => {
                                      setLoadingImageIds((previous) =>
                                        previous.filter((id) => id !== message.id),
                                      );
                                      setMessageImageErrors((previous) => ({
                                        ...previous,
                                        [message.id]: 'Bild konnte nicht geladen werden.',
                                      }));
                                    }}
                                  />
                                ) : null}
                                {imageLoading || (!imageUrl && !imageError) ? (
                                  <Text style={styles.imageLoadingText}>
                                    Bild wird geladen …
                                  </Text>
                                ) : null}
                                {imageError && (
                                  <View style={styles.imageErrorBox}>
                                    <Text style={styles.imageErrorText}>
                                      Bild konnte nicht geladen werden.
                                    </Text>
                                    <TouchableOpacity
                                      onPress={() => void retryMessageImage(message)}
                                      disabled={imageLoading}
                                    >
                                      <Text style={styles.imageRetryText}>
                                        Erneut laden
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                )}
                              </View>
                            )}
                            {!(message.image_path && message.body === 'Bild') && (
                              <Text style={styles.messageText}>{message.body}</Text>
                            )}
                            <View style={styles.reactionRow}>
                              {REACTION_OPTIONS.map((emoji) => {
                                const count = reactionsForMessage.filter(
                                  (reaction) => reaction.emoji === emoji,
                                ).length;
                                const reacted = reactionsForMessage.some(
                                  (reaction) =>
                                    reaction.user_id === session.user.id &&
                                    reaction.emoji === emoji,
                                );
                                return (
                                  <TouchableOpacity
                                    key={emoji}
                                    style={[
                                      styles.reactionChip,
                                      reacted && styles.reactionChipActive,
                                      reactionPending && styles.reactionChipPending,
                                    ]}
                                    accessibilityRole="button"
                                    accessibilityState={{
                                      selected: reacted,
                                      disabled: reactionPending,
                                    }}
                                    disabled={reactionPending}
                                    onPress={() =>
                                      void toggleReaction(message.id, emoji)
                                    }
                                  >
                                    <Text style={styles.reactionText}>
                                      {emoji}{count > 0 ? ` ${count}` : ''}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                            {(!sameSenderNext || isPending) && (
                              <View
                                style={[
                                  styles.messageMeta,
                                  own ? styles.messageMetaOwn : styles.messageMetaOther,
                                ]}
                              >
                                <Text style={styles.messageTimestamp}>
                                  {formatMessageTime(message.created_at)}
                                </Text>
                                {own && (
                                  <Text style={styles.readReceipt}>
                                    {isPending ? 'Wird gesendet…' : readReceipt}
                                  </Text>
                                )}
                              </View>
                            )}
                            {!own && (
                              <View style={styles.messageReportRow}>
                                <TouchableOpacity
                                  disabled={reportSubmitting}
                                  onPress={() => {
                                    setReportedUserId(message.sender_id);
                                    setReportedMessageId(message.id);
                                    if (reportReason.trim().length >= 3) {
                                      void reportUser(
                                        message.sender_id,
                                        message.id,
                                        reportReason,
                                      );
                                    } else {
                                      setStatus('Meldegrund eingeben und anschließend oben auf „Melden“ tippen.');
                                    }
                                  }}
                                >
                                  <Text style={styles.messageReport}>Nachricht melden</Text>
                                </TouchableOpacity>
                                {reportedMessageIds.includes(message.id) && (
                                  <Text style={styles.reportedSessionBadge}>
                                    In dieser Sitzung gemeldet
                                  </Text>
                                )}
                              </View>
                            )}
                            <View style={styles.messageActions}>
                              <TouchableOpacity
                                disabled={isBlocked || isPending}
                                onPress={() => {
                                  setReplyingTo(message);
                                  setStatus('');
                                }}
                              >
                                <Text style={[
                                  styles.messageAction,
                                  (isBlocked || isPending) && styles.disabledText,
                                ]}>
                                  Antworten
                                </Text>
                              </TouchableOpacity>
                              {own && (
                                <TouchableOpacity
                                  disabled={isPending || deletingMessageId !== null}
                                  onPress={() => setConfirmDeleteMessageId(message.id)}
                                >
                                  <Text style={[
                                    styles.messageDelete,
                                    (isPending || deletingMessageId !== null) &&
                                      styles.disabledText,
                                  ]}>
                                    Löschen
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                            {own && confirmDeleteMessageId === message.id && (
                              <View style={styles.deleteConfirmation}>
                                <Text style={styles.deleteConfirmText}>
                                  Nachricht endgültig löschen?
                                </Text>
                                <TouchableOpacity
                                  disabled={deletingMessageId !== null}
                                  onPress={() => void deleteOwnMessage(message)}
                                >
                                  <Text style={styles.messageDelete}>
                                    {deletingMessageId === message.id ? 'Löscht …' : 'Ja, löschen'}
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  disabled={deletingMessageId !== null}
                                  onPress={() => setConfirmDeleteMessageId(null)}
                                >
                                  <Text style={styles.messageAction}>Abbrechen</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </ScrollView>
                    {showScrollToLatest && messages.length > 0 && (
                      <TouchableOpacity
                        style={styles.scrollLatestButton}
                        onPress={() => {
                          shouldAutoScrollToLatestRef.current = true;
                          setShowScrollToLatest(false);
                          messageScrollRef.current?.scrollToEnd({ animated: true });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Zur neuesten Nachricht scrollen"
                      >
                        <Text style={styles.scrollLatestText}>↓ Neueste Nachricht</Text>
                      </TouchableOpacity>
                    )}
                    </View>
                    {typingUserIds.length > 0 && (
                      <View style={styles.typingIndicator} accessibilityLiveRegion="polite">
                        <View style={styles.typingDots}>
                          <View style={styles.typingDot} />
                          <View style={styles.typingDot} />
                          <View style={styles.typingDot} />
                        </View>
                        <Text style={styles.typingText}>{typingIndicatorText}</Text>
                      </View>
                    )}
                    <View style={styles.composerArea}>
                      {replyingTo && (
                        <View style={styles.replyComposer}>
                          <View style={styles.replyComposerText}>
                            <Text style={styles.replyQuoteLabel}>
                              Antwort auf {replyingTo.sender_id === session.user.id
                                ? 'eigene Nachricht'
                                : profiles.find(
                                    (profile) => profile.id === replyingTo.sender_id,
                                  )?.display_name ?? 'Mitglied'}
                            </Text>
                            <Text style={styles.replyQuoteText} numberOfLines={1}>
                              {replyingTo.body}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => setReplyingTo(null)}
                            accessibilityRole="button"
                            accessibilityLabel="Antwort abbrechen"
                          >
                            <Text style={styles.messageAction}>Abbrechen</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      <View style={styles.composer}>
                        {Platform.OS === 'web' && (
                          <TouchableOpacity
                            style={[
                              styles.imageButton,
                              (isBlocked || uploadingImage || sendingMessage) &&
                                styles.disabled,
                            ]}
                            onPress={chooseChatImage}
                            disabled={isBlocked || uploadingImage || sendingMessage}
                            accessibilityRole="button"
                            accessibilityLabel={
                              uploadingImage ? 'Bild wird hochgeladen' : 'Bild auswählen'
                            }
                          >
                            <Text style={styles.imageButtonText}>
                              {uploadingImage ? 'Lädt …' : 'Bild'}
                            </Text>
                          </TouchableOpacity>
                        )}
                        <TextInput
                          style={styles.messageInput}
                          value={messageDraft}
                          onChangeText={handleMessageDraftChange}
                          placeholder="Nachricht..."
                          placeholderTextColor="#71717A"
                          maxLength={1000}
                          editable={!isBlocked && !uploadingImage && !sendingMessage}
                        />
                        <TouchableOpacity
                          style={[
                            styles.send,
                            (isBlocked || uploadingImage || sendingMessage) &&
                              styles.disabled,
                          ]}
                          onPress={() => void sendMessage()}
                          disabled={
                            isBlocked ||
                            uploadingImage ||
                            sendingMessage ||
                            (!selectedProfile && !selectedGroup) ||
                            !messageDraft.trim()
                          }
                        >
                          <Text style={styles.primaryText}>
                            {sendingMessage ? 'Sendet …' : 'Senden'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.emptyChat}>
                    <Text style={styles.emptyText}>Nutzer auswählen</Text>
                  </View>
                )}
              </View>
            </View>
          )}
          {status !== '' && <Text style={styles.status}>{status}</Text>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Platform.OS === 'web' ? 24 : 10,
  },
  modal: {
    width: '100%',
    maxWidth: 760,
    height: Platform.OS === 'web' ? '82%' : '92%',
    maxHeight: 760,
    backgroundColor: '#121215',
    borderColor: '#27272A',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  close: { color: '#FB7185', fontSize: 12, fontWeight: '800' },
  auth: { gap: 8, padding: 4 },
  sectionTitle: { color: '#FFF', fontSize: 15, fontWeight: '900' },
  input: {
    backgroundColor: '#09090B',
    borderColor: '#27272A',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFF',
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  primary: {
    backgroundColor: '#E11D48',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
  secondary: {
    backgroundColor: '#27272A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryText: { color: '#E4E4E7', fontSize: 12, fontWeight: '800' },
  chatLayout: { flex: 1, flexDirection: 'row', gap: 10 },
  profileList: {
    width: Platform.OS === 'web' ? 245 : 155,
    backgroundColor: '#09090B',
    borderColor: '#27272A',
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
  },
  tabButton: {
    flex: 1,
    backgroundColor: '#18181B',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 3,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#E11D48',
  },
  tabText: {
    color: '#A1A1AA',
    fontSize: 9.5,
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#FFF',
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    backgroundColor: '#141418',
    borderRadius: 8,
    padding: 7,
    marginBottom: 6,
  },
  blockedInfo: {
    flex: 1,
    minWidth: 0,
  },
  blockedStatus: {
    borderRadius: 7,
    fontSize: 10,
    lineHeight: 15,
    marginBottom: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  blockedStatusSuccess: { backgroundColor: '#052E16', color: '#86EFAC' },
  blockedStatusError: { backgroundColor: '#450A0A', color: '#FDA4AF' },
  blockedStatusInfo: { backgroundColor: '#172554', color: '#BFDBFE' },
  blockedListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  blockedListTitle: { color: '#F4F4F5', fontSize: 12, fontWeight: '900' },
  blockedCount: { color: '#A1A1AA', fontSize: 10, fontWeight: '800' },
  reportedSessionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#422006',
    borderColor: '#A16207',
    borderRadius: 999,
    borderWidth: 1,
    color: '#FDE68A',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  unblockButton: {
    backgroundColor: '#27272A',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  unblockText: {
    color: '#F4F4F5',
    fontSize: 10,
    fontWeight: '800',
  },
  emptyBlockedText: {
    color: '#71717A',
    fontSize: 11,
    paddingVertical: 8,
  },
  privacyPane: {
    gap: 8,
    paddingTop: 2,
  },
  privacyCard: {
    backgroundColor: '#141418',
    borderColor: '#27272A',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  privacyTitle: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 3,
  },
  privacyDesc: {
    color: '#A1A1AA',
    fontSize: 10,
    lineHeight: 14,
  },
  exportButton: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  exportButtonText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
  },
  deleteButton: {
    backgroundColor: '#2A1215',
    borderColor: '#7F1D1D',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#FCA5A5',
    fontSize: 11,
    fontWeight: '800',
  },
  confirmBox: {
    backgroundColor: '#1C1012',
    borderColor: '#991B1B',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    gap: 6,
  },
  confirmText: {
    color: '#FECACA',
    fontSize: 10,
    lineHeight: 14,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 6,
  },
  confirmYes: {
    flex: 1,
    backgroundColor: '#DC2626',
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  confirmYesText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  confirmNo: {
    flex: 1,
    backgroundColor: '#27272A',
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  confirmNoText: {
    color: '#E4E4E7',
    fontSize: 10,
    fontWeight: '800',
  },
  logout: { color: '#FB7185', fontSize: 11, fontWeight: '800' },
  profileRow: { borderRadius: 8, padding: 8, marginBottom: 5 },
  profileActive: { backgroundColor: '#27272A' },
  profileName: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  profileHandle: { color: '#A1A1AA', fontSize: 11, marginTop: 2 },
  conversationPreview: {
    color: '#71717A',
    fontSize: 10,
    marginTop: 4,
  },
  newGroupButton: {
    backgroundColor: '#2A121B',
    borderColor: '#6B1730',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  newGroupText: { color: '#FDA4AF', fontSize: 11, fontWeight: '900' },
  groupCreator: {
    backgroundColor: '#141418',
    borderColor: '#33333D',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    gap: 6,
    marginBottom: 8,
  },
  groupNameInput: {
    backgroundColor: '#09090B',
    borderColor: '#27272A',
    borderWidth: 1,
    borderRadius: 7,
    color: '#FFF',
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 11,
  },
  groupPickerLabel: { color: '#A1A1AA', fontSize: 10, fontWeight: '800' },
  groupMemberOption: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  groupMemberSelected: { backgroundColor: '#3B1723' },
  groupMemberOptionText: { color: '#E4E4E7', fontSize: 11 },
  chatPane: { flex: 1, minWidth: 0 },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  chatActions: { flexDirection: 'row', gap: 6 },
  retentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  retentionLabel: {
    color: '#A1A1AA',
    fontSize: 11,
    fontWeight: '700',
  },
  retentionChip: {
    backgroundColor: '#18181B',
    borderColor: '#27272A',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  retentionChipActive: {
    backgroundColor: '#E11D48',
    borderColor: '#E11D48',
  },
  retentionText: {
    color: '#A1A1AA',
    fontSize: 10,
    fontWeight: '800',
  },
  retentionTextActive: {
    color: '#FFF',
  },
  reportButton: {
    backgroundColor: '#3F3F46',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  reportText: { color: '#FDE68A', fontSize: 11, fontWeight: '800' },
  reportInput: {
    backgroundColor: '#09090B',
    borderColor: '#27272A',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#FFF',
    marginBottom: 8,
  },
  messageListWrap: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: aspectTheme.radius.lg,
  },
  messageList: {
    flex: 1,
    backgroundColor: aspectTheme.colors.canvas,
    borderColor: aspectTheme.colors.border,
    borderWidth: 1,
    borderRadius: aspectTheme.radius.lg,
  },
  messageContent: {
    flexGrow: 1,
    padding: aspectTheme.spacing.md,
    gap: aspectTheme.spacing.xs,
  },
  message: {
    maxWidth: '84%',
    borderRadius: aspectTheme.radius.lg,
    paddingHorizontal: aspectTheme.spacing.md,
    paddingVertical: aspectTheme.spacing.sm,
  },
  own: {
    alignSelf: 'flex-end',
    backgroundColor: aspectTheme.colors.accent,
  },
  other: {
    alignSelf: 'flex-start',
    backgroundColor: aspectTheme.colors.surfacePressed,
  },
  messageGrouped: { marginTop: -aspectTheme.spacing.xs },
  ownGroupStart: { borderBottomRightRadius: aspectTheme.radius.xs },
  ownGrouped: {
    borderTopRightRadius: aspectTheme.radius.xs,
    borderBottomRightRadius: aspectTheme.radius.xs,
  },
  ownGroupEnd: { borderBottomRightRadius: aspectTheme.radius.lg },
  otherGroupStart: { borderBottomLeftRadius: aspectTheme.radius.xs },
  otherGrouped: {
    borderTopLeftRadius: aspectTheme.radius.xs,
    borderBottomLeftRadius: aspectTheme.radius.xs,
  },
  otherGroupEnd: { borderBottomLeftRadius: aspectTheme.radius.lg },
  messageText: {
    color: aspectTheme.colors.textPrimary,
    fontSize: aspectTheme.typography.bodyLarge,
    lineHeight: aspectTheme.typography.lineBody,
  },
  replyQuote: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderLeftWidth: 2,
    borderLeftColor: aspectTheme.colors.accentText,
    borderRadius: aspectTheme.radius.sm,
    paddingHorizontal: aspectTheme.spacing.sm,
    paddingVertical: aspectTheme.spacing.xs,
    marginBottom: aspectTheme.spacing.xs,
  },
  replyQuoteLabel: {
    color: aspectTheme.colors.accentText,
    fontSize: aspectTheme.typography.caption,
    fontWeight: aspectTheme.typography.weight.heavy,
  },
  replyQuoteText: {
    color: aspectTheme.colors.textSecondary,
    fontSize: aspectTheme.typography.caption,
    lineHeight: aspectTheme.typography.lineBody,
    marginTop: aspectTheme.spacing.xxs,
  },
  messageSender: {
    color: aspectTheme.colors.accentText,
    fontSize: aspectTheme.typography.caption,
    fontWeight: aspectTheme.typography.weight.heavy,
    marginBottom: aspectTheme.spacing.xxs,
  },
  messageActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: aspectTheme.spacing.md,
    marginTop: aspectTheme.spacing.xs,
  },
  messageAction: {
    color: aspectTheme.colors.textSecondary,
    fontSize: aspectTheme.typography.caption,
    fontWeight: aspectTheme.typography.weight.strong,
  },
  messageDelete: {
    color: aspectTheme.colors.status.error.text,
    fontSize: aspectTheme.typography.caption,
    fontWeight: aspectTheme.typography.weight.strong,
  },
  disabledText: { opacity: 0.55 },
  deleteConfirmation: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 5,
  },
  deleteConfirmText: { color: '#FECACA', fontSize: 9, fontWeight: '700' },
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: aspectTheme.spacing.xxs,
    marginTop: aspectTheme.spacing.xs,
  },
  reactionChip: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: aspectTheme.radius.pill,
    paddingHorizontal: aspectTheme.spacing.sm,
    paddingVertical: aspectTheme.spacing.xxs,
  },
  reactionChipActive: {
    borderColor: aspectTheme.colors.accentText,
    backgroundColor: aspectTheme.colors.accentSoft,
  },
  reactionChipPending: { opacity: 0.6 },
  reactionText: {
    color: aspectTheme.colors.textPrimary,
    fontSize: aspectTheme.typography.caption,
  },
  messageImageWrap: {
    width: 200,
    maxWidth: '100%',
    marginBottom: 4,
  },
  messageImage: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    backgroundColor: '#18181B',
  },
  imageLoadingText: {
    color: '#D4D4D8',
    fontSize: 10,
    paddingVertical: 5,
  },
  imageErrorBox: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 7,
    padding: 7,
    gap: 4,
  },
  imageErrorText: { color: '#FECACA', fontSize: 10 },
  imageRetryText: { color: '#FDA4AF', fontSize: 10, fontWeight: '800' },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: aspectTheme.spacing.xs,
    marginTop: aspectTheme.spacing.xs,
  },
  messageMetaOwn: { justifyContent: 'flex-end' },
  messageMetaOther: { justifyContent: 'flex-start' },
  messageTimestamp: {
    color: aspectTheme.colors.textMuted,
    fontSize: aspectTheme.typography.caption,
  },
  readReceipt: {
    color: aspectTheme.colors.accentText,
    fontSize: aspectTheme.typography.caption,
    fontWeight: aspectTheme.typography.weight.strong,
    textAlign: 'right',
  },
  messageReport: {
    color: aspectTheme.colors.status.review.text,
    fontSize: aspectTheme.typography.caption,
    fontWeight: aspectTheme.typography.weight.strong,
    marginTop: aspectTheme.spacing.xs,
  },
  messageReportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: aspectTheme.spacing.sm,
  },
  composerArea: { gap: aspectTheme.spacing.sm, marginTop: aspectTheme.spacing.md },
  replyComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: aspectTheme.spacing.sm,
    backgroundColor: aspectTheme.colors.surfacePressed,
    borderLeftWidth: 3,
    borderLeftColor: aspectTheme.colors.accent,
    borderRadius: aspectTheme.radius.md,
    paddingHorizontal: aspectTheme.spacing.md,
    paddingVertical: aspectTheme.spacing.sm,
  },
  replyComposerText: { flex: 1, minWidth: 0 },
  composer: { flexDirection: 'row', gap: aspectTheme.spacing.sm },
  imageButton: {
    backgroundColor: '#27272A',
    borderRadius: 999,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  imageButtonText: { color: '#E4E4E7', fontSize: 11, fontWeight: '800' },
  messageInput: {
    flex: 1,
    minHeight: 44,
    backgroundColor: aspectTheme.colors.canvas,
    borderColor: aspectTheme.colors.border,
    borderWidth: 1,
    borderRadius: aspectTheme.radius.pill,
    paddingHorizontal: aspectTheme.spacing.lg,
    color: aspectTheme.colors.textPrimary,
  },
  send: {
    backgroundColor: aspectTheme.colors.accent,
    borderRadius: aspectTheme.radius.pill,
    justifyContent: 'center',
    paddingHorizontal: aspectTheme.spacing.lg,
  },
  scrollLatestButton: {
    position: 'absolute',
    right: aspectTheme.spacing.md,
    bottom: aspectTheme.spacing.md,
    backgroundColor: aspectTheme.colors.surfaceRaised,
    borderColor: aspectTheme.colors.borderStrong,
    borderWidth: 1,
    borderRadius: aspectTheme.radius.pill,
    paddingHorizontal: aspectTheme.spacing.md,
    paddingVertical: aspectTheme.spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  scrollLatestText: {
    color: aspectTheme.colors.textPrimary,
    fontSize: aspectTheme.typography.label,
    fontWeight: aspectTheme.typography.weight.strong,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: aspectTheme.spacing.sm,
    backgroundColor: aspectTheme.colors.surface,
    borderRadius: aspectTheme.radius.pill,
    paddingHorizontal: aspectTheme.spacing.md,
    paddingVertical: aspectTheme.spacing.xs,
    marginTop: aspectTheme.spacing.xs,
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: aspectTheme.spacing.xxs,
  },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: aspectTheme.radius.pill,
    backgroundColor: aspectTheme.colors.accentText,
  },
  typingText: {
    color: aspectTheme.colors.textSecondary,
    fontSize: aspectTheme.typography.caption,
    fontWeight: aspectTheme.typography.weight.medium,
  },
  disabled: { opacity: 0.45 },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#71717A', fontSize: 13 },
  status: { color: '#FCA5A5', fontSize: 11, marginTop: 8 },
});