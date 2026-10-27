export const NEIGHBORHOODS_BY_CITY = {
  istanbul: ['hisarustu', 'besiktas', 'kadikoy', 'cihangir', 'taksim', 'bomonti', 'karakoy'],
  ankara: ['cankaya', 'kizilay', 'tunali', 'bahcelievler', 'bilkent'],
  izmir: ['alsancak', 'karsiyaka', 'bornova', 'guzelyali', 'bostanli'],
  bursa: ['nilufer', 'osmangazi', 'gorkle', 'mudanya', 'fsm'],
  antalya: ['konyaalti', 'lara', 'muratpasa', 'kepez', 'kaleici'],
};

export const CITIES = Object.keys(NEIGHBORHOODS_BY_CITY);
export const ALL_NEIGHBORHOODS = Object.values(NEIGHBORHOODS_BY_CITY).flat();

/** Approximate neighborhood centers for map markers (not exact venue locations). */
export const NEIGHBORHOOD_COORDINATES = {
  hisarustu: { latitude: 41.086, longitude: 29.046 },
  besiktas: { latitude: 41.042, longitude: 29.008 },
  kadikoy: { latitude: 40.99, longitude: 29.027 },
  cihangir: { latitude: 41.031, longitude: 28.985 },
  taksim: { latitude: 41.037, longitude: 28.985 },
  bomonti: { latitude: 41.058, longitude: 28.978 },
  karakoy: { latitude: 41.025, longitude: 28.975 },
  cankaya: { latitude: 39.92, longitude: 32.86 },
  kizilay: { latitude: 39.92, longitude: 32.854 },
  tunali: { latitude: 39.908, longitude: 32.861 },
  bahcelievler: { latitude: 39.928, longitude: 32.826 },
  bilkent: { latitude: 39.869, longitude: 32.748 },
  alsancak: { latitude: 38.437, longitude: 27.142 },
  karsiyaka: { latitude: 38.46, longitude: 27.118 },
  bornova: { latitude: 38.469, longitude: 27.221 },
  guzelyali: { latitude: 38.38, longitude: 27.08 },
  bostanli: { latitude: 38.462, longitude: 27.078 },
  nilufer: { latitude: 40.218, longitude: 28.978 },
  osmangazi: { latitude: 40.188, longitude: 29.061 },
  gorkle: { latitude: 40.195, longitude: 29.05 },
  mudanya: { latitude: 40.375, longitude: 28.882 },
  fsm: { latitude: 40.226, longitude: 28.985 },
  konyaalti: { latitude: 36.87, longitude: 30.635 },
  lara: { latitude: 36.855, longitude: 30.792 },
  muratpasa: { latitude: 36.887, longitude: 30.704 },
  kepez: { latitude: 36.92, longitude: 30.714 },
  kaleici: { latitude: 36.885, longitude: 30.707 },
};
