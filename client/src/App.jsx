import React, { useState, useEffect } from 'react';
import BottomNav from './components/BottomNav';
import WeeklyDashboard from './components/WeeklyDashboard';
import OrdersList from './components/OrdersList';
import ScanSheetModal from './components/ScanSheetModal';
import SheetsHistory from './components/SheetsHistory';
import PhotoModal from './components/PhotoModal';
import SettingsModal from './components/SettingsModal';
import { Cable, ShieldCheck, Settings } from 'lucide-react';

export default function App() {
  // Start on Cierre General as requested: "el cierre general como de inicio"
  const [activeTab, setActiveTab] = useState('weekly');
  const [orders, setOrders] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [techName, setTechName] = useState('Javier (P0G1)');

  // Modal states
  const [selectedPhotoOrder, setSelectedPhotoOrder] = useState(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Fetch all orders
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

  // Fetch weekly summary
  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/weekly-summary');
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data);
      }
    } catch (err) {
      console.error('Error fetching weekly summary:', err);
    }
  };

  // Fetch settings
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

  // Refresh everything
  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([fetchOrders(), fetchSummary(), fetchSettings()]);
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
  }, []);

  // Open photo modal for a specific order
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

  const handleDeleteOrder = async (orderId) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta orden de trabajo?')) return;
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      if (res.ok) {
        refreshAll();
      }
    } catch (err) {
      alert('Error eliminando orden: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Mobile-First Header */}
      <header className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-md md:max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center shadow-md shadow-cyan-500/20">
              <Cable className="h-4 w-4 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-sm text-white tracking-tight">Xfinity Tech</span>
              <span className="ml-1.5 text-[9px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.2 rounded-full uppercase">
                Móvil
              </span>
            </div>
          </div>

          {/* Tech Badge & Settings Button */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/60 rounded-full px-2.5 py-0.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[11px] text-slate-200 font-mono font-medium truncate max-w-[120px]">
                {techName || 'Javier'}
              </span>
            </div>

            <button
              onClick={() => setIsSettingsModalOpen(true)}
              title="Configuración y Tarifas"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main View Area (with pb-20 to accommodate the bottom navbar) */}
      <main className="flex-1 max-w-md md:max-w-4xl w-full mx-auto px-3.5 sm:px-6 py-4 pb-24">
        {loading && orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
            <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs">Cargando contabilidad...</p>
          </div>
        ) : (
          <>
            {/* TAB 1: CIERRE GENERAL (INICIO) */}
            {activeTab === 'weekly' && (
              <WeeklyDashboard
                summaryData={summaryData}
                onRefresh={refreshAll}
              />
            )}

            {/* TAB 2: ÓRDENES DE TRABAJO */}
            {activeTab === 'orders' && (
              <OrdersList
                orders={orders}
                onOpenPhotos={handleOpenPhotos}
                onOrderUpdated={refreshAll}
                onDeleteOrder={handleDeleteOrder}
              />
            )}

            {/* TAB 3: ESCANEAR HOJA DE RUTA CON CÁMARA / OCR */}
            {activeTab === 'scan' && (
              <ScanSheetModal
                defaultTech={techName}
                onOrdersSaved={() => {
                  refreshAll();
                  setActiveTab('orders');
                }}
              />
            )}

            {/* TAB 4: HISTORIAL DE FOTOS DE HOJAS DE DESPACHO */}
            {activeTab === 'history' && (
              <SheetsHistory
                onSelectDate={(date) => {
                  setActiveTab('orders');
                }}
              />
            )}
          </>
        )}
      </main>

      {/* FIXED BOTTOM NAVIGATION BAR FOR MOBILE */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        ordersCount={orders.length}
      />

      {/* Photo Evidence Modal */}
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
