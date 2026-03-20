import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { OnboardingFlow } from "@/components/OnboardingFlow";
import { AuthPages } from "@/components/AuthPages";
import { Dashboard } from "@/components/Dashboard";
import { Analytics } from "@/components/Analytics";
import { BudgetManagement } from "@/components/BudgetManagement";
import { Transactions } from "@/components/Transactions";
import { AddTransaction } from "@/components/AddTransaction";
import { BillScanner } from "@/components/BillScanner";
import { VoiceTransaction } from "@/components/VoiceTransaction";
import { RecurringPayments } from "@/components/RecurringPayments";
import { GoalsPlanning } from "@/pages/GoalsPlanning";
import { SplitGroups } from "@/components/SplitGroups";
import { SettingsProfile } from "@/components/SettingsProfile";
import { CashFlow } from "@/components/CashFlow";
import NetWorthPage from "@/pages/NetWorthPage";
import { QuickActionsDrawer } from "@/components/QuickActionsDrawer";
import { BottomNav } from "@/components/BottomNav";
import { Preloader } from "@/components/Preloader";
import { useAuth } from "@/contexts/AuthContext";
import { useRecurringTransactions } from "@/hooks/useRecurringTransactions";

const Index = () => {
  const { currentUser, loading, logout } = useAuth();

  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState("home");

  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showBillScanner, setShowBillScanner] = useState(false);
  const [showVoiceTransaction, setShowVoiceTransaction] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);

  // Auto-process recurring transactions
  useRecurringTransactions();

  /* 🔹 Resolve onboarding ONLY once */
  useEffect(() => {
    try {
      const seen = localStorage.getItem("finora-onboarding-complete");
      setShowOnboarding(!seen);
    } catch {
      setShowOnboarding(false);
    }
  }, []);

  /* 🔹 Reset UI on logout */
  useEffect(() => {
    if (!currentUser && !loading) {
      setActiveTab("home");
    }
  }, [currentUser, loading]);

  const handleOnboardingComplete = () => {
    try {
      localStorage.setItem("finora-onboarding-complete", "true");
    } catch { }
    setShowOnboarding(false);
  };

  const handleLogout = async () => {
    await logout();
  };

  /* ⏳ Wait for auth + onboarding resolution */
  if (loading || showOnboarding === null) {
    return <Preloader message="Initializing Finora..." />;
  }

  /* 🧭 1. Onboarding */
  if (showOnboarding) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  /* 🔐 2. Auth */
  if (!currentUser) {
    return <AuthPages />;
  }

  /* 🏠 3. App shell */
  const renderActiveTab = () => {
    return (
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex-1 overflow-y-auto scrollbar-hide"
      >
        {(() => {
          switch (activeTab) {
            case "home":
              return (
                <Dashboard
                  onNavigate={setActiveTab}
                  onScanBill={() => setShowBillScanner(true)}
                  onVoiceTransaction={() => setShowVoiceTransaction(true)}
                />
              );
            case "analytics":
              return <Analytics />;
            case "budgets":
              return <BudgetManagement />;
            case "transactions":
              return <Transactions onBack={() => setActiveTab("home")} />;
            case "recurring":
              return <RecurringPayments />;
            case "savings":
              return <GoalsPlanning onBack={() => setActiveTab("home")} />;
            case "split":
              return <SplitGroups />;
            case "cashflow":
              return <CashFlow />;
            case "networth":
              return <NetWorthPage onBack={() => setActiveTab("home")} />;
            case "settings":
              return <SettingsProfile onLogout={handleLogout} />;
            default:
              return null;
          }
        })()}
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen mesh-background flex flex-col pt-safe px-safe overflow-hidden">
      <AnimatePresence mode="wait">
        {renderActiveTab()}
      </AnimatePresence>

      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onAddTransaction={() => setShowAddTransaction(true)}
        onQuickActions={() => setShowQuickActions(true)}
        onScanBill={() => setShowBillScanner(true)}
      />

      <AddTransaction
        isOpen={showAddTransaction}
        onClose={() => setShowAddTransaction(false)}
      />

      <BillScanner
        isOpen={showBillScanner}
        onClose={() => setShowBillScanner(false)}
      />

      <VoiceTransaction
        isOpen={showVoiceTransaction}
        onClose={() => setShowVoiceTransaction(false)}
      />

      <QuickActionsDrawer
        isOpen={showQuickActions}
        onClose={() => setShowQuickActions(false)}
        onNavigate={setActiveTab}
        onScanBill={() => setShowBillScanner(true)}
        onVoiceTransaction={() => setShowVoiceTransaction(true)}
        onAddTransaction={() => setShowAddTransaction(true)}
      />

    </div>
  );
};

export default Index;
