import React from 'react';
import { Home, CalendarDays, User } from 'lucide-react';

export default function BottomNav({ activeTab, setActiveTab, pendingCount }) {
  const tabs = [
    { id: 'today', label: 'Jornada', icon: Home, badge: pendingCount },
    { id: 'history', label: 'Cierres', icon: CalendarDays },
    { id: 'profile', label: 'Perfil', icon: User },
  ];

  return (
    <div className="fixed bottom-3 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
      <nav className="pointer-events-auto bg-slate-900/90 border border-slate-800/90 shadow-2xl shadow-black/80 backdrop-blur-xl rounded-full px-2 py-1.5 flex items-center gap-1 max-w-xs w-full justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center justify-center gap-2 py-2 px-4 rounded-full transition-all duration-200 select-none ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon className={`h-4 w-4 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                {tab.badge > 0 && !isActive && (
                  <span className="absolute -top-1.5 -right-2 bg-amber-500 text-slate-950 text-[9px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className={`text-xs ${isActive ? 'inline' : 'hidden sm:inline font-medium'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
