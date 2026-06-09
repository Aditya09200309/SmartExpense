import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { ToastProvider } from './components/Toast';
import { CurrentUserProvider } from './contexts/CurrentUserContext';
import { setNavigate } from './lib/navRef';
import { hasStoredSession } from './lib/session';
import AddExpense from './pages/AddExpense';
import AddMember from './pages/AddMember';
import Balance from './pages/Balance';
import CreateGroup from './pages/CreateGroup';
import CreateUser from './pages/CreateUser';
import Dashboard from './pages/Dashboard';
import GroupDetailsPlaceholder from './pages/GroupDetailsPlaceholder';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import SettleUp from './pages/SettleUp';
import Layout from './components/Layout';

function NavigateInitializer() {
  const navigate = useNavigate();

  useEffect(() => {
    setNavigate(navigate);
  }, [navigate]);

  return null;
}

function RootRoute() {
  if (hasStoredSession()) {
    return <Navigate to="/dashboard" replace />;
  }

  return <LandingPage />;
}

function FallbackRoute() {
  const fallbackRoute = hasStoredSession() ? '/dashboard' : '/';
  return <Navigate to={fallbackRoute} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <NavigateInitializer />
      <ToastProvider>
        <CurrentUserProvider>
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<CreateUser />} />
            
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/create-group" element={<CreateGroup />} />
              <Route path="/group/:id" element={<GroupDetailsPlaceholder />} />
              <Route path="/add-member" element={<AddMember />} />
              <Route path="/add-expense" element={<AddExpense />} />
              <Route path="/balance" element={<Balance />} />
              <Route path="/settle-up" element={<SettleUp />} />
              <Route path="/create-user" element={<CreateUser />} />
            </Route>

            <Route path="*" element={<FallbackRoute />} />
          </Routes>
        </CurrentUserProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
