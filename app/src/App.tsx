import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { configService } from './core/services/configService'
import { providerRegistry } from './core/services/providerRegistry'
import { WorkspaceProvider } from './core/state/workspaceContext'
import { AppLayout } from './ui/components/AppLayout'
import { ExportPage } from './ui/pages/ExportPage'
import { ImportPage } from './ui/pages/ImportPage'
import { ProcessPage } from './ui/pages/ProcessPage'
import { registerBuiltInProviders } from './providers/registerBuiltInProviders'

function App() {
  useEffect(() => {
    registerBuiltInProviders(providerRegistry)
    providerRegistry.loadRuntimePlugins()

    configService.load().then((config) => {
      configService.save(config)
    })
  }, [])

  return (
    <WorkspaceProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<ImportPage />} />
            <Route path="/process" element={<ProcessPage />} />
            <Route path="/export" element={<ExportPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WorkspaceProvider>
  )
}

export default App
