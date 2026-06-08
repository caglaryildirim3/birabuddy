import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LiveStatusDot from '../components/LiveStatusDot';
import UserProfile from '../components/UserProfile';
import BeerColors from '../constants/BeerColors';
import { auth, db } from '../firebase/firebaseConfig';
import {
  acceptFriendRequest,
  declineFriendRequest,
  getOtherUserId,
  unfriend,
} from '../utils/friendUtils';
import { subscribeToConversations } from '../utils/chatUtils';
import { isOutTonight } from '../utils/outTonightUtils';

const getUniversityFromEmail = (email) => {
  if (!email) return '';
  try {
    const domainPart = email.split('@')[1];
    if (domainPart) {
      let cleanDomain = domainPart.replace('std.', '').replace('mail.', '').replace('ogrenci.', '');
      let uniName = cleanDomain.replace('.edu.tr', '').replace('.edu', '');
      return uniName.toUpperCase() + ' UNIV.';
    }
  } catch (e) {
    return '';
  }
  return '';
};

async function fetchUserPreview(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    return { uid, name: 'Unknown', university: '', photoUrl: null };
  }
  const data = snap.data();
  const university = data.university || getUniversityFromEmail(data.email);
  const photoUrl = Array.isArray(data.photos) && data.photos[0] ? data.photos[0] : null;
  return {
    uid,
    name: data.name || data.nickname || data.instagram || 'User',
    university,
    photoUrl,
    isOut: isOutTonight(data),
    outNote: data.outTonightNote || null,
  };
}

