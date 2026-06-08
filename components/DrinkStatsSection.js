import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DRINKS } from '../constants/drinks';
import BeerColors from '../constants/BeerColors';
import { CATEGORY_COLORS } from '../utils/drinkStatsUtils';

const EMOJI_BY_CATEGORY = Object.fromEntries(DRINKS.map((d) => [d.category, d.emoji]));

function MetricCard({ label, value }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function InfoCard({ title, children }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoCardTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function DrinkStatsSection({ stats }) {
  const [period, setPeriod] = useState('all');

  const display = useMemo(() => {
    if (!stats) return null;
    if (period === 'month') {
      return {
        totalNightsOut: stats.thisMonth.totalNightsOut,
        totalDrinks: stats.thisMonth.totalDrinks,
        avgPerOuting: stats.thisMonth.avgPerOuting,
        byCategory: stats.thisMonth.byCategory,
        topDrink: stats.thisMonth.topDrink,
        topCategory: stats.thisMonth.topCategory,
      };
    }
    return {
      totalNightsOut: stats.totalNightsOut,
      totalDrinks: stats.totalDrinks,
      avgPerOuting: stats.avgPerOuting,
      byCategory: stats.byCategory,
      topDrink: stats.topDrink,
      topCategory: stats.topCategory,
    };
  }, [stats, period]);

  if (!stats || stats.totalDrinks === 0) {
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Drink Stats 🍺</Text>
        <Text style={styles.emptyText}>Log drinks on your posts to see your stats</Text>
      </View>
    );
  }

  const categories = Object.entries(display.byCategory)
    .filter(([, total]) => total > 0)
    .sort((a, b) => b[1] - a[1]);

  const avgDisplay =
    display.totalNightsOut > 0 ? display.avgPerOuting.toFixed(1) : '—';

  return (
    <View style={styles.sectionCard}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Drink Stats 🍺</Text>
        <View style={styles.toggle}>
          <Pressable
            style={[styles.toggleBtn, period === 'month' && styles.toggleBtnActive]}
            onPress={() => setPeriod('month')}
          >
            <Text style={[styles.toggleText, period === 'month' && styles.toggleTextActive]}>
              This month
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleBtn, period === 'all' && styles.toggleBtnActive]}
            onPress={() => setPeriod('all')}
          >
            <Text style={[styles.toggleText, period === 'all' && styles.toggleTextActive]}>
              All time
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <MetricCard label="Nights out" value={display.totalNightsOut} />
        <MetricCard label="Drinks total" value={display.totalDrinks} />
        <MetricCard label="Avg per night" value={avgDisplay} />
      </View>

      <View style={styles.topRow}>
        <InfoCard title="Go-to drink">
          {display.topDrink ? (
            <Text style={styles.infoCardValue}>
              {display.topDrink.emoji} {display.topDrink.type}
            </Text>
          ) : (
            <Text style={styles.dash}>—</Text>
          )}
        </InfoCard>
        <InfoCard title="Go-to category">
          {display.topCategory ? (
            <Text style={styles.infoCardValue}>
              {display.topCategory.emoji} {display.topCategory.category}
            </Text>
          ) : (
            <Text style={styles.dash}>—</Text>
          )}
        </InfoCard>
      </View>

      {display.totalDrinks > 0 ? (
        <View style={styles.breakdownSection}>
          <View style={styles.breakdownBar}>
            {categories.map(([category, total], index) => {
              const widthPct = (total / display.totalDrinks) * 100;
              const color = CATEGORY_COLORS[category] || BeerColors.accent;
              const isFirst = index === 0;
              const isLast = index === categories.length - 1;
              return (
                <View
                  key={category}
                  style={[
                    styles.breakdownSegment,
                    {
                      width: `${widthPct}%`,
                      backgroundColor: color,
                      borderTopLeftRadius: isFirst ? 8 : 0,
                      borderBottomLeftRadius: isFirst ? 8 : 0,
                      borderTopRightRadius: isLast ? 8 : 0,
                      borderBottomRightRadius: isLast ? 8 : 0,
                    },
                  ]}
                />
              );
            })}
          </View>
          <View style={styles.legendRow}>
            {categories.map(([category, total]) => (
              <Text key={category} style={styles.legendItem}>
                {EMOJI_BY_CATEGORY[category] || '🍺'} {total}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    backgroundColor: BeerColors.panel,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 8,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: BeerColors.panelElevated,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  toggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: BeerColors.accent,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: BeerColors.textSecondary,
  },
  toggleTextActive: {
    color: BeerColors.onAccent,
  },
  emptyText: {
    fontSize: 14,
    color: BeerColors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: BeerColors.panelElevated,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: BeerColors.textSecondary,
    textAlign: 'center',
  },
  topRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  infoCard: {
    flex: 1,
    backgroundColor: BeerColors.panelElevated,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: BeerColors.borderSoft,
    minHeight: 72,
  },
  infoCardTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: BeerColors.textSecondary,
    marginBottom: 6,
  },
  infoCardValue: {
    fontSize: 13,
    fontWeight: '600',
    color: BeerColors.textPrimary,
    lineHeight: 18,
  },
  dash: {
    fontSize: 18,
    color: BeerColors.textMuted,
    fontWeight: '600',
  },
  breakdownSection: {
    marginTop: 4,
  },
  breakdownBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: BeerColors.panelSoft,
  },
  breakdownSegment: {
    height: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  legendItem: {
    fontSize: 12,
    color: BeerColors.textSecondary,
    fontWeight: '500',
  },
});
