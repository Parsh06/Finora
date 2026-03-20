import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToTransactions, Transaction } from "@/lib/firestore";
import { format, startOfWeek, startOfMonth, startOfYear, eachDayOfInterval, eachMonthOfInterval, subMonths, endOfYear, endOfMonth, endOfDay, startOfDay, subDays } from "date-fns";
import { DateFilter, DateFilterState } from "./DateFilter";
import { TrendingUp, TrendingDown, Wallet, PiggyBank, ArrowUpRight, ArrowDownLeft, Target, Download, Sparkles, RefreshCw, ChevronDown, ChevronUp, Loader2, ChevronRight, Home, Flag } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { useCategories } from "@/hooks/useCategories";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { getOrGenerateNarrative } from "@/lib/narrative-service";
import { 
  groupTransactionsByMerchant, 
  getMerchantSparklineData, 
  normalizeMerchantName 
} from "@/lib/merchant-service";
import { updateUserProfile } from "@/lib/firestore";

type TabType = "weekly" | "monthly" | "yearly";

// --- Sub-components (Level 2 & Level 3) ---

const Sparkline = ({ data, color }: { data: number[], color: string }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 60;
    const y = 20 - (val / max) * 18; // Keep some padding
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width="60" height="20" className="opacity-80">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

const MerchantCard = ({ 
  merchant, 
  allTransactions, 
  categoryTotal, 
  onSelect,
  watchlist,
  onUpdateWatchlist
}: { 
  merchant: any, 
  allTransactions: any[], 
  categoryTotal: number, 
  onSelect: () => void,
  watchlist: string[],
  onUpdateWatchlist: (newList: string[]) => void
}) => {
  const normalized = normalizeMerchantName(merchant.name);
  const isFlagged = watchlist.includes(normalized);
  const percentage = Math.round((merchant.total / categoryTotal) * 100);
  const sparklineData = getMerchantSparklineData(allTransactions, normalized);

  const toggleFlag = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFlagged) {
      onUpdateWatchlist(watchlist.filter(m => m !== normalized));
      toast.success("Removed from watchlist");
    } else {
      onUpdateWatchlist([...watchlist, normalized]);
      toast.success("Merchant flagged for review");
    }
  };

  return (
    <div 
      onClick={onSelect}
      className="glass-card p-4 flex items-center gap-4 hover:border-primary/50 transition-all cursor-pointer group active:scale-[0.98]"
    >
      <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-lg font-bold flex-shrink-0 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
        {merchant.name.charAt(0)}
      </div>
      
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="font-bold text-sm truncate">{merchant.name}</p>
          {isFlagged && <Flag className="w-3 h-3 text-destructive fill-destructive" />}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-[10px] font-medium text-muted-foreground">{merchant.count} txns • {percentage}% of cat</p>
          <Sparkline data={sparklineData} color={isFlagged ? "#ef4444" : "#14b8a6"} />
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <p className="font-black text-sm">₹{merchant.total.toLocaleString()}</p>
        <button 
          onClick={toggleFlag}
          className={`p-1 rounded-md transition-colors ${isFlagged ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive"}`}
        >
          <Flag className={`w-3 h-3 ${isFlagged ? "fill-destructive" : ""}`} />
        </button>
      </div>
    </div>
  );
};