function Avatar({ user, size = 44, onPress }) {
  const initial = (user.name || '?').charAt(0).toUpperCase();
  const radius = size / 2;

  const avatar = user.photoUrl ? (
    <Image
      source={{ uri: user.photoUrl }}
      style={{ width: size, height: size, borderRadius: radius }}
      contentFit="cover"
    />
  ) : (
    <View style={[styles.avatarPlaceholder, { width: size, height: size, borderRadius: radius }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );

  if (!onPress) return avatar;

  return (
    <Pressable onPress={() => onPress(user.uid)} hitSlop={6}>
      {avatar}
    </Pressable>
  );
}

function FriendName({ name, isOut, showStatus = false }) {
  return (
    <View style={styles.nameRow}>
      {showStatus ? <LiveStatusDot isLive={isOut} size={9} /> : null}
      <Text style={styles.listItemName}>{name}</Text>
    </View>
  );
}

const cleanInstagramHandle = (handle) => handle.replace(/[@\s]/g, '').toLowerCase();

export default function FriendsList() {
  const router = useRouter();
  const [segment, setSegment] = useState('friends');
  const [loading, setLoading] = useState(true);
  const [currentUid, setCurrentUid] = useState(null);
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [selectedUid, setSelectedUid] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [igSearch, setIgSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [chatPartners, setChatPartners] = useState({});
  const [chatsLoading, setChatsLoading] = useState(true);

  useEffect(() => {
    let unsub1 = null;
    let unsub2 = null;

    const authUnsub = onAuthStateChanged(auth, (user) => {
      if (unsub1) unsub1();
      if (unsub2) unsub2();
      unsub1 = null;
      unsub2 = null;

      if (!user) {
        setCurrentUid(null);
        setFriends([]);
        setIncoming([]);
        setOutgoing([]);
        setLoading(false);
        return;
      }

      setCurrentUid(user.uid);
      setLoading(true);

      const processFriendships = async (docs, uid) => {
        const accepted = [];
        const incomingList = [];
        const outgoingList = [];

        for (const d of docs) {
          const data = { id: d.id, ...d.data() };
          const otherUid = getOtherUserId(data, uid);

          if (data.status === 'accepted') {
            const preview = await fetchUserPreview(otherUid);
            accepted.push({ ...preview, docId: data.id });
          } else if (data.status === 'pending') {
            const preview = await fetchUserPreview(otherUid);
            if (data.requestedBy === uid) {
              outgoingList.push({ ...preview, docId: data.id });
            } else {
              incomingList.push({ ...preview, docId: data.id });
            }
          }
        }

        return { accepted, incomingList, outgoingList };
      };

      let docs1 = [];
      let docs2 = [];

      const mergeAndUpdate = async () => {
        const allDocs = [...docs1, ...docs2];
        const unique = new Map();
        allDocs.forEach((d) => unique.set(d.id, d));

        const { accepted, incomingList, outgoingList } = await processFriendships(
          Array.from(unique.values()),
          user.uid
        );

        setFriends(accepted);
        setIncoming(incomingList);
        setOutgoing(outgoingList);
        setLoading(false);
      };

      unsub1 = onSnapshot(
        query(collection(db, 'friendships'), where('user1Id', '==', user.uid)),
        (snap) => {
          docs1 = snap.docs;
          mergeAndUpdate();
        }
      );

      unsub2 = onSnapshot(
        query(collection(db, 'friendships'), where('user2Id', '==', user.uid)),
        (snap) => {
          docs2 = snap.docs;
          mergeAndUpdate();
        }
      );
    });

    return () => {
      authUnsub();
      if (unsub1) unsub1();
      if (unsub2) unsub2();
    };
  }, []);

  useEffect(() => {
    if (!friends.length) return undefined;

    const unsubs = friends.map((friend) =>
      onSnapshot(doc(db, 'users', friend.uid), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setFriends((prev) =>
          prev.map((f) =>
            f.uid === friend.uid
              ? {
                  ...f,
                  isOut: isOutTonight(data),
                  outNote: data.outTonightNote || null,
                }
              : f
          )
        );
      })
    );

    return () => unsubs.forEach((unsub) => unsub());
  }, [friends.map((f) => f.uid).join(',')]);

  useEffect(() => {
    if (!currentUid) {
      setConversations([]);
      setChatsLoading(false);
      return undefined;
    }

    setChatsLoading(true);
    const unsub = subscribeToConversations(
      currentUid,
      (nextConversations) => {
        setConversations(nextConversations);
        setChatsLoading(false);
      },
      () => setChatsLoading(false)
    );

    return unsub;
  }, [currentUid]);

  useEffect(() => {
    if (!currentUid || conversations.length === 0) {
      setChatPartners({});
      return undefined;
    }

    let cancelled = false;

    const loadPartners = async () => {
      const partners = {};
      await Promise.all(
        conversations.map(async (conv) => {
          const partnerUid = conv.user1Id === currentUid ? conv.user2Id : conv.user1Id;
          partners[conv.id] = await fetchUserPreview(partnerUid);
        })
      );
      if (!cancelled) setChatPartners(partners);
    };

    loadPartners();

    return () => {
      cancelled = true;
    };
  }, [conversations, currentUid]);

  const openChatWithFriend = (friend) => {
    router.push(`/friend-chat/${friend.uid}`);
  };

  const handleUnfriend = (item) => {
    Alert.alert('Unfriend', `Remove ${item.name} from your friends?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unfriend',
        style: 'destructive',
        onPress: async () => {
          setActionLoadingId(item.docId);
          try {
            await unfriend(item.docId);
          } catch (error) {
            Alert.alert('Error', 'Failed to unfriend');
          } finally {
            setActionLoadingId(null);
          }
        },
      },
    ]);
  };

  const handleAccept = async (item) => {
    setActionLoadingId(item.docId);
    try {
      await acceptFriendRequest(item.docId);
    } catch (error) {
      Alert.alert('Error', 'Failed to accept request');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDecline = async (item) => {
    setActionLoadingId(item.docId);
    try {
      await declineFriendRequest(item.docId);
    } catch (error) {
      Alert.alert('Error', 'Failed to decline request');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelOutgoing = (item) => {
    Alert.alert('Cancel Request', `Cancel friend request to ${item.name}?`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel',
        style: 'destructive',
        onPress: async () => {
          setActionLoadingId(item.docId);
          try {
            await declineFriendRequest(item.docId);
          } catch (error) {
            Alert.alert('Error', 'Failed to cancel request');
          } finally {
            setActionLoadingId(null);
          }
        },
      },
    ]);
  };

  const renderFriend = ({ item }) => (
    <View style={styles.listItem}>
      <Pressable
        style={styles.listItemMain}
        onPress={() => setSelectedUid(item.uid)}
        onLongPress={() => handleUnfriend(item)}
      >
        <Avatar user={item} onPress={setSelectedUid} />
        <View style={styles.listItemContent}>
          <FriendName name={item.name} isOut={item.isOut} showStatus />
          {item.isOut && item.outNote ? (
            <Text style={styles.outNoteSub}>{item.outNote}</Text>
          ) : item.university ? (
            <Text style={styles.listItemSub}>{item.university}</Text>
          ) : null}
        </View>
      </Pressable>
      {actionLoadingId === item.docId ? (
        <ActivityIndicator size="small" color={BeerColors.accent} />
      ) : (
        <Pressable style={styles.chatIconButton} onPress={() => openChatWithFriend(item)} hitSlop={8}>
          <Ionicons name="chatbubble-outline" size={20} color={BeerColors.accent} />
        </Pressable>
      )}
    </View>
  );

  const renderChat = ({ item }) => {
    const partner = chatPartners[item.id];
    if (!partner) {
      return (
        <View style={styles.listItem}>
          <ActivityIndicator size="small" color={BeerColors.accent} />
        </View>
      );
    }

    const isMe = item.lastSenderId === currentUid;
    const preview = item.lastMessage
      ? `${isMe ? 'You: ' : ''}${item.lastMessage}`
      : 'No messages yet';

    return (
      <Pressable style={styles.listItem} onPress={() => openChatWithFriend(partner)}>
        <Avatar user={partner} />
        <View style={styles.listItemContent}>
          <Text style={styles.listItemName}>{partner.name}</Text>
          <Text style={styles.chatPreview} numberOfLines={1}>
            {preview}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={BeerColors.textMuted} />
      </Pressable>
    );
  };

  const renderIncoming = ({ item }) => (
    <View style={styles.listItem}>
      <Pressable style={styles.listItemMain} onPress={() => setSelectedUid(item.uid)}>
        <Avatar user={item} onPress={setSelectedUid} />
        <View style={styles.listItemContent}>
          <Text style={styles.listItemName}>{item.name}</Text>
          {item.university ? (
            <Text style={styles.listItemSub}>{item.university}</Text>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.requestActions}>
        <Pressable
          style={styles.smallAcceptButton}
          onPress={() => handleAccept(item)}
          disabled={actionLoadingId === item.docId}
        >
          <Text style={styles.smallAcceptText}>Accept</Text>
        </Pressable>
        <Pressable
          style={styles.smallDeclineButton}
          onPress={() => handleDecline(item)}
          disabled={actionLoadingId === item.docId}
        >
          <Text style={styles.smallDeclineText}>Decline</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderOutgoing = ({ item }) => (
    <View style={styles.listItem}>
      <Pressable style={styles.listItemMain} onPress={() => setSelectedUid(item.uid)}>
        <Avatar user={item} onPress={setSelectedUid} />
        <View style={styles.listItemContent}>
          <Text style={styles.listItemName}>{item.name}</Text>
          {item.university ? (
            <Text style={styles.listItemSub}>{item.university}</Text>
          ) : null}
          <Text style={styles.outgoingLabel}>Request sent</Text>
        </View>
      </Pressable>
      <Pressable
        style={styles.cancelButton}
        onPress={() => handleCancelOutgoing(item)}
        disabled={actionLoadingId === item.docId}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </Pressable>
    </View>
  );

  const handleIgSearch = async () => {
    const handle = cleanInstagramHandle(igSearch);
    if (!handle) {
      Alert.alert('Error', 'Enter an Instagram username');
      return;
    }

    setSearching(true);
    setSearchResults([]);
    try {
      const q = query(collection(db, 'users'), where('instagram', '==', handle));
      const snap = await getDocs(q);
      const results = [];
      for (const d of snap.docs) {
        if (d.id === currentUid) continue;
        const preview = await fetchUserPreview(d.id);
        results.push(preview);
      }
      setSearchResults(results);
      if (results.length === 0) {
        Alert.alert('Not found', `No user with Instagram @${handle}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const renderAddFriend = () => (
    <View style={styles.addSection}>
      <Text style={styles.addTitle}>Add by Instagram</Text>
      <Text style={styles.addSubtext}>Search for a user by their Instagram username</Text>
      <View style={styles.searchRow}>
        <Text style={styles.atSign}>@</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="username"
          placeholderTextColor={BeerColors.textMuted}
          value={igSearch}
          onChangeText={setIgSearch}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={handleIgSearch}
        />
        <Pressable
          style={[styles.searchButton, searching && styles.searchButtonDisabled]}
          onPress={handleIgSearch}
          disabled={searching}
        >
          {searching ? (
            <ActivityIndicator size="small" color={BeerColors.onAccent} />
          ) : (
            <Text style={styles.searchButtonText}>Search</Text>
          )}
        </Pressable>
      </View>

      {searchResults.map((user) => (
        <Pressable
          key={user.uid}
          style={styles.listItem}
          onPress={() => setSelectedUid(user.uid)}
        >
          <Avatar user={user} onPress={setSelectedUid} />
          <View style={styles.listItemContent}>
            <Text style={styles.listItemName}>{user.name}</Text>
            <Text style={styles.listItemSub}>@{igSearch.replace(/[@\s]/g, '').toLowerCase()}</Text>
            {user.university ? (
              <Text style={styles.listItemSub}>{user.university}</Text>
            ) : null}
          </View>
          <Ionicons name="person-add-outline" size={20} color={BeerColors.accent} />
        </Pressable>
      ))}
    </View>
  );

  const renderRequests = () => {
    if (incoming.length === 0 && outgoing.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No pending requests</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={[...incoming, ...outgoing]}
        keyExtractor={(item) => item.docId}
        renderItem={({ item }) =>
          incoming.some((r) => r.docId === item.docId)
            ? renderIncoming({ item })
            : renderOutgoing({ item })
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={BeerColors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Friends</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.segmentBar}>
        <Pressable
          style={[styles.segment, segment === 'friends' && styles.segmentActive]}
          onPress={() => setSegment('friends')}
        >
          <Text style={[styles.segmentText, segment === 'friends' && styles.segmentTextActive]}>
            Friends {friends.length > 0 ? `(${friends.length})` : ''}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segment, segment === 'chats' && styles.segmentActive]}
          onPress={() => setSegment('chats')}
        >
          <Text style={[styles.segmentText, segment === 'chats' && styles.segmentTextActive]}>
            Chats {conversations.length > 0 ? `(${conversations.length})` : ''}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segment, segment === 'requests' && styles.segmentActive]}
          onPress={() => setSegment('requests')}
        >
          <Text style={[styles.segmentText, segment === 'requests' && styles.segmentTextActive]}>
            Requests {incoming.length + outgoing.length > 0 ? `(${incoming.length + outgoing.length})` : ''}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segment, segment === 'add' && styles.segmentActive]}
          onPress={() => setSegment('add')}
        >
          <Text style={[styles.segmentText, segment === 'add' && styles.segmentTextActive]}>
            Add
          </Text>
        </Pressable>
      </View>

      {loading && (segment === 'friends' || segment === 'requests') ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BeerColors.accent} />
        </View>
      ) : chatsLoading && segment === 'chats' ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BeerColors.accent} />
        </View>
      ) : segment === 'add' ? (
        renderAddFriend()
      ) : segment === 'chats' ? (
        conversations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No chats yet</Text>
            <Text style={styles.emptySubText}>Message a friend to start a conversation</Text>
            <Pressable style={styles.goAddButton} onPress={() => setSegment('friends')}>
              <Text style={styles.goAddButtonText}>Go to Friends</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            renderItem={renderChat}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : segment === 'friends' ? (
        friends.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No friends yet</Text>
            <Text style={styles.emptySubText}>Search by Instagram in the Add tab</Text>
            <Pressable style={styles.goAddButton} onPress={() => setSegment('add')}>
              <Text style={styles.goAddButtonText}>Add Friends</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={friends}
            keyExtractor={(item) => item.uid}
            renderItem={renderFriend}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : (
        renderRequests()
      )}

      <Modal visible={!!selectedUid} animationType="slide" presentationStyle="pageSheet">
        {selectedUid && (
          <UserProfile uid={selectedUid} onClose={() => setSelectedUid(null)} />
        )}
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BeerColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backButton: {
    padding: 4,
  },
  headerSpacer: {
    width: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
  },
  segmentBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: BeerColors.panel,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: BeerColors.accent,
    borderWidth: 1,
    borderColor: BeerColors.accent,
  },
  segmentText: {
    color: BeerColors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: BeerColors.onAccent,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BeerColors.panel,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  listItemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  listItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listItemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
  },
  listItemSub: {
    fontSize: 13,
    color: BeerColors.textSecondary,
    marginTop: 2,
  },
  chatPreview: {
    fontSize: 13,
    color: BeerColors.textMuted,
    marginTop: 4,
  },
  chatIconButton: {
    padding: 8,
    marginLeft: 8,
  },
  outgoingLabel: {
    fontSize: 12,
    color: BeerColors.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  avatarPlaceholder: {
    backgroundColor: BeerColors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: BeerColors.onAccent,
    fontWeight: 'bold',
  },
  outNoteSub: {
    fontSize: 13,
    color: '#2E7D32',
    marginTop: 2,
    fontWeight: '500',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  smallAcceptButton: {
    backgroundColor: BeerColors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  smallAcceptText: {
    color: BeerColors.onAccent,
    fontSize: 12,
    fontWeight: 'bold',
  },
  smallDeclineButton: {
    backgroundColor: BeerColors.panelElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  smallDeclineText: {
    color: BeerColors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: BeerColors.panelElevated,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  cancelButtonText: {
    color: BeerColors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
  },
  emptySubText: {
    fontSize: 14,
    color: BeerColors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  addSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  addTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
    marginBottom: 4,
  },
  addSubtext: {
    fontSize: 14,
    color: BeerColors.textSecondary,
    marginBottom: 16,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BeerColors.panelElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  atSign: {
    fontSize: 16,
    color: BeerColors.textMuted,
    marginRight: 4,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: BeerColors.textPrimary,
  },
  searchButton: {
    backgroundColor: BeerColors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginLeft: 8,
  },
  searchButtonDisabled: {
    opacity: 0.7,
  },
  searchButtonText: {
    color: BeerColors.onAccent,
    fontWeight: 'bold',
    fontSize: 14,
  },
  goAddButton: {
    marginTop: 16,
    backgroundColor: BeerColors.accent,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  goAddButtonText: {
    color: BeerColors.onAccent,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
