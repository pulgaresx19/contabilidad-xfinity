import React, { useState, useEffect } from 'react';
import BottomNav from './components/BottomNav';
import TodayView from './components/TodayView';
import HistoryView from './components/HistoryView';
import MonthlyView from './components/MonthlyView';
import ProfileView from './components/ProfileView';
import ScanModal from './components/ScanModal';
import PhotoModal from './components/PhotoModal';
import SettingsModal from './components/SettingsModal';
import { Cable, ShieldCheck, Settings, Sun, Moon } from 'lucide-react';
import { useTheme } from './context/ThemeContext';
import { getLocalDateStr } from './utils/dateUtils';

export default function App() {
  const { actualTheme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'history' | 'profile'
  const [orders, setOrders] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [techName, setTechName] = useState('Javier (P0G1)');

  // Modals
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [selectedPhotoOrder, setSelectedPhotoOrder] = useState(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setOrders(data);
          try {
            localStorage.setItem('xfinity_cached_orders', JSON.stringify(data));
          } catch (e) {}
          return;
        }
      }
    } catch (err) {
      console.warn('API /api/orders unreachable, checking offline cache:', err);
    }

    // Fallback for Vercel/Production mobile testing without local server
    try {
      const cached = localStorage.getItem('xfinity_cached_orders');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOrders(parsed);
          return;
        }
      }
    } catch (e) {}

    // Initial production sample data if empty
    const seedOrders = [
      {
        id: 18,
        work_date: getLocalDateStr(),
        tech_id: 'Javier (P0G1)',
        job_id: '123456',
        address: '4260 Main ST',
        city: 'SKOKIE',
        zip_code: '60076',
        phone: '5741234567',
        call_first: 0,
        drop_footage: 100,
        cable_type: 'RG-6',
        bore_type: 'N',
        status: 'Pendiente',
        payment_status: 'Pendiente',
        rate_calculated: 100,
        latitude: 42.033592,
        longitude: -87.7345574,
        raw_notes: ''
      }
    ];
    setOrders(seedOrders);
    try {
      localStorage.setItem('xfinity_cached_orders', JSON.stringify(seedOrders));
    } catch (e) {}
  };

  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/weekly-summary');
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data);
        try {
          localStorage.setItem('xfinity_cached_summary', JSON.stringify(data));
        } catch (e) {}
        return;
      }
    } catch (err) {
      console.warn('API summary unreachable, checking cache:', err);
    }

    try {
      const cached = localStorage.getItem('xfinity_cached_summary');
      if (cached) setSummaryData(JSON.parse(cached));
    } catch (e) {}
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.tech_default) setTechName(data.tech_default);
        try {
          localStorage.setItem('xfinity_cached_settings', JSON.stringify(data));
        } catch (e) {}
        return;
      }
    } catch (err) {
      console.warn('API settings unreachable, checking cache:', err);
    }

    try {
      const cached = localStorage.getItem('xfinity_cached_settings');
      if (cached) {
        const data = JSON.parse(cached);
        if (data.tech_default) setTechName(data.tech_default);
      }
    } catch (e) {}
  };

  const refreshAll = async () => {
    await Promise.all([fetchOrders(), fetchSummary(), fetchSettings()]);
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchOrders(), fetchSummary(), fetchSettings()]);
      setInitialLoading(false);
    };
    init();
  }, []);

  // Guarantee instant fresh data when technician switches to Cierres or Monthly balance
  useEffect(() => {
    if (activeTab === 'history' || activeTab === 'monthly') {
      fetchSummary();
      fetchOrders();
    }
  }, [activeTab]);

  const handleOpenPhotos = async (order) => {
    try {
      const res = await fetch(`/api/orders/${order.id}`);
      if (res.ok) {
        const fullOrder = await res.json();
        setSelectedPhotoOrder(fullOrder);
        setIsPhotoModalOpen(true);
      }
    } catch (err) {
      console.error('Error fetching order photos:', err);
    }
  };

  const handlePhotoUpdated = async () => {
    if (selectedPhotoOrder) {
      const res = await fetch(`/api/orders/${selectedPhotoOrder.id}`);
      if (res.ok) {
        const updated = await res.json();
        setSelectedPhotoOrder(updated);
      }
    }
    fetchOrders();
  };

  const pendingCount = orders.filter(o => o.status === 'Pendiente').length;

  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center selection:bg-cyan-500 selection:text-slate-950 font-sans ${activeTab === 'today' ? 'h-screen max-h-screen overflow-hidden' : ''}`}>
      <div className={`w-full max-w-md flex flex-col relative ${activeTab === 'today' ? 'h-full flex-1 min-h-0 overflow-hidden' : 'min-h-screen'}`}>
        {/* Top Mobile Header with Safe Area Inset to clear phone status bar / notch / dynamic island */}
        <header 
          className="w-full bg-slate-900/90 border-b border-slate-800/80 sticky top-0 z-30 backdrop-blur-md shrink-0"
          style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 0.75rem)' }}
        >
          <div className="w-full px-3.5 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-500/20">
              <Cable className="h-4 w-4 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <span className="font-extrabold text-xs text-white tracking-tight">Xfinity Tech</span>
              <span className="ml-1 text-[9px] font-bold text-cyan-400 bg-cyan-950 px-1.5 py-0.2 rounded border border-cyan-800">
                PRO
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden xs:flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-full px-2.5 py-0.5">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              <span className="text-[10px] text-slate-300 font-mono font-semibold">{techName}</span>
            </div>

            {/* Botón rápido Modo Claro / Modo Oscuro */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition active:scale-95 border border-slate-700/60"
              title={actualTheme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
              aria-label="Cambiar tema de la aplicación"
            >
              {actualTheme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400 stroke-[2.5]" />
              ) : (
                <Moon className="h-4 w-4 text-indigo-600 stroke-[2.5]" />
              )}
            </button>

            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
              title="Ajustes de Tarifas"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className={`flex-1 w-full ${
        activeTab === 'today'
          ? 'min-h-0 pt-1.5 pb-[4.75rem] px-3.5 flex flex-col overflow-hidden'
          : 'px-3.5 py-2.5 pb-24 overflow-y-auto'
      }`}>
        <>
            {activeTab === 'today' && (
              <TodayView
                orders={orders}
                summaryData={summaryData}
                onOpenScan={() => setIsScanModalOpen(true)}
                onOpenPhotos={handleOpenPhotos}
                onOrderUpdated={refreshAll}
                onUpdateOrders={setOrders}
                viewMode="uber"
                hideModeToggle={true}
              />
            )}

            {activeTab === 'history' && (
              <HistoryView
                orders={orders}
                summaryData={summaryData}
                onRefresh={refreshAll}
                onOpenPhotos={handleOpenPhotos}
                onOpenScan={() => setIsScanModalOpen(true)}
                onOrderUpdated={refreshAll}
                onUpdateOrders={setOrders}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileView
                techName={techName}
                summaryData={summaryData}
                onRefresh={refreshAll}
                onOpenSettings={() => setIsSettingsModalOpen(true)}
              />
            )}
          </>
      </main>

      {/* Floating Bottom Pill Navbar */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingCount={pendingCount}
      />
      </div>

      {/* Scan Modal (Opens right from Home) */}
      <ScanModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        onOrdersSaved={() => {
          refreshAll();
          setActiveTab('today');
        }}
        defaultTech={techName}
      />

      {/* Photo Modal for job evidence */}
      <PhotoModal
        order={selectedPhotoOrder}
        isOpen={isPhotoModalOpen}
        onClose={() => setIsPhotoModalOpen(false)}
        onPhotoUpdated={handlePhotoUpdated}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSettingsSaved={(newSettings) => {
          if (newSettings.tech_default) setTechName(newSettings.tech_default);
          refreshAll();
        }}
      />
    </div>
  );
}
