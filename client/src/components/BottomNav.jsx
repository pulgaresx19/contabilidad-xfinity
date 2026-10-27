import React from 'react';
import { Home, CalendarDays, BarChart3, User } from 'lucide-react';

export default function BottomNav({ activeTab, setActiveTab, pendingCount }) {
  const tabs = [
    { id: 'today', label: 'Jornada', icon: Home, badge: pendingCount },
    { id: 'history', label: 'Cierres', icon: CalendarDays },
    { id: 'monthly', label: 'Mensual', icon: BarChart3 },
    { id: 'profile', label: 'Perfil', icon: User },
  ];

  return (
    <div 
      className="fixed inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
      style={{ bottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)' }}
    >
      <nav className="pointer-events-auto bg-slate-900/95 border border-slate-800/90 shadow-2xl shadow-black/90 backdrop-blur-xl rounded-3xl px-2 py-1.5 flex items-center gap-1 max-w-sm w-full justify-between">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-2 sm:px-3 rounded-2xl transition-all duration-200 select-none flex-1 ${
                isActive
                  ? 'text-cyan-400 bg-cyan-950/50 border border-cyan-500/30 shadow-inner'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <div className="relative flex items-center justify-center mb-1">
                <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5] text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'stroke-2 text-slate-400'}`} />
                {tab.badge > 0 && !isActive && (
                  <span className="absolute -top-1.5 -right-2.5 bg-amber-500 text-slate-950 text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-slate-900">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className={`text-[11px] leading-tight font-medium ${isActive ? 'text-cyan-300 font-bold' : 'text-slate-400'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
