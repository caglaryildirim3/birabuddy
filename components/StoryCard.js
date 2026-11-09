import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { DRINKS } from '../constants/drinks';
import { selfieFlipStyle } from '../constants/selfieDisplay';

// 9:16 story ratio, scaled down 0.3× to keep memory reasonable
const STORY_W = 1080 * 0.3;
const STORY_H = 1920 * 0.3;

const SELFIE_W = STORY_W * 0.28;
const SELFIE_H = (SELFIE_W / 3) * 4; // 3:4 aspect ratio

// Build a map { category -> emoji } from the DRINKS constant
const CATEGORY_EMOJI = {};
DRINKS.forEach(({ category, emoji }) => {
  if (category && emoji) CATEGORY_EMOJI[category] = emoji;
});

function getDrinkEmoji(drink) {
  if (drink.emoji) return drink.emoji;
  if (drink.category && CATEGORY_EMOJI[drink.category]) return CATEGORY_EMOJI[drink.category];
  return '🍺';
}

const StoryCard = forwardRef(function StoryCard({ post, mainShowsPrimary = true }, ref) {
  const backUri = post?.photoURL;
  const selfieUri = post?.selfiePhotoURL;
  const mainUri = mainShowsPrimary ? backUri : selfieUri;
  const pipUri = mainShowsPrimary ? selfieUri : backUri;
  const hasMain = Boolean(mainUri);
  const hasPip = Boolean(pipUri);
  const hasDrinks = Array.isArray(post?.drinks) && post.drinks.length > 0;
  const hasVenue = Boolean(post?.venueTag);
  const mainIsSelfie = !mainShowsPrimary;
  const pipIsSelfie = mainShowsPrimary;

  return (
    // Rendered off-screen — never visible to the user
    <View style={styles.offScreen}>
      <ViewShot
        ref={ref}
        options={{ format: 'png', quality: 1, result: 'tmpfile' }}
        style={styles.card}
      >
        {/* ── BACKGROUND ── */}
        {hasMain ? (
          <Image
            source={{ uri: mainUri }}
            style={[StyleSheet.absoluteFill, mainIsSelfie && selfieFlipStyle]}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.solidBg]} />
        )}

        {/* Gradient over bottom third */}
        <LinearGradient
          colors={['transparent', 'transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']}
          locations={[0, 0.45, 0.72, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* ── SELFIE OVERLAY — top-left ── */}
        {hasPip ? (
          <View style={styles.selfieWrapper}>
            <Image
              source={{ uri: pipUri }}
              style={[styles.selfieImage, pipIsSelfie && selfieFlipStyle]}
              contentFit="cover"
            />
          </View>
        ) : null}

        {/* ── BOTTOM AREA (over gradient) ── */}
        <View style={styles.bottomArea}>
          {/* Wordmark */}
          <Text style={styles.wordmark}>birabuddy</Text>

          {/* Venue row */}
          {hasVenue ? (
            <View style={styles.venueRow}>
              <Ionicons name="location-outline" size={10} color="rgba(255,255,255,0.8)" />
              <Text style={styles.venueText} numberOfLines={1}>
                {post.venueTag}
              </Text>
            </View>
          ) : null}

          {/* Drink pills */}
          {hasDrinks ? (
            <View style={styles.drinkPillsWrap}>
              {post.drinks.map((drink, i) => (
                <View key={`${drink.type || drink.category}-${i}`} style={styles.drinkPill}>
                  <Text style={styles.drinkPillText}>
                    {getDrinkEmoji(drink)}×{drink.quantity}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ViewShot>
    </View>
  );
});

export default StoryCard;

const styles = StyleSheet.create({
  offScreen: {
    position: 'absolute',
    left: -9999,
    top: -9999,
  },
  card: {
    width: STORY_W,
    height: STORY_H,
    backgroundColor: '#0a0a0a',
    overflow: 'hidden',
  },
  solidBg: {
    backgroundColor: '#0a0a0a',
  },

  // Selfie overlay
  selfieWrapper: {
    position: 'absolute',
    top: 20,
    left: 20,
    width: SELFIE_W,
    height: SELFIE_H,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#000000',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 6,
  },
  selfieImage: {
    width: '100%',
    height: '100%',
  },

  // Bottom branded area
  bottomArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingBottom: 40,
  },
  wordmark: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFC629',
    letterSpacing: -0.3,
    marginBottom: 5,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: 5,
  },
  venueText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    flexShrink: 1,
  },
  drinkPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  drinkPill: {
    backgroundColor: 'rgba(255,198,41,0.18)',
    borderRadius: 7,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,198,41,0.45)',
  },
  drinkPillText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '500',
  },
});
