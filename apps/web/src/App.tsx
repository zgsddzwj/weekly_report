import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getToken } from "./api";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";

function PrivateRoute({ children }: { children: ReactElement }) {
  return getToken() ? children : <Navigate to="/login" replace />;
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
