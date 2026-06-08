import { DRINKS } from '../constants/drinks';

function buildEmptyByCategory() {
  const byCategory = {};
  DRINKS.forEach((d) => {
    byCategory[d.category] = 0;
  });
  return byCategory;
}

function buildEmojiMap() {
  const map = {};
  DRINKS.forEach((d) => {
    map[d.category] = d.emoji;
  });
  return map;
}

const EMOJI_BY_CATEGORY = buildEmojiMap();

function postDate(post) {
  if (!post?.createdAt) return null;
  if (post.createdAt.toDate) return post.createdAt.toDate();
  return new Date(post.createdAt);
}

function isCurrentMonth(date) {
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function computePeriodStats(posts) {
  const byCategory = buildEmptyByCategory();
  const drinkTypeCounts = {};
  let totalNightsOut = 0;
  let totalDrinks = 0;

  posts.forEach((post) => {
    const drinks = Array.isArray(post.drinks) ? post.drinks : [];
    if (drinks.length === 0) return;

    totalNightsOut += 1;

    drinks.forEach((drink) => {
      const qty = Number(drink.quantity) || 0;
      if (qty <= 0) return;

      totalDrinks += qty;
      const category = drink.category || 'Other';

      if (byCategory[category] === undefined) {
        byCategory[category] = 0;
      }
      byCategory[category] += qty;

      const key = `${category}::${drink.type}`;
      if (!drinkTypeCounts[key]) {
        drinkTypeCounts[key] = {
          type: drink.type,
          category,
          emoji: drink.emoji || EMOJI_BY_CATEGORY[category] || '🍺',
          count: 0,
        };
      }
      drinkTypeCounts[key].count += qty;
    });
  });

  let topDrink = null;
  Object.values(drinkTypeCounts).forEach((entry) => {
    if (!topDrink || entry.count > topDrink.count) {
      topDrink = entry;
    }
  });

  let topCategory = null;
  Object.entries(byCategory).forEach(([category, total]) => {
    if (total <= 0) return;
    if (!topCategory || total > topCategory.total) {
      topCategory = {
        category,
        emoji: EMOJI_BY_CATEGORY[category] || '🍺',
        total,
      };
    }
  });

  const avgPerOuting =
    totalNightsOut > 0 ? Math.round((totalDrinks / totalNightsOut) * 10) / 10 : 0;

  return {
    totalNightsOut,
    totalDrinks,
    avgPerOuting,
    byCategory,
    topDrink,
    topCategory,
  };
}

export function calculateDrinkStats(posts = []) {
  const empty = {
    totalNightsOut: 0,
    totalDrinks: 0,
    avgPerOuting: 0,
    byCategory: buildEmptyByCategory(),
    topDrink: null,
    topCategory: null,
    thisMonth: {
      totalNightsOut: 0,
      totalDrinks: 0,
      avgPerOuting: 0,
      byCategory: buildEmptyByCategory(),
      topDrink: null,
      topCategory: null,
    },
  };

  if (!posts.length) return empty;

  const allTime = computePeriodStats(posts);
  const monthPosts = posts.filter((post) => isCurrentMonth(postDate(post)));
  const month = computePeriodStats(monthPosts);

  if (allTime.totalDrinks === 0) return empty;

  return {
    ...allTime,
    thisMonth: {
      totalNightsOut: month.totalNightsOut,
      totalDrinks: month.totalDrinks,
      avgPerOuting: month.avgPerOuting,
      byCategory: month.byCategory,
      topDrink: month.topDrink,
      topCategory: month.topCategory,
    },
  };
}

export const CATEGORY_COLORS = {
  Beer: '#FFC629',
  Shots: '#E53935',
  Cocktails: '#FF9800',
  Rakı: '#8D6E63',
  Wine: '#9C27B0',
  Spirits: '#5D4037',
  Other: '#42A5F5',
};
