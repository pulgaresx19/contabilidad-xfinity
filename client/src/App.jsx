import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import OrdersList from './components/OrdersList';
import AddOrderModal from './components/AddOrderModal';
import WeeklyDashboard from './components/WeeklyDashboard';
import PhotoModal from './components/PhotoModal';
import SettingsModal from './components/SettingsModal';

export default function App() {
  const [activeTab, setActiveTab] = useState('orders');
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
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        techName={techName}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading && orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
            <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm">Cargando contabilidad de Xfinity...</p>
          </div>
        ) : (
          <>
            {activeTab === 'orders' && (
              <OrdersList
                orders={orders}
                onOpenPhotos={handleOpenPhotos}
                onOrderUpdated={refreshAll}
                onDeleteOrder={handleDeleteOrder}
              />
            )}

            {activeTab === 'add' && (
              <AddOrderModal
                defaultTech={techName}
                onOrderCreated={() => {
                  refreshAll();
                  setActiveTab('orders');
                }}
              />
            )}

            {activeTab === 'weekly' && (
              <WeeklyDashboard
                summaryData={summaryData}
                onRefresh={refreshAll}
              />
            )}
          </>
        )}
      </main>

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
