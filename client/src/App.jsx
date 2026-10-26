import React, { useState, useEffect } from 'react';
import BottomNav from './components/BottomNav';
import TodayView from './components/TodayView';
import HistoryView from './components/HistoryView';
import ProfileView from './components/ProfileView';
import ScanModal from './components/ScanModal';
import PhotoModal from './components/PhotoModal';
import SettingsModal from './components/SettingsModal';
import { Cable, ShieldCheck, Settings } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'history' | 'profile'
  const [orders, setOrders] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);
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
        setOrders(data);
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/weekly-summary');
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data);
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.tech_default) setTechName(data.tech_default);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([fetchOrders(), fetchSummary(), fetchSettings()]);
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
  }, []);

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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-slate-950 font-sans">
      {/* Top Mobile Header */}
      <header className="bg-slate-900/90 border-b border-slate-800/80 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 h-13 flex items-center justify-between">
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

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-full px-2.5 py-0.5">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              <span className="text-[10px] text-slate-300 font-mono font-semibold">{techName}</span>
            </div>

            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 max-w-md w-full mx-auto px-3.5 py-3.5 pb-24">
        {loading && orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-2">
            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs">Cargando...</p>
          </div>
        ) : (
          <>
            {activeTab === 'today' && (
              <TodayView
                orders={orders}
                summaryData={summaryData}
                onOpenScan={() => setIsScanModalOpen(true)}
                onOpenPhotos={handleOpenPhotos}
                onOrderUpdated={refreshAll}
              />
            )}

            {activeTab === 'history' && (
              <HistoryView
                orders={orders}
                summaryData={summaryData}
                onRefresh={refreshAll}
                onOpenPhotos={handleOpenPhotos}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileView
                techName={techName}
                summaryData={summaryData}
                onOpenSettings={() => setIsSettingsModalOpen(true)}
              />
            )}
          </>
        )}
      </main>

      {/* Floating Bottom Pill Navbar */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingCount={pendingCount}
      />

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
