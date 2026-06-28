export interface PlatformInfo {
  os: 'linux' | 'windows' | 'macos' | 'unknown'
  arch: string
}

export class PlatformBridge {
  getPlatformInfo(): PlatformInfo {
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('linux')) return { os: 'linux', arch: 'x64' }
    if (ua.includes('win')) return { os: 'windows', arch: 'x64' }
    if (ua.includes('mac')) return { os: 'macos', arch: 'arm64' }
    return { os: 'unknown', arch: 'unknown' }
  }

  normalizePath(path: string): string {
    return path.replace(/\\/g, '/')
  }
}

export const platformBridge = new PlatformBridge()
