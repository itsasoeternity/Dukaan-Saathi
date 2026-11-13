import React, { useState } from 'react';
import { Header } from './components/common/Header';
import { Navigation, NavTab } from './components/common/Navigation';
import { UndoToast } from './components/common/UndoToast';
import { DemoGuideModal } from './components/common/DemoGuideModal';
import { ConsentModal } from './components/common/ConsentModal';
import { UpiQrModal } from './components/common/UpiQrModal';

import { HomeDashboard } from './components/home/HomeDashboard';
import { AssistantChat } from './components/assistant/AssistantChat';
import { KhataScreen } from './components/khata/KhataScreen';
import { RemindersScreen } from './components/reminders/RemindersScreen';
import { StockScreen } from './components/stock/StockScreen';
import { InsightsScreen } from './components/insights/InsightsScreen';
import { SettingsScreen } from './components/settings/SettingsScreen';
import { CrmScreen } from './components/crm/CrmScreen';

import { useLedger } from './hooks/useLedger';
import { useStock } from './hooks/useStock';
import { useCrm } from './hooks/useCrm';
import { Language } from './types';
import { useShopSync } from './hooks/useShopSync';
import { hasUnsynced } from './lib/storage';
import type { PublicShop } from './services/account';

interface AppProps {
  /** 'shop' = logged in, data synced to the server; 'demo' = sample data in this browser only. */
  mode: 'shop' | 'demo';
  shop?: PublicShop;
  onLogout: () => void;
}