export const Analytics = () => {
  const { currentUser, userProfile } = useAuth();
  const { isPrivacyEnabled } = usePrivacy();
  const { categories, getCategoryIcon, getCategoryColor } = useCategories();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("monthly");
  const [isExporting, setIsExporting] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilterState>({ mode: "all" });
  
  // Drill-down state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMerchant, setSelectedMerchant] = useState<any | null>(null);
  const [merchantInsight, setMerchantInsight] = useState<string>("");
  const [isInsightLoading, setIsInsightLoading] = useState(false);

  // Refs for PDF export
  const chartRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const insightsRef = useRef<HTMLDivElement>(null);

  // Drill-down logic: Fetch AI insight for merchant breakdown
  useEffect(() => {
    if (selectedCategory && !selectedMerchant) {
      const fetchInsight = async () => {
        const topMerchants = groupTransactionsByMerchant(transactions, selectedCategory).slice(0, 3);
        if (topMerchants.length === 0) return;

        setIsInsightLoading(true);
        try {
          const apiKey = (import.meta.env as any).VITE_GROQ_API_KEY;
          const prompt = `Analyze these top merchants in the "${selectedCategory}" category: ${topMerchants.map(m => `${m.name} (₹${m.total})`).join(", ")}. 
          Provide a ONE SENTENCE observation about this breakdown. Be concise and helpful.`;

          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages: [{ role: "system", content: prompt }],
              temperature: 0.5,
              max_tokens: 100
            })
          });

          if (response.ok) {
            const data = await response.json();
            setMerchantInsight(data.choices[0].message.content);
          }
        } catch (err) {
          console.error("Merchant insight error:", err);
        } finally {
          setIsInsightLoading(false);
        }
      };

      fetchInsight();
    } else {
      setMerchantInsight("");
    }
  }, [selectedCategory, selectedMerchant]);

  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToTransactions(currentUser.uid, (data) => {
      setTransactions(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Calculate comprehensive analytics data
  const analyticsData = useMemo(() => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    // Use date filter if set, otherwise use activeTab
    if (dateFilter.mode === "year" && dateFilter.year !== undefined) {
      startDate = startOfYear(new Date(dateFilter.year, 0, 1));
      endDate = endOfYear(new Date(dateFilter.year, 11, 31));
    } else if (dateFilter.mode === "month" && dateFilter.year !== undefined && dateFilter.month !== undefined) {
      startDate = startOfMonth(new Date(dateFilter.year, dateFilter.month, 1));
      endDate = endOfMonth(new Date(dateFilter.year, dateFilter.month, 1));
    } else if (dateFilter.mode === "day" && dateFilter.year !== undefined && dateFilter.month !== undefined && dateFilter.day !== undefined) {
      startDate = startOfDay(new Date(dateFilter.year, dateFilter.month, dateFilter.day));
      endDate = endOfDay(new Date(dateFilter.year, dateFilter.month, dateFilter.day));
    } else {
      // Use activeTab for default filtering
      if (activeTab === "weekly") {
        startDate = subDays(now, 6); // Last 7 days
      } else if (activeTab === "monthly") {
        startDate = startOfMonth(now);
      } else {
        startDate = startOfYear(now);
      }
    }

    const filteredTransactions = transactions.filter((t) => {
      const date = t.date instanceof Date ? t.date : t.date.toDate();
      return date >= startDate && date <= endDate;
    });

    // Income vs Expense totals
    const income = filteredTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const expense = filteredTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const savings = income - expense;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;

    // Category breakdown for expenses
    const expenseCategoriesData: Record<string, number> = {};
    filteredTransactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        // Use category name as-is (not lowercase) to match Firestore categories
        const cat = t.category;
        expenseCategoriesData[cat] = (expenseCategoriesData[cat] || 0) + t.amount;
      });

    const pieData = Object.entries(expenseCategoriesData)
      .map(([name, value]) => ({
        name: name,
        value,
        icon: getCategoryIcon(name, "expense"),
        color: getCategoryColor(name, "expense"),
      }))
      .sort((a, b) => b.value - a.value);

    // Income vs Expense comparison chart data - based on date filter
    let comparisonData: Array<{ period: string; income: number; expense: number; savings: number }> = [];

    if (dateFilter.mode === "year" && dateFilter.year !== undefined) {
      // Show monthly breakdown for the selected year
      const yearStart = startOfYear(new Date(dateFilter.year, 0, 1));
      const yearEnd = endOfYear(new Date(dateFilter.year, 11, 31));
      const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });
      comparisonData = months.map((month) => {
        const monthTransactions = filteredTransactions.filter((t) => {
          const date = t.date instanceof Date ? t.date : t.date.toDate();
          return format(date, "yyyy-MM") === format(month, "yyyy-MM");
        });
        const monthIncome = monthTransactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
        const monthExpense = monthTransactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
        return {
          period: format(month, "MMM"),
          income: monthIncome,
          expense: monthExpense,
          savings: monthIncome - monthExpense,
        };
      });
    } else if (dateFilter.mode === "month" && dateFilter.year !== undefined && dateFilter.month !== undefined) {
      // Show daily breakdown for the selected month
      const monthStart = startOfMonth(new Date(dateFilter.year, dateFilter.month, 1));
      const monthEnd = endOfMonth(new Date(dateFilter.year, dateFilter.month, 1));
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
      comparisonData = days.map((day) => {
        const dayTransactions = filteredTransactions.filter((t) => {
          const date = t.date instanceof Date ? t.date : t.date.toDate();
          return format(date, "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
        });
        const dayIncome = dayTransactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
        const dayExpense = dayTransactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
        return {
          period: format(day, "d"),
          income: dayIncome,
          expense: dayExpense,
          savings: dayIncome - dayExpense,
        };
      });
    } else if (dateFilter.mode === "day" && dateFilter.year !== undefined && dateFilter.month !== undefined && dateFilter.day !== undefined) {
      // Single day - show hourly breakdown or just the day total
      const dayTransactions = filteredTransactions;
      const dayIncome = dayTransactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
      const dayExpense = dayTransactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
      comparisonData = [{
        period: format(new Date(dateFilter.year, dateFilter.month, dateFilter.day), "MMM d"),
        income: dayIncome,
        expense: dayExpense,
        savings: dayIncome - dayExpense,
      }];
    } else {
      // Default: use activeTab for comparison
      if (activeTab === "weekly") {
        const weekStart = subDays(now, 6);
        const days = eachDayOfInterval({ start: weekStart, end: now });
        comparisonData = days.map((day) => {
          // Use all transactions logic for consistency, though filteredTransactions is now aligned
          const dayTransactions = transactions.filter((t) => {
            const date = t.date instanceof Date ? t.date : t.date.toDate();
            return format(date, "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
          });
          const dayIncome = dayTransactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
          const dayExpense = dayTransactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
          return {
            period: format(day, "EEE"),
            income: dayIncome,
            expense: dayExpense,
            savings: dayIncome - dayExpense,
          };
        });
      } else if (activeTab === "monthly") {
        // Last 6 months
        const months = eachMonthOfInterval({
          start: subMonths(now, 5),
          end: now,
        });
        comparisonData = months.map((month) => {
          // Use all transactions for the chart trend, not just currently filtered ones
          const monthTransactions = transactions.filter((t) => {
            const date = t.date instanceof Date ? t.date : t.date.toDate();
            return format(date, "yyyy-MM") === format(month, "yyyy-MM");
          });
          const monthIncome = monthTransactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
          const monthExpense = monthTransactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
          return {
            period: format(month, "MMM"),
            income: monthIncome,
            expense: monthExpense,
            savings: monthIncome - monthExpense,
          };
        });
      } else {
        // Yearly - last 12 months
        const months = eachMonthOfInterval({
          start: subMonths(now, 11),
          end: now,
        });
        comparisonData = months.map((month) => {
          // Use all transactions for the chart trend
          const monthTransactions = transactions.filter((t) => {
            const date = t.date instanceof Date ? t.date : t.date.toDate();
            return format(date, "yyyy-MM") === format(month, "yyyy-MM");
          });
          const monthIncome = monthTransactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
          const monthExpense = monthTransactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
          return {
            period: format(month, "MMM"),
            income: monthIncome,
            expense: monthExpense,
            savings: monthIncome - monthExpense,
          };
        });
      }
    }

    // Top spending categories
    const topCategories = pieData.slice(0, 5);

    // Comparison with previous period
    let previousPeriodIncome = 0;
    let previousPeriodExpense = 0;

    if (activeTab === "weekly") {
      const lastWeekStart = new Date(startDate);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const lastWeekEnd = startDate;
      const lastWeekTransactions = transactions.filter((t) => {
        const date = t.date instanceof Date ? t.date : t.date.toDate();
        return date >= lastWeekStart && date < lastWeekEnd;
      });
      previousPeriodIncome = lastWeekTransactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
      previousPeriodExpense = lastWeekTransactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
    } else if (activeTab === "monthly") {
      const lastMonth = subMonths(startDate, 1);
      const lastMonthEnd = startDate;
      const lastMonthTransactions = transactions.filter((t) => {
        const date = t.date instanceof Date ? t.date : t.date.toDate();
        return date >= lastMonth && date < lastMonthEnd;
      });
      previousPeriodIncome = lastMonthTransactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
      previousPeriodExpense = lastMonthTransactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
    } else {
      const lastYear = subMonths(startDate, 12);
      const lastYearEnd = startDate;
      const lastYearTransactions = transactions.filter((t) => {
        const date = t.date instanceof Date ? t.date : t.date.toDate();
        return date >= lastYear && date < lastYearEnd;
      });
      previousPeriodIncome = lastYearTransactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
      previousPeriodExpense = lastYearTransactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
    }

    const incomeChange = previousPeriodIncome > 0 ? ((income - previousPeriodIncome) / previousPeriodIncome) * 100 : 0;
    const expenseChange = previousPeriodExpense > 0 ? ((expense - previousPeriodExpense) / previousPeriodExpense) * 100 : 0;

    return {
      income,
      expense,
      savings,
      savingsRate,
      pieData,
      comparisonData,
      topCategories,
      incomeChange,
      expenseChange,
      previousPeriodIncome,
      previousPeriodExpense,
      startDate,
      endDate: now,
    };
  }, [transactions, activeTab, dateFilter]);

  // PDF Export Function
  const exportToPDF = async () => {
    if (!currentUser || isExporting) return;

    setIsExporting(true);
    toast.loading("Generating premium report...", { id: "pdf-export" });

    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPosition = margin;

      // Brand Colors
      const colors = {
        primary: [20, 20, 30], // Dark background
        accent: [165, 80, 45], // Teal (approx HSL) -> RGB: [23, 206, 166] (approx)
        secondary: [40, 40, 50], // Lighter dark
        text: [20, 20, 30],
        textLight: [255, 255, 255],
        textMuted: [120, 120, 130],
        success: [34, 197, 94],
        danger: [239, 68, 68],
        warning: [245, 158, 11],
        info: [59, 130, 246]
      };

      // Helper: Check Page Break
      const checkPageBreak = (requiredHeight: number) => {
        if (yPosition + requiredHeight > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
          return true;
        }
        return false;
      };

      // Helper: Draw Rounded Rect with any cast to avoid TS issues
      const roundedRect = (x: number, y: number, w: number, h: number, rx: number, ry: number, style: string) => {
        (pdf as any).roundedRect(x, y, w, h, rx, ry, style);
      };

      // === HEADER ===
      // Dark Header Background
      pdf.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      pdf.rect(0, 0, pageWidth, 50, "F");

      // Logo / Brand Name
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(26);
      pdf.text("Finora.", margin, 20);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(200, 200, 200);
      pdf.text("Smart Personal Finance", margin, 26);

      // Report Title & Date (Right Aligned)
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.setTextColor(255, 255, 255);
      pdf.text("Financial Report", pageWidth - margin, 20, { align: "right" });

      const userName = userProfile?.name || currentUser?.displayName || "User";
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(200, 200, 200);
      pdf.text(`Prepared for ${userName}`, pageWidth - margin, 26, { align: "right" });

      const periodLabel = activeTab === "weekly" ? "Weekly" : activeTab === "monthly" ? "Monthly" : "Yearly";
      const { startDate, endDate } = analyticsData;
      const dateRange = `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`;
      pdf.text(`${periodLabel} Period: ${dateRange}`, pageWidth - margin, 32, { align: "right" });

      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 160);
      pdf.text(`Generated on ${format(new Date(), "PP p")}`, pageWidth - margin, 42, { align: "right" });

      yPosition = 60;

      // === SUMMARY CARDS ===
      const { income, expense, savings, savingsRate } = analyticsData;
      const cardWidth = (pageWidth - (margin * 2) - 10) / 3;
      const cardHeight = 35;

      // Card 1: Income
      pdf.setFillColor(240, 253, 244); // Light Green bg
      roundedRect(margin, yPosition, cardWidth, cardHeight, 3, 3, "F");
      pdf.setDrawColor(220, 252, 231);
      roundedRect(margin, yPosition, cardWidth, cardHeight, 3, 3, "S");

      pdf.setFontSize(10);
      pdf.setTextColor(colors.success[0], colors.success[1], colors.success[2]);
      pdf.setFont("helvetica", "bold");
      pdf.text("TOTAL INCOME", margin + 5, yPosition + 10);

      pdf.setFontSize(16);
      pdf.setTextColor(20, 20, 30);
      pdf.text(`Rs. ${income.toLocaleString()}`, margin + 5, yPosition + 22);

      // Card 2: Expenses
      pdf.setFillColor(254, 242, 242); // Light Red bg
      roundedRect(margin + cardWidth + 5, yPosition, cardWidth, cardHeight, 3, 3, "F");
      pdf.setDrawColor(254, 226, 226);
      roundedRect(margin + cardWidth + 5, yPosition, cardWidth, cardHeight, 3, 3, "S");

      pdf.setFontSize(10);
      pdf.setTextColor(colors.danger[0], colors.danger[1], colors.danger[2]);
      pdf.setFont("helvetica", "bold");
      pdf.text("TOTAL EXPENSES", margin + cardWidth + 10, yPosition + 10);

      pdf.setFontSize(16);
      pdf.setTextColor(20, 20, 30);
      pdf.text(`Rs. ${expense.toLocaleString()}`, margin + cardWidth + 10, yPosition + 22);

      // Card 3: Payings/Savings
      const isPositive = savings >= 0;
      const saveBg = isPositive ? [240, 249, 255] : [255, 247, 237]; // Blue or Orange
      const saveColor = isPositive ? colors.info : colors.warning;

      pdf.setFillColor(saveBg[0], saveBg[1], saveBg[2]);
      roundedRect(margin + (cardWidth * 2) + 10, yPosition, cardWidth, cardHeight, 3, 3, "F");

      pdf.setFontSize(10);
      pdf.setTextColor(saveColor[0], saveColor[1], saveColor[2]);
      pdf.setFont("helvetica", "bold");
      pdf.text("NET SAVINGS", margin + (cardWidth * 2) + 15, yPosition + 10);

      pdf.setFontSize(16);
      pdf.setTextColor(20, 20, 30);
      const savingsPrefix = isPositive ? "+" : "";
      pdf.text(`${savingsPrefix}Rs. ${Math.abs(savings).toLocaleString()}`, margin + (cardWidth * 2) + 15, yPosition + 22);

      pdf.setFontSize(9);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`${Math.round(savingsRate)}% Savings Rate`, margin + (cardWidth * 2) + 15, yPosition + 29);

      yPosition += cardHeight + 15;

      // === CHART SECTION ===
      if (chartRef.current && analyticsData.comparisonData.length > 0) {
        checkPageBreak(80);

        pdf.setFontSize(12);
        pdf.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
        pdf.setFont("helvetica", "bold");
        pdf.text("Income vs. Expenses Trend", margin, yPosition);
        yPosition += 5;

        try {
          // Capture chart - ensure black background for capture to match screen, but maybe we want white for print?
          // The user specifically liked the "nice colours". Let's stick to the dark chart if it looks premium, 
          // OR invert it for paper. Given "premium" often implies dark mode UI, let's keep the dark chart capture 
          // but maybe wrap it nicely.

          // Container for chart
          pdf.setFillColor(20, 20, 25);
          roundedRect(margin, yPosition, pageWidth - (margin * 2), 70, 3, 3, "F");

          const chartCanvas = await html2canvas(chartRef.current, {
            backgroundColor: "#000000",
            scale: 2,
            logging: false,
            useCORS: true
          });

          const imgData = chartCanvas.toDataURL("image/png");
          const imgWidth = pageWidth - (margin * 2) - 10;
          const imgHeight = (chartCanvas.height * imgWidth) / chartCanvas.width;

          // Center image in the dark box
          pdf.addImage(imgData, "PNG", margin + 5, yPosition + 5, imgWidth, Math.min(60, imgHeight));

          yPosition += 75;
        } catch (e) {
          console.error("Chart capture failed", e);
          yPosition += 10;
        }
      }

      // === CATEGORIES TABLE ===
      if (analyticsData.topCategories.length > 0) {
        checkPageBreak(50);

        yPosition += 5;
        pdf.setFontSize(12);
        pdf.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
        pdf.setFont("helvetica", "bold");
        pdf.text("Top Spending Categories", margin, yPosition);
        yPosition += 8;

        // Table Header
        pdf.setFillColor(245, 245, 247);
        roundedRect(margin, yPosition, pageWidth - (margin * 2), 8, 1, 1, "F");

        pdf.setFontSize(9);
        pdf.setTextColor(100, 100, 100);
        pdf.setFont("helvetica", "bold");
        pdf.text("CATEGORY", margin + 5, yPosition + 5.5);
        pdf.text("AMOUNT", pageWidth - margin - 40, yPosition + 5.5, { align: "right" });
        pdf.text("% OF EXPENSES", pageWidth - margin - 5, yPosition + 5.5, { align: "right" });

        yPosition += 12;

        // Table Rows
        analyticsData.topCategories.forEach((cat, i) => {
          checkPageBreak(12);

          const percentage = expense > 0 ? Math.round((cat.value / expense) * 100) : 0;

          // Icon placeholder (Circle)
          const hex = cat.color.replace("#", "");
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);

          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            pdf.setFillColor(r, g, b);
          } else {
            pdf.setFillColor(200, 200, 200); // Fallback color
          }
          pdf.circle(margin + 7, yPosition - 1, 3, "F");

          pdf.setFontSize(10);
          pdf.setTextColor(50, 50, 60);
          pdf.setFont("helvetica", "bold");
          pdf.text(cat.name, margin + 15, yPosition);

          pdf.setFont("helvetica", "normal");
          pdf.text(`Rs. ${cat.value.toLocaleString()}`, pageWidth - margin - 40, yPosition, { align: "right" });

          // Progress bar for visual percentage
          pdf.setFillColor(230, 230, 230);
          roundedRect(pageWidth - margin - 30, yPosition - 2.5, 25, 3, 1, 1, "F");
          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            pdf.setFillColor(r, g, b);
          } else {
            pdf.setFillColor(100, 100, 100); // Fallback color
          }
          roundedRect(pageWidth - margin - 30, yPosition - 2.5, (percentage / 100) * 25, 3, 1, 1, "F");

          yPosition += 10;

          // Light separator line
          pdf.setDrawColor(240, 240, 240);
          pdf.line(margin, yPosition - 5, pageWidth - margin, yPosition - 5);
        });
      }

      yPosition += 10;

      // === INSIGHTS SECTION ===
      checkPageBreak(50);

      pdf.setFontSize(12);
      pdf.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      pdf.setFont("helvetica", "bold");
      pdf.text("Key Insights", margin, yPosition);
      yPosition += 8;

      const insights = [];
      // Generate insights logic (reused)
      if (savingsRate >= 20) {
        insights.push({ title: "Great Savings Habit", text: `You're saving ${Math.round(savingsRate)}% of your income. Keep it up!`, type: "success" });
      } else if (savingsRate < 10 && savingsRate >= 0) {
        insights.push({ title: "Boost Your Savings", text: `Your savings rate is ${Math.round(savingsRate)}%. Aim for 20% for better stability.`, type: "warning" });
      } else {
        insights.push({ title: "Action Needed", text: `You're spending more than you earn. Review expenses.`, type: "danger" });
      }

      if (analyticsData.topCategories.length > 0) {
        const top = analyticsData.topCategories[0];
        insights.push({ title: "Top Expense", text: `${top.name} is your highest spend (${Math.round((top.value / expense) * 100)}%).`, type: "info" });
      }

      insights.forEach(insight => {
        const boxHeight = 18;
        checkPageBreak(boxHeight + 5);

        let bg = [240, 249, 255];
        let border = colors.info;
        if (insight.type === "success") { bg = [240, 253, 244]; border = colors.success; }
        if (insight.type === "warning") { bg = [255, 251, 235]; border = colors.warning; }
        if (insight.type === "danger") { bg = [254, 242, 242]; border = colors.danger; }

        pdf.setFillColor(bg[0], bg[1], bg[2]);
        roundedRect(margin, yPosition, pageWidth - (margin * 2), boxHeight, 2, 2, "F");

        // Colored left strip
        pdf.setFillColor(border[0], border[1], border[2]);
        roundedRect(margin, yPosition, 2, boxHeight, 0, 0, "F");

        pdf.setFontSize(10);
        pdf.setTextColor(border[0], border[1], border[2]);
        pdf.setFont("helvetica", "bold");
        pdf.text(insight.title, margin + 5, yPosition + 6);

        pdf.setFontSize(9);
        pdf.setTextColor(60, 60, 70);
        pdf.setFont("helvetica", "normal");
        pdf.text(insight.text, margin + 5, yPosition + 12);

        yPosition += boxHeight + 4;
      });

      // === FOOTER ===
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`Finora Financial Report | Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: "center" });
      }

      const fileName = `Finora_Report_${format(new Date(), "yyyyMMdd")}.pdf`;
      pdf.save(fileName);
      toast.success("Premium PDF report downloaded!");

    } catch (error) {
      console.error("PDF Export Error:", error);
      toast.error("Failed to generate PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pb-24 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const { income, expense, savings, savingsRate, pieData, comparisonData, topCategories, incomeChange, expenseChange } = analyticsData;
  const blurClass = isPrivacyEnabled ? "blur-md select-none transition-all duration-300" : "transition-all duration-300";

  return (
    <div className="min-h-screen pb-24 bg-background">
      {/* Header */}
      <header className="px-4 sm:px-5 pt-4 sm:pt-6 pb-3 sm:pb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Analytics</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Track your financial performance</p>
          </div>
          <button
            onClick={exportToPDF}
            disabled={isExporting || transactions.length === 0}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export to PDF"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline text-sm font-medium">Export PDF</span>
          </button>
        </div>
        <div className="mb-3">
          <DateFilter value={dateFilter} onChange={setDateFilter} />
        </div>

        {/* Breadcrumbs */}
        {(selectedCategory || selectedMerchant) && (
          <nav className="flex items-center gap-2 text-xs font-medium mb-4 overflow-x-auto no-scrollbar py-1">
            <button 
              onClick={() => { setSelectedCategory(null); setSelectedMerchant(null); }}
              className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
            >
              <Home className="w-3 h-3" />
              All Categories
            </button>
            
            {selectedCategory && (
              <>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                <button 
                  onClick={() => setSelectedMerchant(null)}
                  className={`whitespace-nowrap ${!selectedMerchant ? "text-primary font-bold" : "text-muted-foreground hover:text-primary transition-colors"}`}
                >
                  {selectedCategory}
                </button>
              </>
            )}

            {selectedMerchant && (
              <>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                <span className="text-primary font-bold whitespace-nowrap">
                  {selectedMerchant.name}
                </span>
              </>
            )}
          </nav>
        )}
      </header>

      {/* Monthly AI Narrative Section */}
      <MonthlySummary 
        userId={currentUser?.uid || ""} 
        date={dateFilter.mode === "month" && dateFilter.year !== undefined && dateFilter.month !== undefined 
          ? new Date(dateFilter.year, dateFilter.month, 1) 
          : new Date()} 
      />

      {/* Summary Cards */}
      <div ref={summaryRef} className="px-4 sm:px-5 mb-4 sm:mb-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-3 sm:p-4 rounded-xl"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-success/20 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 text-success" />
              </div>
              <span className="text-xs text-muted-foreground truncate">Income</span>
            </div>
            <p className={`text-lg sm:text-xl font-bold text-success mb-1 ${blurClass}`}>₹{income.toLocaleString()}</p>
            {incomeChange !== 0 && (
              <p className={`text-xs flex items-center gap-1 ${incomeChange > 0 ? "text-success" : "text-destructive"
                }`}>
                {incomeChange > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                {Math.abs(Math.round(incomeChange))}% vs last {activeTab === "weekly" ? "week" : activeTab === "monthly" ? "month" : "year"}
              </p>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card p-3 sm:p-4 rounded-xl"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-destructive/20 flex items-center justify-center flex-shrink-0">
                <TrendingDown className="w-4 h-4 text-destructive" />
              </div>
              <span className="text-xs text-muted-foreground truncate">Expenses</span>
            </div>
            <p className={`text-lg sm:text-xl font-bold text-destructive mb-1 ${blurClass}`}>₹{expense.toLocaleString()}</p>
            {expenseChange !== 0 && (
              <p className={`text-xs flex items-center gap-1 ${expenseChange < 0 ? "text-success" : "text-destructive"
                }`}>
                {expenseChange < 0 ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                {Math.abs(Math.round(expenseChange))}% vs last {activeTab === "weekly" ? "week" : activeTab === "monthly" ? "month" : "year"}
              </p>
            )}
          </motion.div>
        </div>

        {/* Savings Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-3 sm:mt-4 glass-card p-4 sm:p-5 rounded-xl"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${savings >= 0 ? "bg-success/20" : "bg-destructive/20"
                }`}>
                <PiggyBank className={`w-4 h-4 ${savings >= 0 ? "text-success" : "text-destructive"}`} />
              </div>
              <span className="text-sm font-medium text-foreground">Net Savings</span>
            </div>
            <span className={`text-sm sm:text-base font-bold ${savings >= 0 ? "text-success" : "text-destructive"
              } ${blurClass}`}>
              {savings >= 0 ? "+" : ""}₹{Math.abs(savings).toLocaleString()}
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Savings Rate</span>
              <span className={`text-xs font-semibold ${savingsRate >= 20 ? "text-success" : savingsRate >= 10 ? "text-warning" : "text-destructive"
                }`}>
                {savingsRate >= 0 ? Math.round(savingsRate) : 0}%
              </span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${savingsRate >= 20 ? "bg-success" : savingsRate >= 10 ? "bg-warning" : "bg-destructive"
                  }`}
                style={{ width: `${Math.min(100, Math.max(0, savingsRate))}%` }}
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Tab Navigation */}
      <div className="px-4 sm:px-5 mb-4 sm:mb-6">
        <div className="flex gap-2 p-1.5 bg-secondary rounded-2xl">
          {(["weekly", "monthly", "yearly"] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium capitalize transition-all ${activeTab === tab
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Income vs Expense Comparison Chart */}
      {comparisonData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="px-4 sm:px-5 mb-4 sm:mb-6"
        >
          <div className="glass-card p-4 sm:p-5 rounded-xl">
            <h3 className="font-semibold text-sm sm:text-base mb-4">Income vs Expenses</h3>
            <div
              ref={chartRef}
              className="h-64 sm:h-72 lg:h-80 rounded-lg p-2 sm:p-3 overflow-hidden"
              style={{ backgroundColor: '#000000' }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={comparisonData} 
                  margin={{ top: 10, right: 5, left: -10, bottom: 5 }}
                >
                  <XAxis
                    dataKey="period"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#ffffff', fontSize: 10, fontWeight: 500 }}
                    angle={comparisonData.length > 7 ? -45 : 0}
                    textAnchor={comparisonData.length > 7 ? "end" : "middle"}
                    height={comparisonData.length > 7 ? 60 : 30}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#ffffff', fontSize: 10, fontWeight: 500 }}
                    tickFormatter={(value) => {
                      if (value >= 1000000) return `₹${(value / 1000000).toFixed(1)}M`;
                      if (value >= 1000) return `₹${(value / 1000).toFixed(1)}k`;
                      return `₹${value}`;
                    }}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#000000',
                    }}
                    formatter={(value: number) => [`₹${value.toLocaleString()}`, '']}
                    labelStyle={{ color: '#000000', marginBottom: '4px', fontWeight: 600 }}
                  />
                  <Bar
                    dataKey="income"
                    fill="hsl(142, 76%, 50%)"
                    radius={[6, 6, 0, 0]}
                    name="Income"
                  />
                  <Bar
                    dataKey="expense"
                    fill="hsl(0, 72%, 51%)"
                    radius={[6, 6, 0, 0]}
                    name="Expenses"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-success" />
                <span className="text-xs text-muted-foreground">Income</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-destructive" />
                <span className="text-xs text-muted-foreground">Expenses</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Drill-down Views */}
      <div className="px-4 sm:px-5">
        <AnimatePresence mode="wait">
          {!selectedCategory ? (
            /* Level 1: Category breakdown (Original level) */
            <motion.div
              key="level1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div ref={categoryRef} className="glass-card p-4 sm:p-5 mb-4 sm:mb-6 rounded-xl">
                <h3 className="font-semibold text-sm sm:text-base mb-4">Spending by Category</h3>
                <div className="space-y-4">
                  {pieData.map((category, index) => {
                    const percentage = expense > 0 ? Math.round((category.value / expense) * 100) : 0;
                    return (
                      <button
                        key={category.name}
                        onClick={() => {
                          setSelectedCategory(category.name);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="w-full text-left space-y-1.5 group hover:opacity-80 transition-opacity"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div
                              className="w-6 h-6 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                              style={{ backgroundColor: `${category.color}20` }}
                            >
                              {category.icon || "📦"}
                            </div>
                            <span className="text-sm font-medium text-foreground truncate">{category.name}</span>
                            <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <span className="text-xs text-muted-foreground">{percentage}%</span>
                            <span className={`text-sm font-semibold text-foreground ${blurClass}`}>₹{category.value.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full transition-all duration-500 rounded-full"
                            style={{
                              width: `${percentage}%`,
                              backgroundColor: category.color
                            }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ) : !selectedMerchant ? (
            /* Level 2: Merchant Breakdown */
            <motion.div
              key="level2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 pb-12"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">{selectedCategory} Merchants</h3>
                <span className="text-xs text-muted-foreground">Sorted by Total Spent</span>
              </div>

              {merchantInsight && (
                <div className="insight-card border-primary/20 bg-primary/5 p-4 py-3 flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground italic leading-relaxed">
                    {merchantInsight}
                  </p>
                </div>
              )}

              {isInsightLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  AI is analyzing merchant breakdown...
                </div>
              )}

              <div className="space-y-3">
                {groupTransactionsByMerchant(transactions, selectedCategory).map((merchant, idx) => (
                  <MerchantCard 
                    key={idx} 
                    merchant={merchant} 
                    allTransactions={transactions}
                    categoryTotal={pieData.find(p => p.name === selectedCategory)?.value || 0}
                    onSelect={() => setSelectedMerchant(merchant)}
                    watchlist={userProfile?.merchantWatchlist || []}
                    onUpdateWatchlist={(newList) => {
                      if (currentUser) {
                        updateUserProfile(currentUser.uid, { merchantWatchlist: newList });
                      }
                    }}
                  />
                ))}
              </div>
            </motion.div>
          ) : (
            /* Level 3: Merchant Transaction History */
            <motion.div
              key="level3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4 pb-12"
            >
              <div className="glass-card p-6 flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12 blur-2xl" />
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl font-bold text-primary mb-4 shadow-sm border border-primary/20">
                  {selectedMerchant.name.charAt(0)}
                </div>
                <h2 className="text-xl font-black">{selectedMerchant.name}</h2>
                <div className="flex items-center gap-4 mt-2">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Spent</p>
                    <p className={`text-lg font-bold ${blurClass}`}>₹{selectedMerchant.total.toLocaleString()}</p>
                  </div>
                  <div className="w-px h-8 bg-border" />
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Orders</p>
                    <p className="text-lg font-bold">{selectedMerchant.count}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {selectedMerchant.transactions
                  .sort((a: any, b: any) => {
                    const dateA = a.date instanceof Date ? a.date : a.date.toDate();
                    const dateB = b.date instanceof Date ? b.date : b.date.toDate();
                    return dateB.getTime() - dateA.getTime();
                  })
                  .map((t: any, idx: number) => {
                    const date = t.date instanceof Date ? t.date : t.date.toDate();
                    return (
                      <div key={idx} className="glass-card p-4 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-sm">{format(date, "MMM d, yyyy")}</p>
                          <p className="text-xs text-muted-foreground">{t.merchant}</p>
                          {t.note && <p className="text-[10px] italic text-muted-foreground mt-1">"{t.note}"</p>}
                        </div>
                        <p className={`font-black text-destructive ${blurClass}`}>₹{t.amount.toLocaleString()}</p>
                      </div>
                    );
                  })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Key Insights (Only shown at top level) */}
      {!selectedCategory && (
        <motion.div
          ref={insightsRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="px-4 sm:px-5 mb-4 sm:mb-6"
        >
          <div className="glass-card p-4 sm:p-5 rounded-xl">
            <h3 className="font-semibold text-sm sm:text-base mb-4 flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Key Insights
            </h3>
            <div className="space-y-3">
              {savingsRate >= 20 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-success/10 border border-success/20">
                  <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <TrendingUp className="w-3.5 h-3.5 text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-success mb-0.5">Excellent Savings Rate</p>
                    <p className="text-xs text-muted-foreground">
                      You're saving {Math.round(savingsRate)}% of your income. Keep up the great work!
                    </p>
                  </div>
                </div>
              )}

              {savingsRate < 10 && savingsRate >= 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <div className="w-6 h-6 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Target className="w-3.5 h-3.5 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-warning mb-0.5">Low Savings Rate</p>
                    <p className="text-xs text-muted-foreground">
                      Your savings rate is {Math.round(savingsRate)}%. Aim for at least 20% for better financial health.
                    </p>
                  </div>
                </div>
              )}

              {savings < 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <div className="w-6 h-6 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <TrendingDown className="w-3.5 h-3.5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-destructive mb-0.5">Spending Exceeds Income</p>
                    <p className="text-xs text-muted-foreground">
                      You're spending ₹{Math.abs(savings).toLocaleString()} more than you earn. Consider reducing expenses or increasing income.
                    </p>
                  </div>
                </div>
              )}

              {topCategories.length > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Wallet className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-primary mb-0.5">Top Spending Category</p>
                    <p className="text-xs text-muted-foreground">
                      {topCategories[0].name} accounts for {expense > 0 ? Math.round((topCategories[0].value / expense) * 100) : 0}% of your expenses (₹{topCategories[0].value.toLocaleString()})
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {transactions.length === 0 && (
        <div className="px-4 sm:px-5">
          <div className="glass-card p-8 sm:p-12 rounded-xl text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
              <Wallet className="w-10 h-10 text-muted-foreground" />
            </div>
            <p className="text-base sm:text-lg text-foreground mb-1 font-medium">No data available</p>
            <p className="text-sm text-muted-foreground">Start adding transactions to see your analytics</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;

const MonthlySummary = ({ userId, date }: { userId: string; date: Date }) => {
  const [narrative, setNarrative] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const monthLabel = format(date, "MMMM");

  const loadNarrative = async (force: boolean = false) => {
    if (!userId) return;
    setLoading(true);
    try {
      const content = await getOrGenerateNarrative(userId, date, force);
      setNarrative(content);
    } catch (err) {
      console.error("Narrative load error:", err);
      setNarrative("Unable to load spending story.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNarrative();
  }, [userId, date]);

  return (
    <div className="px-4 sm:px-5 mb-4 sm:mb-6">
      <motion.div 
        className="glass-card overflow-hidden rounded-2xl border border-primary/20"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-foreground">{monthLabel} Summary</h3>
              <p className="text-xs text-muted-foreground">AI-powered financial narrative</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
            {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
          </div>
        </button>

        <AnimatePresence>
          {isExpanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 sm:p-5 pt-0 border-t border-white/5">
                <div className="bg-white/5 rounded-xl p-4 mb-4">
                  {loading ? (
                    <div className="space-y-2">
                      <div className="h-4 bg-white/10 rounded w-full animate-pulse" />
                      <div className="h-4 bg-white/10 rounded w-5/6 animate-pulse" />
                      <div className="h-4 bg-white/10 rounded w-4/6 animate-pulse" />
                    </div>
                  ) : (
                    <p className="text-sm sm:text-base text-foreground leading-relaxed italic">
                      "{narrative}"
                    </p>
                  )}
                </div>
                <div className="flex justify-between items-center">
                   <p className="text-[10px] text-muted-foreground">
                    Insights based on your spending patterns and category correlations.
                  </p>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      loadNarrative(true);
                    }}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium transition-colors border border-white/10"
                  >
                    <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                    Regenerate
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
