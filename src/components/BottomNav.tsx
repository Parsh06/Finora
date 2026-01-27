import { motion } from "framer-motion";
import { Home, PieChart, Target, Sparkles, Settings, Plus, RefreshCw, Scan } from "lucide-react";

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onAddTransaction: () => void;
  onScanBill?: () => void;
}

const navItems = [
  { id: "home", icon: Home, label: "Home" },
  { id: "analytics", icon: PieChart, label: "Stats" },
  { id: "add", icon: Plus, label: "Add", isAction: true },
  { id: "recurring", icon: RefreshCw, label: "Bills" },
  { id: "settings", icon: Settings, label: "More" },
];

export const BottomNav = ({ activeTab, onTabChange, onAddTransaction, onScanBill }: BottomNavProps) => {
  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      className="fixed bottom-0 inset-x-0 z-30"
    >
      <div className="mx-4 mb-4">
        <div 
          className="flex items-center justify-around py-3 px-2 rounded-2xl border"
          style={{
            background: "linear-gradient(180deg, hsl(220, 20%, 12% / 0.95), hsl(220, 20%, 8% / 0.95))",
            borderColor: "hsl(220, 15%, 20% / 0.5)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 -4px 30px hsl(220, 20%, 4% / 0.5)"
          }}
        >
          {navItems.map((item) => {
            if (item.isAction) {
              return (
                <motion.button
                  key={item.id}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onAddTransaction}
                  className="w-14 h-14 -mt-8 rounded-full flex items-center justify-center shadow-lg"
                  style={{
                    background: "var(--gradient-primary)",
                    boxShadow: "0 4px 20px hsl(165, 80%, 45% / 0.4)"
                  }}
                >
                  <Plus className="w-6 h-6 text-primary-foreground" />
                </motion.button>
              );
            }

            const isActive = activeTab === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`nav-item ${isActive ? "active" : ""}`}
              >
                <Icon 
                  className={`w-5 h-5 transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`} 
                />
                <span 
                  className={`text-xs transition-colors ${
                    isActive ? "text-foreground font-medium" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </motion.nav>
  );
};

export default BottomNav;
