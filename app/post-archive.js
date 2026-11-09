import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PostCard from '../components/PostCard';
import { useTheme } from '../contexts/ThemeContext';
import { auth, db } from '../firebase/firebaseConfig';
import { isVisiblePost } from '../utils/deletedUserUtils';
import { formatArchivePostMeta } from '../utils/postArchiveUtils';

const GRID_GAP = 8;
const GRID_PADDING = 20;
function ArchivePostTile({ post, cellSize, styles, colors, onPress, metaLabel }) {
  const mainUri = post.photoURL || post.selfiePhotoURL;
  const pipUri = post.photoURL && post.selfiePhotoURL ? post.selfiePhotoURL : null;
  const drinks = Array.isArray(post.drinks) ? post.drinks : [];
  const pipWidth = Math.max(22, Math.round(cellSize * 0.26));
  const pipHeight = Math.max(28, Math.round(cellSize * 0.34));
  const pipOffset = Math.max(4, Math.round(cellSize * 0.06));

  return (
    <Pressable style={[styles.tile, { width: cellSize }]} onPress={() => onPress(post)}>
      <View style={[styles.photoFrame, { width: cellSize, height: cellSize }]}>
        {mainUri ? (
          <Image source={{ uri: mainUri }} style={styles.photo} contentFit="cover" />
        ) : (
          <View style={styles.photoFallback}>
            <Ionicons name="image-outline" size={22} color={colors.textMuted} />
          </View>
        )}
        {pipUri ? (
          <View
            style={[
              styles.selfieWrap,
              {
                top: pipOffset,
                left: pipOffset,
                width: pipWidth,
                height: pipHeight,
              },
            ]}
          >
            <Image source={{ uri: pipUri }} style={styles.selfiePhoto} contentFit="cover" />
          </View>
        ) : null}
      </View>

      {drinks.length > 0 ? (
        <View style={styles.drinksRow}>
          {drinks.map((drink, index) => (
            <Text key={`${drink.type}-${index}`} style={styles.drinkText} numberOfLines={1}>
              {drink.emoji}×{drink.quantity}
            </Text>
          ))}
        </View>
      ) : null}

      {metaLabel ? (
        <Text style={styles.metaText} numberOfLines={2}>
          {metaLabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default function PostArchive() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const uid = auth.currentUser?.uid;

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);

  const gridColumns = useMemo(() => {
    const width = Dimensions.get('window').width;
    return width >= 390 ? 4 : 3;
  }, []);

  const cellSize = useMemo(() => {
    const width = Dimensions.get('window').width;
    return Math.floor(
      (width - GRID_PADDING * 2 - GRID_GAP * (gridColumns - 1)) / gridColumns
    );
  }, [gridColumns]);

  useFocusEffect(
    useCallback(() => {
      if (!uid) {
        router.replace('/login');
        return undefined;
      }

      setLoading(true);
      const q = query(
        collection(db, 'posts'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc')
      );

      const unsub = onSnapshot(
        q,
        (snapshot) => {
          setPosts(
            snapshot.docs
              .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
              .filter(isVisiblePost)
          );
          setLoading(false);
        },
        () => setLoading(false)
      );

      return unsub;
    }, [uid, router])
  );

  const rows = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < posts.length; i += gridColumns) {
      chunks.push(posts.slice(i, i + gridColumns));
    }
    return chunks;
  }, [posts, gridColumns]);

  const renderRow = ({ item: rowPosts }) => (
    <View style={styles.gridRow}>
      {rowPosts.map((post) => (
        <ArchivePostTile
          key={post.id}
          post={post}
          cellSize={cellSize}
          styles={styles}
          colors={colors}
          metaLabel={formatArchivePostMeta(post, i18n.language)}
          onPress={setSelectedPost}
        />
      ))}
      {rowPosts.length < gridColumns
        ? Array.from({ length: gridColumns - rowPosts.length }).map((_, index) => (
            <View key={`spacer-${index}`} style={{ width: cellSize }} />
          ))
        : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('archive')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('archiveEmpty')}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(_, index) => `row-${index}`}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={!!selectedPost}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedPost(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setSelectedPost(null)} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
          {selectedPost ? (
            <ScrollView
              contentContainerStyle={styles.modalScroll}
              showsVerticalScrollIndicator={false}
            >
              <PostCard
                post={selectedPost}
                onDeleted={() => setSelectedPost(null)}
              />
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    backButton: {
      width: 40,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
    headerSpacer: {
      width: 40,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    emptyText: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: 'center',
    },
    listContent: {
      paddingHorizontal: GRID_PADDING,
      paddingTop: 16,
      paddingBottom: 32,
    },
    gridRow: {
      flexDirection: 'row',
      gap: GRID_GAP,
      marginBottom: 14,
    },
    tile: {
      gap: 4,
    },
    photoFrame: {
      position: 'relative',
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: colors.panelSoft,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    photo: {
      width: '100%',
      height: '100%',
    },
    selfieWrap: {
      position: 'absolute',
      borderRadius: 6,
      borderWidth: 2,
      borderColor: '#000',
      overflow: 'hidden',
      backgroundColor: '#111',
    },
    selfiePhoto: {
      width: '100%',
      height: '100%',
    },
    photoFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.panelSoft,
    },
    drinksRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      minHeight: 14,
    },
    drinkText: {
      fontSize: 10,
      color: colors.textPrimary,
      fontWeight: '600',
    },
    metaText: {
      fontSize: 10,
      color: colors.textMuted,
      fontStyle: 'italic',
      lineHeight: 13,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalHeader: {
      alignItems: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    modalScroll: {
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
  });
}
