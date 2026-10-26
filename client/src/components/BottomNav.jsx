import React from 'react';
import { Home, ClipboardList, Camera, History } from 'lucide-react';

export default function BottomNav({ activeTab, setActiveTab, ordersCount }) {
  const tabs = [
    { id: 'weekly', label: 'Cierre', icon: Home },
    { id: 'orders', label: 'Órdenes', icon: ClipboardList, badge: ordersCount },
    { id: 'scan', label: 'Escanear', icon: Camera, highlight: true },
    { id: 'history', label: 'Historial', icon: History },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 border-t border-slate-800/80 backdrop-blur-xl">
      <div className="max-w-md mx-auto px-2 flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          if (tab.highlight) {
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="relative -top-3 flex flex-col items-center group focus:outline-none"
              >
                <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                  isActive
                    ? 'bg-gradient-to-tr from-cyan-500 to-blue-600 text-slate-950 shadow-cyan-500/30'
                    : 'bg-cyan-600 text-slate-950 shadow-cyan-600/25 group-hover:bg-cyan-500'
                }`}>
                  <Icon className="h-6 w-6 stroke-[2.5]" />
                </div>
                <span className={`text-[10px] font-bold mt-1 tracking-tight ${isActive ? 'text-cyan-400' : 'text-slate-400'}`}>
                  {tab.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 focus:outline-none ${
                isActive ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                {tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-cyan-500 text-slate-950 text-[9px] font-extrabold px-1 rounded-full min-w-3.5 h-3.5 flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-medium mt-1 ${isActive ? 'font-bold text-cyan-400' : ''}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
