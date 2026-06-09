import { NavLink, useNavigate } from 'react-router-dom';
import { useCurrentUser, useSetCurrentUser } from '../hooks/useCurrentUser';
import { clearStoredSession } from '../lib/session';

export default function Navbar() {
  const currentUser = useCurrentUser();
  const setCurrentUser = useSetCurrentUser();
  const navigate = useNavigate();

  const handleLogout = () => {
    clearStoredSession();
    setCurrentUser(null);
    navigate('/login');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
      isActive
        ? 'bg-slate-800 text-white'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  return (
    <nav className="bg-slate-900 border-b border-white/5">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <NavLink to="/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 shrink-0">
                <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-lg font-bold text-white tracking-tight">Smart Expense</span>
            </NavLink>
            <div className="hidden md:block ml-10">
              <div className="flex items-baseline space-x-4">
                <NavLink to="/dashboard" className={navLinkClass}>Dashboard</NavLink>
                <NavLink to="/add-expense" className={navLinkClass}>Add Expense</NavLink>
                <NavLink to="/balance" className={navLinkClass}>Balance</NavLink>
                <NavLink to="/settle-up" className={navLinkClass}>Pay now</NavLink>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {currentUser && (
              <span className="text-sm font-medium text-slate-300 hidden sm:block">
                {currentUser.name}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
        {/* Mobile Nav Links */}
        <div className="md:hidden flex space-x-2 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-hide">
          <NavLink to="/dashboard" className={navLinkClass}>Dashboard</NavLink>
          <NavLink to="/add-expense" className={navLinkClass}>Add Expense</NavLink>
          <NavLink to="/balance" className={navLinkClass}>Balance</NavLink>
          <NavLink to="/settle-up" className={navLinkClass}>Pay now</NavLink>
        </div>
      </div>
    </nav>
  );
}
