export const NEIGHBORHOODS_BY_CITY = {
  istanbul: ['hisarustu', 'besiktas', 'kadikoy', 'cihangir', 'taksim', 'bomonti', 'karakoy'],
  ankara: ['cankaya', 'kizilay', 'tunali', 'bahcelievler', 'bilkent'],
  izmir: ['alsancak', 'karsiyaka', 'bornova', 'guzelyali', 'bostanli'],
  bursa: ['nilufer', 'osmangazi', 'gorkle', 'mudanya', 'fsm'],
  antalya: ['konyaalti', 'lara', 'muratpasa', 'kepez', 'kaleici'],
};

export const CITIES = Object.keys(NEIGHBORHOODS_BY_CITY);
export const ALL_NEIGHBORHOODS = Object.values(NEIGHBORHOODS_BY_CITY).flat();
