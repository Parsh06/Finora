import { motion } from "framer-motion";
import { Home, PieChart, Target, Sparkles, Settings, Plus, RefreshCw, Scan } from "lucide-react";

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onAddTransaction: () => void;
  onQuickActions: () => void;
  onScanBill?: () => void;
}

const navItems = [
  { id: "home", icon: Home, label: "Home" },
  { id: "analytics", icon: PieChart, label: "Stats" },
  { id: "add", icon: Plus, label: "Add", isAction: true },
  { id: "recurring", icon: RefreshCw, label: "Bills" },
  { id: "settings", icon: Settings, label: "More" },
];

export const BottomNav = ({ activeTab, onTabChange, onAddTransaction, onQuickActions, onScanBill }: BottomNavProps) => {
  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      className="fixed bottom-0 inset-x-0 z-40 pb-safe"
    >
      <div className="mx-6 mb-6">
        <div 
          className="flex items-center justify-around py-2 px-2 rounded-[2rem] border relative"
          style={{
            background: "linear-gradient(180deg, hsl(220 20% 12% / 0.8), hsl(220 20% 8% / 0.9))",
            borderColor: "hsl(220 15% 30% / 0.3)",
            backdropFilter: "blur(24px)",
            boxShadow: "0 20px 50px -12px hsl(0 0% 0% / 0.7), inset 0 1px 1px hsl(0 0% 100% / 0.05)"
          }}
        >
          {navItems.map((item) => {
            if (item.isAction) {
              return (
                <div key={item.id} className="relative">
                  <motion.div
                    className="absolute inset-0 bg-primary/20 blur-xl rounded-full"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onQuickActions}
                    className="w-14 h-14 -mt-10 rounded-full flex items-center justify-center relative z-10"
                    style={{
                      background: "var(--gradient-primary)",
                      boxShadow: "0 10px 25px -5px hsl(165 80% 45% / 0.5), 0 0 0 4px hsl(220 20% 8% / 0.5)"
                    }}
                  >
                    <Plus className="w-6 h-6 text-primary-foreground" strokeWidth={3} />
                  </motion.button>
                </div>
              );
            }

            const isActive = activeTab === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className="relative flex flex-col items-center gap-1 p-2 min-w-[3.5rem] transition-all duration-300 active:scale-90"
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-active"
                    className="absolute top-0 w-8 h-1 bg-primary rounded-full shadow-[0_0_10px_hsl(165,80%,45%)]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon 
                  className={`w-5 h-5 transition-all duration-300 ${
                    isActive ? "text-primary scale-110 drop-shadow-[0_0_8px_hsl(165,80%,45%,0.5)]" : "text-muted-foreground hover:text-foreground"
                  }`} 
                />
                <span 
                  className={`text-[10px] uppercase tracking-widest font-bold transition-all duration-300 ${
                    isActive ? "text-foreground opacity-100" : "text-muted-foreground opacity-50"
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
