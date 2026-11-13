import React from 'react';
import {
  Home,
  BookOpen,
  Mic,
  Package,
  TrendingUp,
  Settings,
  BellRing,
  Sparkles,
  Users,
} from 'lucide-react';
import { Language } from '../../types';
import { translations } from '../../utils/translations';

export type NavTab = 'home' | 'khata' | 'assistant' | 'stock' | 'reminders' | 'leads' | 'insights' | 'settings';

interface NavigationProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  language: Language;
  onQuickMicPress: () => void;
  isRecording?: boolean;
  /** Scheduled CRM messages whose time has come (badge on the Leads tab). */
  leadsDue?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onTabChange,
  language,
  onQuickMicPress,
  isRecording = false,
  leadsDue = 0,
}) => {
  const t = translations[language].tabs;

  const navItems = [
    { id: 'home' as NavTab, label: t.home, icon: Home },
    { id: 'khata' as NavTab, label: t.khata, icon: BookOpen },
    { id: 'stock' as NavTab, label: t.stock, icon: Package },
    { id: 'reminders' as NavTab, label: 'Reminders', icon: BellRing },
    { id: 'leads' as NavTab, label: 'Leads CRM', icon: Users },
    { id: 'insights' as NavTab, label: t.insights, icon: TrendingUp },
    { id: 'settings' as NavTab, label: t.settings, icon: Settings },
  ];

  return (
    <>
      {/* Desktop Sidebar (hidden on mobile, visible on lg screens) */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-emerald-100 p-4 shrink-0 h-[calc(100vh-4rem)] sticky top-16 shadow-xs">
        {/* Floating Voice Assistant Banner */}
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-[#1F7A5C] text-white shadow-md relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-[#25D366]/20 blur-xl pointer-events-none" />
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse" />
            <span className="text-xs font-semibold text-emerald-200 uppercase tracking-wider">
              AI Voice Assistant
            </span>
          </div>
          <p className="text-xs text-emerald-100 mb-3 leading-relaxed">
            "Sharma ji ko 500 udhaar" bole aur khata turant update karein.
          </p>
          <button
            onClick={() => {
              onTabChange('assistant');
              onQuickMicPress();
            }}
            className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              isRecording
                ? 'bg-rose-500 text-white animate-pulse'
                : 'bg-[#25D366] text-[#0B3D2E] hover:bg-[#20ba59] active:scale-98 shadow-sm'
            }`}
          >
            <Mic className={`w-4 h-4 ${isRecording ? 'animate-bounce' : ''}`} />
            {isRecording ? 'Recording Chal Rahi Hai...' : 'Bol Kar Entry Karein'}
          </button>
        </div>

        {/* Sidebar Nav Items */}
        <nav className="space-y-1.5 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all ${
                  active
                    ? 'bg-[#DDF3E7] text-[#0B3D2E] shadow-xs font-bold'
                    : 'text-[#5F7A6E] hover:text-[#123D31] hover:bg-[#F2F8F5]'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-[#1F7A5C]' : 'text-[#5F7A6E]'}`} />
                <span>{item.label}</span>
                {item.id === 'leads' && leadsDue > 0 && (
                  <span className="ml-auto text-[10px] font-black px-1.5 py-0.5 rounded-full bg-[#F5A623] text-[#0B3D2E]">{leadsDue}</span>
                )}
              </button>
            );
          })}

          <button
            onClick={() => onTabChange('assistant')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all ${
              currentTab === 'assistant'
                ? 'bg-[#DDF3E7] text-[#0B3D2E] shadow-xs font-bold'
                : 'text-[#5F7A6E] hover:text-[#123D31] hover:bg-[#F2F8F5]'
            }`}
          >
            <Sparkles className="w-5 h-5 text-[#25D366]" />
            <span>Saathi AI Chat</span>
          </button>
        </nav>

        {/* Bottom Disclaimer in Sidebar */}
        <div className="pt-4 border-t border-emerald-50 text-[11px] text-[#5F7A6E] text-center">
          Dukaan Saathi v1.0 • WhatsApp Style Kirana Ledger
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar (Visible on screens < lg) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-emerald-100 shadow-[0_-4px_16px_rgba(11,61,46,0.08)] px-2 pb-safe">
        <div className="max-w-md mx-auto flex items-center justify-between relative h-16">
          {/* Home */}
          <button
            onClick={() => onTabChange('home')}
            className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors ${
              currentTab === 'home' ? 'text-[#0B3D2E] font-bold' : 'text-[#5F7A6E]'
            }`}
          >
            <Home className={`w-5 h-5 ${currentTab === 'home' ? 'text-[#1F7A5C]' : ''}`} />
            <span className="text-[10px] mt-0.5">{t.home}</span>
          </button>

          {/* Khata */}
          <button
            onClick={() => onTabChange('khata')}
            className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors ${
              currentTab === 'khata' ? 'text-[#0B3D2E] font-bold' : 'text-[#5F7A6E]'
            }`}
          >
            <BookOpen className={`w-5 h-5 ${currentTab === 'khata' ? 'text-[#1F7A5C]' : ''}`} />
            <span className="text-[10px] mt-0.5">{t.khata}</span>
          </button>

          {/* Large Floating Centre Mic Button */}
          <div className="relative -top-5 flex-1 flex justify-center">
            <button
              onClick={() => {
                onTabChange('assistant');
                onQuickMicPress();
              }}
              className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                isRecording
                  ? 'bg-rose-500 text-white ring-4 ring-rose-300 animate-pulse'
                  : 'bg-gradient-to-tr from-[#0B3D2E] via-[#1F7A5C] to-[#25D366] text-white ring-4 ring-[#DDF3E7]'
              }`}
              title="Press to speak Voice Khata"
            >
              <Mic className={`w-6 h-6 ${isRecording ? 'animate-bounce' : ''}`} />
            </button>
          </div>

          {/* Stock */}
          <button
            onClick={() => onTabChange('stock')}
            className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors ${
              currentTab === 'stock' ? 'text-[#0B3D2E] font-bold' : 'text-[#5F7A6E]'
            }`}
          >
            <Package className={`w-5 h-5 ${currentTab === 'stock' ? 'text-[#1F7A5C]' : ''}`} />
            <span className="text-[10px] mt-0.5">{t.stock}</span>
          </button>

          {/* Reminders / More */}
          <button
            onClick={() => onTabChange('reminders')}
            className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors ${
              currentTab === 'reminders' ? 'text-[#0B3D2E] font-bold' : 'text-[#5F7A6E]'
            }`}
          >
            <BellRing className={`w-5 h-5 ${currentTab === 'reminders' ? 'text-[#1F7A5C]' : ''}`} />
            <span className="text-[10px] mt-0.5">Reminder</span>
          </button>

          {/* Leads CRM */}
          <button
            onClick={() => onTabChange('leads')}
            className={`relative flex-1 flex flex-col items-center justify-center py-1 transition-colors ${
              currentTab === 'leads' ? 'text-[#0B3D2E] font-bold' : 'text-[#5F7A6E]'
            }`}
          >
            <Users className={`w-5 h-5 ${currentTab === 'leads' ? 'text-[#1F7A5C]' : ''}`} />
            <span className="text-[10px] mt-0.5">Leads</span>
            {leadsDue > 0 && (
              <span className="absolute top-0 right-2 min-w-4 h-4 px-1 rounded-full bg-[#F5A623] text-[#0B3D2E] text-[9px] font-black flex items-center justify-center">
                {leadsDue}
              </span>
            )}
          </button>
        </div>
      </nav>
    </>
  );
};
