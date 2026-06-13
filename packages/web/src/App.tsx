import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage.js';
import { LobbyPage } from './pages/LobbyPage.js';
import { RoomPage } from './pages/RoomPage.js';
import { ProtectedRoute } from './components/layout/ProtectedRoute.js';
import { useAuthStore } from './store/authStore.js';

export function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const loading = useAuthStore((s) => s.loading);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (loading) {
    return <div className="flex h-full items-center justify-center text-emerald-200">…</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <LobbyPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/table/:tableId"
        element={
          <ProtectedRoute>
            <RoomPage />
          </ProtectedRoute>
        }
      />
      <Route path="/join/:code" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
