import { motion } from "framer-motion";
import { 
  AlertTriangle, 
  TrendingUp, 
  Zap, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  ArrowRight,
  ShieldAlert,
  Ghost
} from "lucide-react";
import { SubscriptionInsight } from "@/lib/subscription-service";
import { RecurringPayment, Transaction } from "@/lib/firestore";

interface SubscriptionAuditorProps {
  insights: SubscriptionInsight[];
  onAddRecurring: (insight: SubscriptionInsight) => void;
  onIgnore: (id: string) => void;
}

export const SubscriptionAuditor = ({ insights, onAddRecurring, onIgnore }: SubscriptionAuditorProps) => {
  if (insights.length === 0) return null;

  return (
    <div className="space-y-4 mb-8">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-bold flex items-center gap-2">
          Subscription Insights <Zap className="w-4 h-4 text-warning fill-warning" />
        </h2>
        <span className="text-[10px] font-bold bg-warning/10 text-warning px-2 py-0.5 rounded-full uppercase tracking-wider">
          AI Audit Active
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {insights.map((insight) => (
          <motion.div
            key={insight.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`glass-card p-4 relative overflow-hidden border-l-4 ${
              insight.type === "hike" 
                ? "border-l-destructive bg-destructive/5" 
                : insight.type === "zombie"
                ? "border-l-warning bg-warning/5"
                : "border-l-primary bg-primary/5"
            }`}
          >
            <div className="flex gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                insight.type === "hike" 
                  ? "bg-destructive/10 text-destructive" 
                  : insight.type === "zombie"
                  ? "bg-warning/10 text-warning"
                  : "bg-primary/10 text-primary"
              }`}>
                {insight.type === "hike" && <TrendingUp className="w-5 h-5" />}
                {insight.type === "zombie" && <Ghost className="w-5 h-5" />}
                {insight.type === "potential" && <ShieldAlert className="w-5 h-5" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="font-bold text-sm truncate">{insight.merchant}</h3>
                  <span className="font-bold text-sm">₹{insight.amount.toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  {insight.message}
                </p>

                <div className="flex items-center gap-2">
                  {insight.type === "potential" ? (
                    <button
                      onClick={() => onAddRecurring(insight)}
                      className="flex-1 bg-primary text-primary-foreground text-[11px] font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 hover:opacity-90 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" /> Start Tracking
                    </button>
                  ) : (
                    <button
                      onClick={() => onIgnore(insight.id)}
                      className="flex-1 bg-secondary text-foreground text-[11px] font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 hover:bg-muted transition-all"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Got it
                    </button>
                  )}
                  <button
                    onClick={() => onIgnore(insight.id)}
                    className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    title="Dismiss"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Subtle background decoration */}
            <div className="absolute -bottom-2 -right-2 opacity-[0.03] rotate-12">
               {insight.type === "hike" && <TrendingUp className="w-24 h-24" />}
               {insight.type === "zombie" && <Ghost className="w-24 h-24" />}
               {insight.type === "potential" && <ShieldAlert className="w-24 h-24" />}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
