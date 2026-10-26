import React from 'react';
import { Cable, ClipboardList, PlusCircle, BarChart3, Settings, ShieldCheck } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, techName, onOpenSettings }) {
  const tabs = [
    { id: 'orders', label: 'Órdenes de Trabajo', icon: ClipboardList },
    { id: 'add', label: 'Nueva / Pegado Rápido', icon: PlusCircle },
    { id: 'weekly', label: 'Cierre Semanal & Fondo', icon: BarChart3 },
  ];

  return (
    <header className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-30 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Cable className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight">Xfinity Tech</span>
                <span className="text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                  Contabilidad
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Control de Órdenes & Cobros Semanales</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 sm:gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/25'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Tech Badge & Settings Button */}
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 rounded-full px-3 py-1">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-xs text-slate-200 font-medium">{techName || 'Javier (P0G1)'}</span>
            </div>

            <button
              onClick={onOpenSettings}
              title="Configuración y Tarifas"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
