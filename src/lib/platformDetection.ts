export type BrowserType = 
  | 'safari'
  | 'chrome'
  | 'firefox'
  | 'edge'
  | 'samsung'
  | 'opera'
  | 'brave'
  | 'other';

export type OSType = 
  | 'ios'
  | 'android'
  | 'windows'
  | 'macos'
  | 'linux'
  | 'other';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface PlatformInfo {
  browser: BrowserType;
  browserVersion: string | null;
  os: OSType;
  osVersion: string | null;
  device: DeviceType;
  isStandalone: boolean;
  canInstallPWA: boolean;
  installMethod: 'prompt' | 'manual' | 'none';
}

export interface InstallInstructions {
  title: string;
  steps: {
    icon: string;
    text: string;
    highlight?: string;
  }[];
  note?: string;
  browserIcon: string;
}

/**
 * Detect the current platform (browser, OS, device)
 */
export function detectPlatform(): PlatformInfo {
  const ua = navigator.userAgent;
  const platform = navigator.platform || '';
  
  // Detect OS
  let os: OSType = 'other';
  let osVersion: string | null = null;
  
  if (/iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    os = 'ios';
    const match = ua.match(/OS (\d+[._]\d+)/);
    if (match) osVersion = match[1].replace('_', '.');
  } else if (/Android/.test(ua)) {
    os = 'android';
    const match = ua.match(/Android (\d+\.?\d*)/);
    if (match) osVersion = match[1];
  } else if (/Windows/.test(ua)) {
    os = 'windows';
    const match = ua.match(/Windows NT (\d+\.\d+)/);
    if (match) osVersion = match[1];
  } else if (/Mac OS X/.test(ua)) {
    os = 'macos';
    const match = ua.match(/Mac OS X (\d+[._]\d+)/);
    if (match) osVersion = match[1].replace('_', '.');
  } else if (/Linux/.test(ua)) {
    os = 'linux';
  }

  // Detect Browser
  let browser: BrowserType = 'other';
  let browserVersion: string | null = null;

  if (/SamsungBrowser/.test(ua)) {
    browser = 'samsung';
    const match = ua.match(/SamsungBrowser\/(\d+\.?\d*)/);
    if (match) browserVersion = match[1];
  } else if (/OPR|Opera/.test(ua)) {
    browser = 'opera';
    const match = ua.match(/(?:OPR|Opera)\/(\d+\.?\d*)/);
    if (match) browserVersion = match[1];
  } else if (/Edg/.test(ua)) {
    browser = 'edge';
    const match = ua.match(/Edg\/(\d+\.?\d*)/);
    if (match) browserVersion = match[1];
  } else if (/Firefox|FxiOS/.test(ua)) {
    browser = 'firefox';
    const match = ua.match(/(?:Firefox|FxiOS)\/(\d+\.?\d*)/);
    if (match) browserVersion = match[1];
  } else if (/CriOS/.test(ua)) {
    // Chrome on iOS
    browser = 'chrome';
    const match = ua.match(/CriOS\/(\d+\.?\d*)/);
    if (match) browserVersion = match[1];
  } else if (/Chrome/.test(ua) && !/Chromium/.test(ua)) {
    browser = 'chrome';
    const match = ua.match(/Chrome\/(\d+\.?\d*)/);
    if (match) browserVersion = match[1];
  } else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
    browser = 'safari';
    const match = ua.match(/Version\/(\d+\.?\d*)/);
    if (match) browserVersion = match[1];
  }

  // Check for Brave (reports as Chrome but has Brave in navigator)
  if ((navigator as any).brave?.isBrave) {
    browser = 'brave';
  }

  // Detect device type
  let device: DeviceType = 'desktop';
  if (/Mobile|Android/.test(ua) && !/Tablet|iPad/.test(ua)) {
    device = 'mobile';
  } else if (/Tablet|iPad/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    device = 'tablet';
  }

  // Check if running as standalone PWA
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       (window.navigator as any).standalone === true;

  // Determine PWA install capability
  let canInstallPWA = false;
  let installMethod: 'prompt' | 'manual' | 'none' = 'none';

  if (isStandalone) {
    // Already installed
    canInstallPWA = false;
    installMethod = 'none';
  } else if (os === 'ios') {
    // iOS only supports manual install via Safari
    canInstallPWA = browser === 'safari';
    installMethod = 'manual';
  } else if (os === 'android') {
    // Android supports install prompt in Chrome, Edge, Samsung, Opera
    canInstallPWA = ['chrome', 'edge', 'samsung', 'opera', 'brave'].includes(browser);
    installMethod = 'prompt';
  } else {
    // Desktop - Chrome, Edge support install prompt
    canInstallPWA = ['chrome', 'edge', 'brave'].includes(browser);
    installMethod = canInstallPWA ? 'prompt' : 'none';
  }

  return {
    browser,
    browserVersion,
    os,
    osVersion,
    device,
    isStandalone,
    canInstallPWA,
    installMethod,
  };
}

