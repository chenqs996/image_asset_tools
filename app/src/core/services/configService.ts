export interface AppConfig {
  schemaVersion: string
  defaultOutputFormat: 'PNG' | 'BMP' | 'WebP'
  concurrency: number
  selectedProviders: Record<'slice' | 'scale' | 'matting', string | null>
}

const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: '1.0.0',
  defaultOutputFormat: 'PNG',
  concurrency: Math.max(1, (navigator.hardwareConcurrency || 2) - 1),
  selectedProviders: {
    slice: null,
    scale: null,
    matting: null,
  },
}

const CONFIG_KEY = 'img_tools_app_config'

export class ConfigService {
  async load(): Promise<AppConfig> {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return DEFAULT_CONFIG

    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) as Partial<AppConfig> }
    } catch {
      return DEFAULT_CONFIG
    }
  }

  async save(config: AppConfig): Promise<void> {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  }
}

export const configService = new ConfigService()