export default function App({ mode, shop, onLogout }: AppProps) {
  const {
    profile,
    setProfile,
    customers,
    transactions,
    reminders,
    customerBalances,
    todaySummary,
    totalUdhaar,
    overdueCustomers,
    topDebtors,
    topCustomersThisWeek,
    cashFlow7Days,
    lastAction,
    addTransaction,
    undoLastTransaction,
    clearUndo,
    deleteTransaction,
    addCustomer,
    updateCustomer,
    recordConsent,
    withdrawConsent,
    deleteCustomer,
    exportCustomerData,
    logReminderOpened,
    resetToDemo: resetLedgerToDemo,
    clearAllData,
    exportData,
    importData,
  } = useLedger();

  const {
    catalog,
    scans,
    reorderList,
    lowStockProducts,
    outOfStockProducts,
    latestChanges,
    compareWithPreviousScan,
    addScan,
    updateProduct,
    addProduct,
    addToReorder,
    updateReorderQty,
    removeFromReorder,
    clearReorder,
    populateReorderFromLowStock,
    exportReorderCsv,
    resetStockToDemo,
  } = useStock(profile.id);

  const crm = useCrm(profile.id, mode);

  const sync = useShopSync(mode === 'shop', {
    profile,
    customers,
    transactions,
    reminders,
    catalog,
    scans,
    reorder: reorderList,
    leads: crm.leads,
    templates: crm.templates,
    scheduled: crm.scheduled,
  });

  const handleLogout = async () => {
    await sync.flush();
    if (mode === 'shop' && hasUnsynced()) {
      const ok = confirm(
        'Kuch entries abhi server par nahi pahunchi (net nahi hai). Logout karne par woh is phone se mit jayengi. Phir bhi logout karein?',
      );
      if (!ok) return;
    }
    onLogout();
  };

  const [currentTab, setCurrentTab] = useState<NavTab>('home');
  const [isDemoGuideOpen, setIsDemoGuideOpen] = useState(false);
  const [externalVoiceTrigger, setExternalVoiceTrigger] = useState(false);

  // UPI QR Modal state
  const [upiQrState, setUpiQrState] = useState<{ isOpen: boolean; customerName: string; amountPaise: number }>({
    isOpen: false,
    customerName: '',
    amountPaise: 0,
  });

  const handleLanguageChange = (lang: Language) => {
    setProfile({ ...profile, language: lang });
  };

  const handleOpenUpiQr = (customerName: string, amountPaise: number) => {
    setUpiQrState({ isOpen: true, customerName, amountPaise: Math.max(100, amountPaise) });
  };

  // Demo step runner from the Demo Guide modal
  const handleRunDemoStep = (stepIndex: number) => {
    if (stepIndex === 0) {
      // Step 1: Voice Khata Entry
      setCurrentTab('assistant');
      setExternalVoiceTrigger(true);
    } else if (stepIndex === 1) {
      // Step 2: Query balance
      setCurrentTab('assistant');
    } else if (stepIndex === 2) {
      // Step 3: Scan Shelf
      setCurrentTab('stock');
    } else if (stepIndex === 3) {
      // Step 4: Send Reminder
      setCurrentTab('reminders');
    } else if (stepIndex === 4) {
      // Step 5: View Dashboard
      setCurrentTab('home');
    }
  };

  const handleResetAllToDemo = () => {
    resetLedgerToDemo();
    resetStockToDemo();
    crm.resetCrmToDemo();
  };

  // Find last action customer name for the undo toast
  const lastActionCustomerName = React.useMemo(() => {
    if (!lastAction) return 'Customer';
    if (!lastAction.transaction.customer_id) return 'Counter bikri';
    const c = customers.find((cust) => cust.id === lastAction.transaction.customer_id);
    return c?.name || 'Customer';
  }, [lastAction, customers]);

  return (
    <div className="min-h-screen bg-[#F2F8F5] text-[#123D31] flex flex-col font-sans selection:bg-[#25D366]/30">
      {/* Top Header */}
      <Header
        mode={mode}
        syncStatus={sync.status}
        accountEmail={shop?.email}
        onLogout={handleLogout}
        profile={profile}
        language={profile.language}
        onLanguageChange={handleLanguageChange}
        onOpenDemoGuide={() => setIsDemoGuideOpen(true)}
        onOpenSettings={() => setCurrentTab('settings')}
        onOpenChat={() => setCurrentTab('assistant')}
      />

      {/* Main Body Layout */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Desktop Sidebar & Mobile Bottom Navigation */}
        <Navigation
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          language={profile.language}
          leadsDue={crm.due.length}
          onQuickMicPress={() => {
            setCurrentTab('assistant');
            setExternalVoiceTrigger(true);
          }}
        />

        {/* Dynamic Screen View */}
        <main className="flex-1 px-3 sm:px-6 py-4 lg:py-6 overflow-y-auto">
          {currentTab === 'home' && (
            <HomeDashboard
              profile={profile}
              language={profile.language}
              totalUdhaar={totalUdhaar}
              todaySummary={todaySummary}
              lowStockProducts={lowStockProducts}
              outOfStockProducts={outOfStockProducts}
              overdueCustomers={overdueCustomers}
              topDebtors={topDebtors}
              topCustomersThisWeek={topCustomersThisWeek}
              customers={customers}
              transactions={transactions}
              reminders={reminders}
              catalog={catalog}
              cashFlow7Days={cashFlow7Days}
              scans={scans}
              onNavigate={setCurrentTab}
              onOpenQuickVoice={() => {
                setCurrentTab('assistant');
                setExternalVoiceTrigger(true);
              }}
              onOpenAddCustomer={() => setCurrentTab('khata')}
            />
          )}

          {currentTab === 'assistant' && (
            <AssistantChat
              profile={profile}
              language={profile.language}
              customers={customers}
              customerBalances={customerBalances}
              todaySummary={todaySummary}
              catalog={catalog}
              previousScanNotes={scans[0]?.overall_notes}
              onAddTransaction={addTransaction}
              onAddCustomer={addCustomer}
              onAddScan={addScan}
              externalVoiceTrigger={externalVoiceTrigger}
              onResetVoiceTrigger={() => setExternalVoiceTrigger(false)}
            />
          )}

          {currentTab === 'khata' && (
            <KhataScreen
              profile={profile}
              language={profile.language}
              customers={customers}
              transactions={transactions}
              customerBalances={customerBalances}
              onAddTransaction={addTransaction}
              onAddCustomer={addCustomer}
              onUpdateCustomer={updateCustomer}
              onDeleteTransaction={deleteTransaction}
              mode={mode}
              onRecordConsent={recordConsent}
              onWithdrawConsent={withdrawConsent}
              onDeleteCustomer={deleteCustomer}
              onExportCustomer={exportCustomerData}
              onLogReminderOpened={logReminderOpened}
              onOpenUpiQr={handleOpenUpiQr}
            />
          )}

          {currentTab === 'stock' && (
            <StockScreen
              profile={profile}
              language={profile.language}
              catalog={catalog}
              scans={scans}
              reorderList={reorderList}
              latestChanges={latestChanges}
              compareWithPreviousScan={compareWithPreviousScan}
              onAddScan={addScan}
              onUpdateProduct={updateProduct}
              onAddProduct={addProduct}
              onAddToReorder={addToReorder}
              onUpdateReorderQty={updateReorderQty}
              onRemoveFromReorder={removeFromReorder}
              onClearReorder={clearReorder}
              onPopulateReorderFromLowStock={populateReorderFromLowStock}
              onExportReorderCsv={exportReorderCsv}
            />
          )}

          {currentTab === 'reminders' && (
            <RemindersScreen
              profile={profile}
              language={profile.language}
              customers={customers}
              customerBalances={customerBalances}
              reminders={reminders}
              transactions={transactions}
              onUpdateProfile={setProfile}
              onLogReminderOpened={logReminderOpened}
              onOpenUpiQr={handleOpenUpiQr}
            />
          )}

          {currentTab === 'leads' && <CrmScreen profile={profile} crm={crm} />}

          {currentTab === 'insights' && (
            <InsightsScreen
              language={profile.language}
              customers={customers}
              transactions={transactions}
              customerBalances={customerBalances}
              catalog={catalog}
              onAddToReorder={addToReorder}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsScreen
              profile={profile}
              onUpdateProfile={setProfile}
              onResetToDemo={handleResetAllToDemo}
              onClearAllData={clearAllData}
              onExportData={exportData}
              onImportData={importData}
              mode={mode}
              accountEmail={shop?.email}
              onLogout={handleLogout}
            />
          )}
        </main>
      </div>

      {/* Floating 5-Second Undo Toast */}
      <UndoToast
        lastAction={lastAction}
        customerName={lastActionCustomerName}
        onUndo={undoLastTransaction}
        onDismiss={clearUndo}
      />

      {/* Interactive 2-Minute Demo Guide Stepper */}
      <DemoGuideModal
        isOpen={isDemoGuideOpen}
        onClose={() => setIsDemoGuideOpen(false)}
        onNavigateToTab={setCurrentTab}
        onRunDemoStep={handleRunDemoStep}
      />

      {/* DPDP Consent & First Launch Modal */}
      <ConsentModal
        isOpen={!profile.consent_accepted}
        allowDemoChoice={mode === 'demo'}
        profile={profile}
        onComplete={(newProfile) => setProfile(newProfile)}
        onStartEmpty={clearAllData}
      />

      {/* UPI QR Payment Modal */}
      <UpiQrModal
        isOpen={upiQrState.isOpen}
        onClose={() => setUpiQrState((prev) => ({ ...prev, isOpen: false }))}
        customerName={upiQrState.customerName}
        amountPaise={upiQrState.amountPaise}
        shopName={profile.name}
        upiId={profile.upi_id}
      />
    </div>
  );
}
