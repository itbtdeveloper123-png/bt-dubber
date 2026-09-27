// Utility for tracking and managing Google Gemini API daily request usage (RPD)

export interface QuotaStats {
  date: string;
  count: number;
  limit: number;
  remaining: number;
  percent: number;
  status: 'safe' | 'warning' | 'danger';
}

const DEFAULT_DAILY_LIMIT = 1500; // Standard Google AI Studio Free Tier RPD

function getTodayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function getDailyUsage(keyType: 'translation' | 'voice' = 'translation'): QuotaStats {
  const today = getTodayString();
  const dateKey = `gemini_quota_${keyType}_date`;
  const countKey = `gemini_quota_${keyType}_count`;
  const limitKey = `gemini_quota_${keyType}_limit`;

  let storedDate = '';
  let count = 0;
  let limit = DEFAULT_DAILY_LIMIT;

  try {
    storedDate = localStorage.getItem(dateKey) || '';
    const storedCount = localStorage.getItem(countKey);
    const storedLimit = localStorage.getItem(limitKey);

    if (storedLimit) {
      const parsedLimit = parseInt(storedLimit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) limit = parsedLimit;
    }

    if (storedDate !== today) {
      // New day: reset count
      count = 0;
      localStorage.setItem(dateKey, today);
      localStorage.setItem(countKey, '0');
    } else if (storedCount) {
      count = parseInt(storedCount, 10) || 0;
    }
  } catch (err) {
    console.error('Error reading quota from localStorage:', err);
  }

  const remaining = Math.max(0, limit - count);
  const percent = Math.min(100, Math.round((count / limit) * 1000) / 10);

  let status: 'safe' | 'warning' | 'danger' = 'safe';
  if (percent >= 90 || remaining <= 0) {
    status = 'danger';
  } else if (percent >= 75) {
    status = 'warning';
  }

  return {
    date: today,
    count,
    limit,
    remaining,
    percent,
    status
  };
}

export function incrementDailyUsage(keyType: 'translation' | 'voice' = 'translation', amount: number = 1): QuotaStats {
  const today = getTodayString();
  const dateKey = `gemini_quota_${keyType}_date`;
  const countKey = `gemini_quota_${keyType}_count`;

  let count = 0;
  try {
    const storedDate = localStorage.getItem(dateKey);
    if (storedDate !== today) {
      localStorage.setItem(dateKey, today);
      count = amount;
    } else {
      const storedCount = parseInt(localStorage.getItem(countKey) || '0', 10) || 0;
      count = storedCount + amount;
    }
    localStorage.setItem(countKey, String(count));

    // Dispatch global event for live reactive UI updates across all components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gemini_quota_updated', {
        detail: { keyType, count }
      }));
    }
  } catch (err) {
    console.error('Error incrementing quota in localStorage:', err);
  }

  return getDailyUsage(keyType);
}

export function resetDailyUsage(keyType: 'translation' | 'voice' = 'translation'): QuotaStats {
  const today = getTodayString();
  try {
    localStorage.setItem(`gemini_quota_${keyType}_date`, today);
    localStorage.setItem(`gemini_quota_${keyType}_count`, '0');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gemini_quota_updated', { detail: { keyType, count: 0 } }));
    }
  } catch (err) {
    console.error('Error resetting quota:', err);
  }
  return getDailyUsage(keyType);
}

export function setDailyLimit(keyType: 'translation' | 'voice' = 'translation', limit: number): QuotaStats {
  try {
    localStorage.setItem(`gemini_quota_${keyType}_limit`, String(limit));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gemini_quota_updated', { detail: { keyType } }));
    }
  } catch (err) {
    console.error('Error setting custom limit:', err);
  }
  return getDailyUsage(keyType);
}
