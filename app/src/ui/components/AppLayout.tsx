import { Outlet } from 'react-router-dom'

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>美术素材处理工具 · V1</h1>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
