/**
 * Top universities shown in the For You feed, keyed by email-domain slug
 * (the part before .edu.tr / .edu, after canonicalizeUniversitySlug).
 */
export const UNIVERSITY_CITY_BY_SLUG = {
  // istanbul
  bogazici: 'istanbul', // boun.edu.tr, bogazici.edu.tr
  itu: 'istanbul',
  istanbul: 'istanbul', // istanbul.edu.tr
  iu: 'istanbul', // ogr.iu.edu.tr
  ku: 'istanbul', // koc
  sabanciuniv: 'istanbul',
  bilgi: 'istanbul',
  yildiz: 'istanbul',
  marmara: 'istanbul',
  marun: 'istanbul', // marmara student mail
  bahcesehir: 'istanbul', // bau.edu.tr
  gsu: 'istanbul',
  msgsu: 'istanbul',
  yeditepe: 'istanbul',

  // ankara
  metu: 'ankara',
  odtu: 'ankara',
  hacettepe: 'ankara',
  ankara: 'ankara', // ankara.edu.tr
  bilkent: 'ankara',
  gazi: 'ankara',
  cankaya: 'ankara',
  etu: 'ankara', // tobb etu

  // izmir
  ege: 'izmir',
  deu: 'izmir', // dokuz eylul
  iyte: 'izmir',
  yasar: 'izmir',

  // eskisehir
  anadolu: 'eskisehir',
  ogu: 'eskisehir', // osmangazi
  eskisehir: 'eskisehir', // estu (eskisehir.edu.tr)

  // bursa
  uludag: 'bursa',
};
