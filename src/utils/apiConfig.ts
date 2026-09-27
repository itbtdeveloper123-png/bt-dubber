// API Configuration Helper for Mobile & Desktop Environments

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  
  // 1. Check if user configured a custom remote/local server URL in settings (e.g., http://192.168.1.100:3000)
  try {
    const custom = localStorage.getItem('bt_custom_server_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
  } catch {}

  // 2. Default relative URL for web & Electron desktop
  return '';
}

export function setApiBaseUrl(url: string): void {
  try {
    if (!url || !url.trim()) {
      localStorage.removeItem('bt_custom_server_url');
    } else {
      let clean = url.trim();
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = `http://${clean}`;
      }
      localStorage.setItem('bt_custom_server_url', clean.replace(/\/+$/, ''));
    }
  } catch {}
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}
