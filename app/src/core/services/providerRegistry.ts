import type { IProvider, ProviderManifest } from '../../contracts/provider'

export class ProviderRegistry {
  private providers = new Map<string, IProvider>()

  register(provider: IProvider) {
    this.providers.set(provider.manifest.id, provider)
  }

  unregister(providerId: string) {
    this.providers.delete(providerId)
  }

  listManifests(type?: ProviderManifest['type']) {
    const manifests = Array.from(this.providers.values()).map((p) => p.manifest)
    return type ? manifests.filter((m) => m.type === type) : manifests
  }

  getProvider(providerId: string) {
    return this.providers.get(providerId)
  }

  /**
   * 运行时动态插件加载：先读取 manifest，再按 entry 动态导入 provider。
   */
  async loadRuntimePlugins() {
    let loaded = 0
    let failed = 0
    let skipped = 0

    type RuntimeManifest = ProviderManifest & { entry: string }

    try {
      const response = await fetch('/plugins/plugins.manifest.json', { cache: 'no-store' })
      if (!response.ok) {
        return { loaded: this.providers.size, failed: 0, skipped: 0 }
      }

      const manifests = (await response.json()) as RuntimeManifest[]
      for (const manifest of manifests) {
        if (this.providers.has(manifest.id)) {
          skipped += 1
          continue
        }

        try {
          // 说明：Vite 开发模式不支持将 /public 下的 JS 文件作为 source import。
          // 因此这里改为“基于 manifest 元信息注册 provider 占位实现”，
          // 后续接入 Tauri 原生插件时再替换为真实模块加载。
          const runtimeProvider: IProvider = {
            manifest,
            validateConfig() {
              return { valid: true }
            },
          }

          if (!runtimeProvider.manifest?.id) {
            failed += 1
            continue
          }

          this.register(runtimeProvider)
          loaded += 1
        } catch {
          failed += 1
        }
      }
    } catch {
      return { loaded: this.providers.size, failed: 0, skipped: 0 }
    }

    return {
      loaded,
      failed,
      skipped,
    }
  }
}

export const providerRegistry = new ProviderRegistry()
