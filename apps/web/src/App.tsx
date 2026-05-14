import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getToken } from "./api";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import ConnectionsPage from "./pages/ConnectionsPage";
import ProfilesPage from "./pages/ProfilesPage";
import ProfileEditPage from "./pages/ProfileEditPage";
import ReportsPage from "./pages/ReportsPage";
import Login from "./pages/Login";

function PrivateRoute({ children }: { children: ReactElement }) {
  return getToken() ? <Layout>{children}</Layout> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/connections"
        element={
          <PrivateRoute>
            <ConnectionsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/profiles"
        element={
          <PrivateRoute>
            <ProfilesPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/profiles/:id/edit"
        element={
          <PrivateRoute>
            <ProfileEditPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <PrivateRoute>
            <ReportsPage />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