/**
 * Get platform-specific installation instructions
 */
export function getInstallInstructions(platform: PlatformInfo): InstallInstructions {
  const { browser, os, device } = platform;

  // iOS Safari
  if (os === 'ios' && browser === 'safari') {
    return {
      title: 'Install from Safari',
      browserIcon: '🧭',
      steps: [
        { icon: '📤', text: 'Tap the', highlight: 'Share button', },
        { icon: '➕', text: 'Scroll down and tap', highlight: '"Add to Home Screen"' },
        { icon: '✓', text: 'Tap', highlight: '"Add"', },
      ],
      note: 'The Share button is at the bottom of Safari (square with arrow)',
    };
  }

  // iOS Chrome
  if (os === 'ios' && browser === 'chrome') {
    return {
      title: 'Switch to Safari',
      browserIcon: '🔵',
      steps: [
        { icon: '📋', text: 'Copy this page URL' },
        { icon: '🧭', text: 'Open', highlight: 'Safari browser' },
        { icon: '📥', text: 'Paste URL and follow Safari install steps' },
      ],
      note: 'Chrome on iPhone uses Safari\'s engine but doesn\'t support Add to Home Screen. Use Safari instead.',
    };
  }

  // iOS Firefox
  if (os === 'ios' && browser === 'firefox') {
    return {
      title: 'Switch to Safari',
      browserIcon: '🦊',
      steps: [
        { icon: '📋', text: 'Copy this page URL' },
        { icon: '🧭', text: 'Open', highlight: 'Safari browser' },
        { icon: '📥', text: 'Paste URL and follow Safari install steps' },
      ],
      note: 'Firefox on iPhone doesn\'t support app installation. Please use Safari.',
    };
  }

  // iOS Other browsers
  if (os === 'ios') {
    return {
      title: 'Open in Safari',
      browserIcon: '📱',
      steps: [
        { icon: '📋', text: 'Copy this page URL' },
        { icon: '🧭', text: 'Open', highlight: 'Safari' },
        { icon: '📥', text: 'Follow the install instructions there' },
      ],
      note: 'Only Safari on iPhone supports installing web apps.',
    };
  }

  // Android Chrome
  if (os === 'android' && browser === 'chrome') {
    return {
      title: 'Install from Chrome',
      browserIcon: '🔵',
      steps: [
        { icon: '⋮', text: 'Tap the', highlight: 'menu (3 dots)', },
        { icon: '📥', text: 'Tap', highlight: '"Install app"', },
        { icon: '✓', text: 'Tap', highlight: '"Install"', },
      ],
      note: 'You may see an install banner at the bottom - just tap "Install"!',
    };
  }

  // Android Samsung Internet
  if (os === 'android' && browser === 'samsung') {
    return {
      title: 'Install from Samsung Internet',
      browserIcon: '🌐',
      steps: [
        { icon: '☰', text: 'Tap the', highlight: 'menu button', },
        { icon: '➕', text: 'Tap', highlight: '"Add page to"', },
        { icon: '🏠', text: 'Select', highlight: '"Home screen"', },
      ],
    };
  }

  // Android Firefox
  if (os === 'android' && browser === 'firefox') {
    return {
      title: 'Install from Firefox',
      browserIcon: '🦊',
      steps: [
        { icon: '⋮', text: 'Tap the', highlight: 'menu (3 dots)', },
        { icon: '📥', text: 'Tap', highlight: '"Install"', },
        { icon: '✓', text: 'Confirm installation' },
      ],
    };
  }

  // Android Edge
  if (os === 'android' && browser === 'edge') {
    return {
      title: 'Install from Edge',
      browserIcon: '🔷',
      steps: [
        { icon: '⋯', text: 'Tap the', highlight: 'menu (3 dots)', },
        { icon: '📥', text: 'Tap', highlight: '"Add to phone"', },
        { icon: '✓', text: 'Tap', highlight: '"Install"', },
      ],
    };
  }

  // Android Opera
  if (os === 'android' && browser === 'opera') {
    return {
      title: 'Install from Opera',
      browserIcon: '🔴',
      steps: [
        { icon: '⋮', text: 'Tap the', highlight: 'menu', },
        { icon: '🏠', text: 'Tap', highlight: '"Home screen"', },
        { icon: '✓', text: 'Confirm the installation' },
      ],
    };
  }

  // Android other browsers
  if (os === 'android') {
    return {
      title: 'Install the App',
      browserIcon: '📱',
      steps: [
        { icon: '🔵', text: 'For best results, open in', highlight: 'Chrome' },
        { icon: '⋮', text: 'Tap menu and look for', highlight: '"Install"' },
      ],
      note: 'Your browser may support installation - look for an "Install" or "Add to Home Screen" option in the menu.',
    };
  }

  // Desktop Chrome
  if (browser === 'chrome' && device === 'desktop') {
    return {
      title: 'Install from Chrome',
      browserIcon: '🔵',
      steps: [
        { icon: '📥', text: 'Click the', highlight: 'install icon', },
        { icon: '✓', text: 'Click', highlight: '"Install"', },
      ],
      note: 'Look for the install icon (⊕) in the address bar, or check the menu (⋮).',
    };
  }

  // Desktop Edge
  if (browser === 'edge' && device === 'desktop') {
    return {
      title: 'Install from Edge',
      browserIcon: '🔷',
      steps: [
        { icon: '⋯', text: 'Click the', highlight: 'menu (...)' },
        { icon: '📱', text: 'Click', highlight: '"Apps"' },
        { icon: '📥', text: 'Click', highlight: '"Install this site as an app"' },
      ],
    };
  }

  // Desktop Safari (macOS)
  if (browser === 'safari' && os === 'macos') {
    return {
      title: 'Add to Dock',
      browserIcon: '🧭',
      steps: [
        { icon: '📂', text: 'Click', highlight: 'File menu' },
        { icon: '➕', text: 'Click', highlight: '"Add to Dock"' },
      ],
      note: 'Safari on macOS Sonoma+ supports adding web apps to your Dock.',
    };
  }

  // Desktop Firefox
  if (browser === 'firefox' && device === 'desktop') {
    return {
      title: 'Firefox doesn\'t support PWA',
      browserIcon: '🦊',
      steps: [
        { icon: '🔵', text: 'Open this page in', highlight: 'Chrome or Edge' },
        { icon: '📥', text: 'Then click the install option' },
      ],
      note: 'Firefox desktop doesn\'t support installing web apps. Try Chrome or Edge instead.',
    };
  }

  // Default fallback
  return {
    title: 'Install the App',
    browserIcon: '🌐',
    steps: [
      { icon: '🔵', text: 'Open in', highlight: 'Chrome, Edge, or Safari' },
      { icon: '📥', text: 'Look for an', highlight: '"Install"', },
    ],
    note: 'For the best experience, use Chrome on Android or Safari on iPhone.',
  };
}

/**
 * Get browser display name
 */
export function getBrowserName(browser: BrowserType): string {
  const names: Record<BrowserType, string> = {
    safari: 'Safari',
    chrome: 'Chrome',
    firefox: 'Firefox',
    edge: 'Edge',
    samsung: 'Samsung Internet',
    opera: 'Opera',
    brave: 'Brave',
    other: 'Browser',
  };
  return names[browser];
}

/**
 * Get OS display name
 */
export function getOSName(os: OSType): string {
  const names: Record<OSType, string> = {
    ios: 'iOS',
    android: 'Android',
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux',
    other: 'Unknown',
  };
  return names[os];
}
