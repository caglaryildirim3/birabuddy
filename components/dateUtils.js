// dateUtils.js
export const formatDate = (dateField) => {
  if (!dateField) return 'No Date';

  // 1. If it's already a string (Old Data), just return it
  if (typeof dateField === 'string') {
    return dateField;
  }

  // 2. If it's a Firebase Timestamp (New Data), convert it
  // Check if .toDate exists to avoid crashes
  if (dateField.toDate) {
    const date = dateField.toDate();
    return date.toLocaleDateString('en-GB'); // Formats to DD/MM/YYYY automatically
  }

  return 'Invalid Date';
};