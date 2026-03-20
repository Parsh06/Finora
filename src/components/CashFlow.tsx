import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  TrendingUp, 
  AlertTriangle, 
  Settings, 
  ChevronRight, 
  ArrowLeft, 
  Sparkles, 
  DollarSign, 
  Calendar, 
  Info,
  RefreshCw,
  Zap
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine,
  Cell
} from "recharts";
import { 
  format, 
  addDays, 
  eachDayOfInterval, 
  isSameDay, 
  parseISO, 
  differenceInDays, 
  startOfDay,
  subDays,
  isAfter,
  isBefore
} from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { 
  subscribeToTransactions, 
  subscribeToRecurringPayments, 
  Transaction, 
  RecurringPayment,
  updateUserProfile 
} from "@/lib/firestore";
import { toast } from "sonner";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { groqChatCompletion } from "@/lib/groq-service";

interface CashFlowDataPoint {
  date: string;
  displayDate: string;
  balance: number;
  isDanger: boolean;
  event?: string;
}

export const CashFlow = () => {
  const { currentUser, userProfile } = useAuth();
  const { isPrivacyEnabled } = usePrivacy();
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [daysToProject, setDaysToProject] = useState(30);
  const [aiInsight, setAiInsight] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  // Setup state
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [initialBalance, setInitialBalance] = useState(userProfile?.currentBalance?.toString() || "");
  const [salaryAmount, setSalaryAmount] = useState(userProfile?.salaryAmount?.toString() || "");
  const [salaryDate, setSalaryDate] = useState(userProfile?.salaryDate?.toString() || "1");
  const [safetyFloor, setSafetyFloor] = useState(userProfile?.cashFlowSafetyFloor?.toString() || "5000");

  useEffect(() => {
    if (!currentUser) return;

    const unsubTransactions = subscribeToTransactions(currentUser.uid, (data) => {
      setTransactions(data);
      setLoading(false);
    });

    const unsubRecurring = subscribeToRecurringPayments(currentUser.uid, setRecurringPayments);

    return () => {
      unsubTransactions();
      unsubRecurring();
    };
  }, [currentUser]);

  const handleSetupSave = async () => {
    if (!currentUser) return;
    
    try {
      await updateUserProfile(currentUser.uid, {
        currentBalance: parseFloat(initialBalance) || 0,
        salaryAmount: parseFloat(salaryAmount) || 0,
        salaryDate: parseInt(salaryDate) || 1,
        cashFlowSafetyFloor: parseFloat(safetyFloor) || 5000,
      });
      setIsSettingUp(false);
      toast.success("Cash flow settings updated!");
      // Trigger AI insight after setup
      generateAiInsight();
    } catch (error) {
      toast.error("Failed to save settings");
    }
  };

  const projectionData = useMemo(() => {
    if (!userProfile?.currentBalance && !isSettingUp) return [];

    const startBalance = userProfile?.currentBalance || 0;
    const floor = userProfile?.cashFlowSafetyFloor || 5000;
    const today = startOfDay(new Date());
    const endDate = addDays(today, daysToProject);
    
    const days = eachDayOfInterval({ start: today, end: endDate });
    
    // Step 1: Calculate average daily spend (last 60 days, weighted)
    const sixtyDaysAgo = subDays(today, 60);
    const recentTransactions = transactions.filter(t => 
      t.type === "expense" && 
      !t.isRecurring && 
      isAfter(t.date instanceof Date ? t.date : (t.date as any).toDate(), sixtyDaysAgo)
    );

    const dailySpends = new Map<string, number>();
    recentTransactions.forEach(t => {
      const dateStr = format(t.date instanceof Date ? t.date : (t.date as any).toDate(), "yyyy-MM-dd");
      dailySpends.set(dateStr, (dailySpends.get(dateStr) || 0) + t.amount);
    });

    let totalWeight = 0;
    let weightedSum = 0;
    
    for (let i = 0; i < 60; i++) {
      const d = subDays(today, i);
      const ds = format(d, "yyyy-MM-dd");
      const weight = i < 30 ? 1.5 : 1.0; // Last 30 days matter more
      weightedSum += (dailySpends.get(ds) || 0) * weight;
      totalWeight += weight;
    }
    const avgDailySpend = weightedSum / totalWeight;

    // Step 2 & 3: Run simulation
    let currentSimBalance = startBalance;
    const result: CashFlowDataPoint[] = [];

    days.forEach((day, index) => {
      const dateStr = format(day, "yyyy-MM-dd");
      let dailyChange = -avgDailySpend;
      let event = "";

      // Check Salary
      if (day.getDate() === (userProfile?.salaryDate || 1)) {
        dailyChange += (userProfile?.salaryAmount || 0);
        event = "Salary Received";
      }

      // Check Recurring Payments & SIPs
      recurringPayments.forEach(rp => {
          if (rp.status !== "active") return;
          
          // Basic logic: if day matches frequency from startDate
          // More advanced: use calculation from recurring-transactions.ts
          // For now, let's use a simplified version for the projection
          
          let isMatch = false;
          if (rp.frequency === "monthly" && day.getDate() === parseISO(rp.startDate).getDate()) {
              isMatch = true;
          } else if (rp.frequency === "daily") {
              isMatch = true;
          } else if (rp.frequency === "weekly" && day.getDay() === parseISO(rp.startDate).getDay()) {
              isMatch = true;
          }

          if (isMatch) {
              const amount = rp.amount; // TODO: Apply SIP step-up logic if needed
              if (rp.type === "expense") dailyChange -= amount;
              else dailyChange += amount;
              event = event ? `${event}, ${rp.name}` : rp.name;
          }
      });

      currentSimBalance += dailyChange;
      
      result.push({
        date: dateStr,
        displayDate: format(day, "MMM d"),
        balance: Math.round(currentSimBalance),
        isDanger: currentSimBalance < floor,
        event
      });
    });

    return result;
  }, [userProfile, transactions, recurringPayments, daysToProject, isSettingUp]);

  const dangerDays = projectionData.filter(d => d.isDanger);

  const generateAiInsight = async () => {
    if (!currentUser || projectionData.length === 0) return;
    
    setIsAiLoading(true);
    try {
      const dangerInfo = dangerDays.length > 0 
        ? `I am projected to go below my safety floor on ${dangerDays[0].displayDate}. My lowest balance will be ₹${Math.min(...projectionData.map(d => d.balance))}.`
        : "My balance looks healthy for the next period.";
      
      const prompt = `Act as a helpful financial advisor named Finora. Based on this projection: ${dangerInfo} Current Balance: ₹${userProfile?.currentBalance}. Provide exactly two concise sentences of advice for the user. Focus on their upcoming "danger days" if any.`;
      
      const response = await groqChatCompletion([
        { role: "system", content: "You are Finora, a helpful financial advisor." },
        { role: "user", content: prompt }
      ]);
      setAiInsight(response);
    } catch (error) {
      console.error("Failed to generate AI insight:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    if (projectionData.length > 0 && !aiInsight) {
        generateAiInsight();
    }
  }, [projectionData]);

  const blurClass = isPrivacyEnabled ? "blur-md select-none" : "";

  if (!userProfile?.currentBalance && !isSettingUp) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card-elevated p-8 rounded-3xl text-center max-w-sm"
        >
            <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <TrendingUp className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Cash Flow Engine</h2>
            <p className="text-muted-foreground mb-8 text-sm">
                Forecast your balance for the next 90 days based on your salary and spending patterns.
            </p>
            <button
                onClick={() => setIsSettingUp(true)}
                className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/25 hover:scale-105 transition-transform"
            >
                Setup Projection
            </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <AnimatePresence>
        {isSettingUp ? (
          <motion.div 
            key="setup"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="p-6"
          >
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => setIsSettingUp(false)} className="p-2 rounded-xl bg-muted/50">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-xl font-bold">Projection Setup</h1>
            </div>

            <div className="space-y-6">
                <div className="glass-card p-6 rounded-2xl space-y-4">
                    <div>
                        <label className="text-sm font-medium text-muted-foreground mb-2 block flex items-center gap-2">
                            <DollarSign className="w-4 h-4" /> Initial Balance *
                        </label>
                        <input 
                            type="number" 
                            value={initialBalance} 
                            onChange={(e) => setInitialBalance(e.target.value)}
                            placeholder="Current account balance"
                            className="w-full bg-muted/30 border-none rounded-xl py-4 px-4 focus:ring-2 focus:ring-primary/50"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-muted-foreground mb-2 block flex items-center gap-2">
                            <Zap className="w-4 h-4 text-warning" /> Monthly Salary
                        </label>
                        <input 
                            type="number" 
                            value={salaryAmount} 
                            onChange={(e) => setSalaryAmount(e.target.value)}
                            placeholder="Average monthly income"
                            className="w-full bg-muted/30 border-none rounded-xl py-4 px-4 focus:ring-2 focus:ring-primary/50"
                        />
                    </div>
                </div>

                <div className="glass-card p-6 rounded-2xl space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium text-muted-foreground mb-2 block flex items-center gap-2">
                                <Calendar className="w-4 h-4" /> Salary Day
                            </label>
                            <select 
                                value={salaryDate} 
                                onChange={(e) => setSalaryDate(e.target.value)}
                                className="w-full bg-muted/30 border-none rounded-xl py-4 px-4 focus:ring-2 focus:ring-primary/50"
                            >
                                {[...Array(31)].map((_, i) => (
                                    <option key={i+1} value={i+1}>{i+1}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground mb-2 block flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-destructive" /> Safety Floor
                            </label>
                            <input 
                                type="number" 
                                value={safetyFloor} 
                                onChange={(e) => setSafetyFloor(e.target.value)}
                                className="w-full bg-muted/30 border-none rounded-xl py-4 px-4 focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                    </div>
                </div>

                <button 
                  onClick={handleSetupSave}
                  className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold shadow-xl shadow-primary/25"
                >
                    Save & Generate Forecast
                </button>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 sm:p-6"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Predictive Cash Flow</h1>
                    <p className="text-xs text-muted-foreground">30-90 Day Balance Forecast</p>
                </div>
                <button 
                    onClick={() => setIsSettingUp(true)}
                    className="p-3 rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
                >
                    <Settings className="w-5 h-5" />
                </button>
            </div>

            {/* Danger Strip */}
            <AnimatePresence>
                {dangerDays.length > 0 && (
                    <motion.div 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-6 space-y-2"
                    >
                        <div className="flex items-center gap-2 text-destructive font-bold text-xs uppercase tracking-wider px-1">
                            <AlertTriangle className="w-4 h-4" /> Low Balance Alerts
                        </div>
                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                            {dangerDays.slice(0, 10).map((day, i) => (
                                <div key={i} className="flex-shrink-0 bg-destructive/10 border border-destructive/20 p-3 rounded-2xl">
                                    <p className="text-[10px] text-destructive font-bold uppercase">{day.displayDate}</p>
                                    <p className={`text-sm font-black text-foreground ${blurClass}`}>₹{day.balance.toLocaleString()}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Chart Section */}
            <div className="glass-card-elevated p-4 rounded-3xl mb-6 relative">
              <div className="flex items-center justify-between mb-6">
                  <div className="flex gap-1">
                      {[30, 60, 90].map(d => (
                          <button 
                            key={d}
                            onClick={() => setDaysToProject(d)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${daysToProject === d ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground"}`}
                          >
                              {d}D
                          </button>
                      ))}
                  </div>
                  <button onClick={generateAiInsight} className="p-2 rounded-lg bg-primary/10 text-primary">
                      <RefreshCw className={`w-4 h-4 ${isAiLoading ? "animate-spin" : ""}`} />
                  </button>
              </div>

              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={projectionData}>
                    <defs>
                      <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.1)" />
                    <XAxis 
                        dataKey="displayDate" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fontSize: 10, fill: "hsl(var(--muted-foreground))"}}
                        interval={daysToProject === 90 ? 14 : 6}
                    />
                    <YAxis 
                        hide 
                        domain={['dataMin - 5000', 'dataMax + 5000']} 
                    />
                    <Tooltip 
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                const data = payload[0].payload as CashFlowDataPoint;
                                return (
                                    <div className="glass-card p-3 rounded-xl border-primary/20 shadow-xl">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase">{data.date}</p>
                                        <p className={`text-base font-black ${data.isDanger ? "text-destructive" : "text-primary"}`}>₹{data.balance.toLocaleString()}</p>
                                        {data.event && <p className="text-[10px] text-accent font-medium mt-1">📌 {data.event}</p>}
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                    <ReferenceLine 
                        y={userProfile?.cashFlowSafetyFloor || 5000} 
                        stroke="hsl(var(--destructive))" 
                        strokeDasharray="3 3" 
                        label={{ position: 'right', value: 'Safety', fill: 'hsl(var(--destructive))', fontSize: 10 }}
                    />
                    <Area 
                        type="monotone" 
                        dataKey="balance" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorBalance)" 
                        animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* AI Insight Card */}
            <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.2 }}
               className="glass-card p-5 rounded-3xl border-l-4 border-primary"
            >
                <div className="flex items-center gap-3 mb-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <p className="text-sm font-bold text-foreground">AI Insight</p>
                </div>
                {isAiLoading ? (
                    <div className="space-y-2">
                        <div className="h-3 bg-muted/50 rounded-full w-full animate-pulse" />
                        <div className="h-3 bg-muted/50 rounded-full w-2/3 animate-pulse" />
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {aiInsight || "Generating projection insights..."}
                    </p>
                )}
            </motion.div>

            {/* Next Events */}
            <div className="mt-8 space-y-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2">Key Upcoming Events</h3>
                <div className="space-y-3">
                    {projectionData.filter(d => d.event).slice(0, 5).map((d, i) => (
                        <div key={i} className="flex items-center justify-between p-4 glass-card rounded-2xl">
                             <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${d.isDanger ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"}`}>
                                    <Calendar className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">{d.event}</p>
                                    <p className="text-xs text-muted-foreground">{d.displayDate}</p>
                                </div>
                             </div>
                             <div className="text-right">
                                <p className={`text-sm font-black ${d.isDanger ? "text-destructive" : "text-foreground"}`}>₹{d.balance.toLocaleString()}</p>
                             </div>
                        </div>
                    ))}
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CashFlow;
