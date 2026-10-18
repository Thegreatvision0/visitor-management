import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import './styles.css';
import { AppProvider, useApp } from './context.jsx';
import Layout, { NAV } from './components/Layout.jsx';
import Login, { ChoosePassword } from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Members from './pages/Members.jsx';
import Branches from './pages/Branches.jsx';
import PreReg from './pages/PreReg.jsx';
import Approvals from './pages/Approvals.jsx';
import Reception from './pages/Reception.jsx';
import Accommodation from './pages/Accommodation.jsx';
import Departments from './pages/Departments.jsx';
import LongTerm from './pages/LongTerm.jsx';
import Reports from './pages/Reports.jsx';
import Admin from './pages/Admin.jsx';
import Visits from './pages/Visits.jsx';
import GuestPage from './pages/GuestPage.jsx';

const PAGES = { dashboard: Dashboard, members: Members, branches: Branches, prereg: PreReg, approvals: Approvals, reception: Reception, accommodation: Accommodation, departments: Departments, longterm: LongTerm, visitors: Visits, reports: Reports, admin: Admin };

function Page() {
  const { page } = useParams(), { D } = useApp();
  if (!PAGES[page] || !D.can(page)) {
    const first = NAV.find(n => D.can(n[0]));
    if (!first) return <Layout page=""><div className="card empty">This role has no pages enabled. Ask the Super Admin to grant access (Admin → Roles &amp; access).</div></Layout>;
    return <Navigate to={'/' + first[0]} replace />;
  }
  const P = PAGES[page];
  return <Layout page={page}><P /></Layout>;
}

function Root() {
  const { me, D, booting } = useApp(), loc = useLocation();
  /* guests open their registration link without signing in */
  if (loc.pathname.startsWith('/guest/')) return <Routes><Route path="/guest/:token" element={<GuestPage />} /></Routes>;
  if (booting) return <div id="login"><div className="muted">Loading…</div></div>;
  if (me && me.mustChangePassword) return <ChoosePassword />;
  if (!me || !D) return <Login />;
  return <Routes><Route path="/:page" element={<Page />} /><Route path="*" element={<Navigate to="/dashboard" replace />} /></Routes>;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode><BrowserRouter><AppProvider><Root /></AppProvider></BrowserRouter></React.StrictMode>
);
