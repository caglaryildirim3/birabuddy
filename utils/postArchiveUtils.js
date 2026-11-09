export function formatArchiveDate(createdAt, locale = 'en') {
  if (!createdAt) return '';

  const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';

  const day = String(date.getDate()).padStart(2, '0');
  const month = date
    .toLocaleDateString(locale, { month: 'short' })
    .toLowerCase()
    .replace(/\./g, '');
  const weekday = date
    .toLocaleDateString(locale, { weekday: 'short' })
    .toLowerCase()
    .replace(/\./g, '');

  return `${day}/${month} ${weekday}`;
}

export function formatArchivePostMeta(post, locale = 'en') {
  const parts = [];

  const dateLabel = formatArchiveDate(post?.createdAt, locale);
  if (dateLabel) parts.push(dateLabel);

  const venueTag = (post?.venueTag || '').trim();
  if (venueTag) parts.push(venueTag.toLowerCase());

  return parts.join(', ');
}
