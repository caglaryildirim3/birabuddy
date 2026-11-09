export function parseRoomDateTime(dateVal, timeStr) {
  if (!dateVal) return null;

  let base = null;

  if (dateVal.toDate) {
    base = new Date(dateVal.toDate().getTime());
  } else if (typeof dateVal === 'string') {
    base = timeStr ? new Date(`${dateVal}T${timeStr}`) : new Date(dateVal);
  }

  if (!base || Number.isNaN(base.getTime())) return null;

  if (dateVal.toDate && timeStr && typeof timeStr === 'string') {
    const [hours, minutes] = timeStr.split(':').map((v) => parseInt(v, 10));
    if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
      base.setHours(hours, minutes, 0, 0);
    }
  }

  return base;
}

export function formatRelativeTime(timestamp, labels = {}) {
  const {
    justNow = 'just now',
    minutesAgo = (n) => `${n}m ago`,
    hoursAgo = (n) => `${n}h ago`,
    daysAgo = (n) => `${n}d ago`,
  } = labels;

  if (!timestamp) return justNow;

  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return justNow;
  if (minutes < 60) return minutesAgo(minutes);
  if (hours < 24) return hoursAgo(hours);
  return daysAgo(days);
}

export function formatDateTimeShort(dateVal, timeStr, { unknownLabel = 'unknown', appendTime = false } = {}) {
  if (!dateVal) return unknownLabel;

  const dateObj = parseRoomDateTime(dateVal, timeStr);
  if (!dateObj) return unknownLabel;

  const formatted = dateObj.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return appendTime ? `${formatted} • ${timeStr}` : formatted;
}
