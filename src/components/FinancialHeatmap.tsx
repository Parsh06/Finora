import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns";
import { Transaction } from "@/lib/firestore";

interface FinancialHeatmapProps {
  transactions: Transaction[];
}

export const FinancialHeatmap: React.FC<FinancialHeatmapProps> = ({ transactions }) => {
  const now = new Date();
  const days = useMemo(() => {
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    return eachDayOfInterval({ start, end });
  }, []);

  const dailyStats = useMemo(() => {
    const stats: Record<string, { expense: number; income: number }> = {};
    
    transactions.forEach(t => {
      const date = t.date instanceof Date ? t.date : (t.date as any).toDate();
      const dateStr = format(date, "yyyy-MM-dd");
      
      if (!stats[dateStr]) {
        stats[dateStr] = { expense: 0, income: 0 };
      }
      
      if (t.type === "expense") {
        stats[dateStr].expense += t.amount;
      } else {
        stats[dateStr].income += t.amount;
      }
    });
    
    return stats;
  }, [transactions]);

  const getIntensityClass = (amount: number, type: "expense" | "income") => {
    if (amount === 0) return "bg-secondary/20";
    if (type === "expense") {
      if (amount > 5000) return "bg-destructive";
      if (amount > 1000) return "bg-destructive/60";
      return "bg-destructive/30";
    } else {
      if (amount > 10000) return "bg-success";
      if (amount > 2000) return "bg-success/60";
      return "bg-success/30";
    }
  };

  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Activity Heatmap</h3>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{format(now, "MMMM yyyy")}</p>
      </div>
      
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {["S", "M", "T", "W", "T", "F", "S"].map(day => (
          <div key={day} className="text-[10px] text-center text-muted-foreground font-medium pb-1">
            {day}
          </div>
        ))}
        
        {/* Padding for first day of month */}
        {Array.from({ length: days[0].getDay() }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        
        {days.map(day => {
          const dateStr = format(day, "yyyy-MM-dd");
          const stats = dailyStats[dateStr] || { expense: 0, income: 0 };
          const isToday = isSameDay(day, now);
          
          return (
            <motion.div
              key={dateStr}
              whileHover={{ scale: 1.2, zIndex: 10 }}
              className={`aspect-square rounded-sm sm:rounded-md transition-colors relative group ${
                getIntensityClass(stats.expense || stats.income, stats.income > stats.expense ? "income" : "expense")
              } ${isToday ? "ring-1 ring-primary ring-offset-1 ring-offset-background" : ""}`}
            >
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-[10px] rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-20 transition-opacity">
                <p className="font-bold">{format(day, "MMM d")}</p>
                {stats.income > 0 && <p className="text-success">In: ₹{stats.income.toLocaleString()}</p>}
                {stats.expense > 0 && <p className="text-destructive">Out: ₹{stats.expense.toLocaleString()}</p>}
                {stats.income === 0 && stats.expense === 0 && <p className="text-muted-foreground">No activity</p>}
              </div>
            </motion.div>
          );
        })}
      </div>
      
      <div className="mt-4 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-success/60" />
          <span>Income</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-destructive/60" />
          <span>Expense</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-secondary/20" />
          <span>No Data</span>
        </div>
      </div>
    </div>
  );
};
