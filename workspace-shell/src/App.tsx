import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ActivityPage } from './pages/ActivityPage'
import { AppsPage } from './pages/AppsPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { SettingsPage } from './pages/SettingsPage'
import { TeamPage } from './pages/TeamPage'
import { VaultPage } from './pages/VaultPage'

export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage/>}/>
    <Route element={<ProtectedRoute/>}>
      <Route element={<AppShell/>}>
        <Route index element={<HomePage/>}/>
        <Route path="apps" element={<AppsPage/>}/>
        <Route path="activity" element={<ActivityPage/>}/>
        <Route path="team" element={<TeamPage/>}/>
        <Route path="profile" element={<ProfilePage/>}/>
        <Route path="settings" element={<SettingsPage/>}/>
        <Route path="vault" element={<Navigate to="/vault/documents" replace/>}/>
        <Route path="vault/:section" element={<VaultPage/>}/>
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes>
}

