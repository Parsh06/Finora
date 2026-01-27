import { motion } from "framer-motion";
import { useState, useEffect, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToTransactions, Transaction } from "@/lib/firestore";
import { format, startOfWeek, startOfMonth, startOfYear, eachDayOfInterval, eachMonthOfInterval, subMonths, endOfYear, endOfMonth, endOfDay, startOfDay } from "date-fns";
import { DateFilter, DateFilterState } from "./DateFilter";
import { TrendingUp, TrendingDown, Wallet, PiggyBank, ArrowUpRight, ArrowDownLeft, Target, Download } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { useCategories } from "@/hooks/useCategories";

type TabType = "weekly" | "monthly" | "yearly";

export const Analytics = () => {
  const { currentUser, userProfile } = useAuth();
  const { categories, getCategoryIcon, getCategoryColor } = useCategories();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("monthly");
  const [isExporting, setIsExporting] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilterState>({ mode: "all" });
  
  // Refs for PDF export
  const chartRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const insightsRef = useRef<HTMLDivElement>(null);

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
        startDate = startOfWeek(now);
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
        const weekStart = startOfWeek(now);
        const days = eachDayOfInterval({ start: weekStart, end: now });
        comparisonData = days.map((day) => {
          const dayTransactions = filteredTransactions.filter((t) => {
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
      } else {
        // Yearly - last 12 months
        const months = eachMonthOfInterval({
          start: subMonths(now, 11),
          end: now,
        });
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
    toast.loading("Generating PDF report...", { id: "pdf-export" });

    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPosition = margin;

      // Helper function to add new page if needed
      const checkPageBreak = (requiredHeight: number) => {
        if (yPosition + requiredHeight > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
        }
      };

      // Helper function to format currency (avoid special character issues)
      const formatCurrency = (amount: number) => {
        return `Rs. ${amount.toLocaleString("en-IN")}`;
      };

      // Helper function to add section header
      const addSectionHeader = (title: string, yPos: number) => {
        checkPageBreak(15);
        pdf.setFillColor(30, 30, 40);
        pdf.rect(margin, yPos, pageWidth - 2 * margin, 7, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(13);
        pdf.setFont("helvetica", "bold");
        pdf.text(title, margin + 5, yPos + 5.5);
        return yPos + 10;
      };

      // Header Section
      pdf.setFillColor(20, 20, 30);
      pdf.rect(0, 0, pageWidth, 45, "F");
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(22);
      pdf.setFont("helvetica", "bold");
      pdf.text("Financial Analytics Report", pageWidth / 2, 18, { align: "center" });
      
      const userName = userProfile?.name || currentUser?.displayName || currentUser?.email?.split("@")[0] || "User";
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Generated for: ${userName}`, pageWidth / 2, 26, { align: "center" });
      
      const { startDate, endDate } = analyticsData;
      const periodLabel = activeTab === "weekly" ? "Week" : activeTab === "monthly" ? "Month" : "Year";
      const dateRange = `${format(startDate, "MMM d, yyyy")} - ${format(endDate, "MMM d, yyyy")}`;
      pdf.setFontSize(10);
      pdf.text(`Period: ${periodLabel} (${dateRange})`, pageWidth / 2, 34, { align: "center" });
      
      pdf.setFontSize(9);
      pdf.setTextColor(200, 200, 200);
      pdf.text(`Generated on ${format(new Date(), "MMM d, yyyy 'at' h:mm a")}`, pageWidth / 2, 40, { align: "center" });
      
      yPosition = 55;

      // Financial Summary Section
      yPosition = addSectionHeader("Financial Summary", yPosition);
      
      const { income, expense, savings, savingsRate } = analyticsData;
      const summaryBoxHeight = 50;
      checkPageBreak(summaryBoxHeight);
      
      pdf.setFillColor(245, 245, 250);
      pdf.rect(margin, yPosition, pageWidth - 2 * margin, summaryBoxHeight, "F");
      
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "normal");
      
      // Income Row
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "bold");
      pdf.text("Income:", margin + 8, yPosition + 10);
      pdf.setTextColor(76, 175, 80);
      pdf.text(formatCurrency(income), pageWidth - margin - 8, yPosition + 10, { align: "right" });
      
      // Expense Row
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "bold");
      pdf.text("Expenses:", margin + 8, yPosition + 18);
      pdf.setTextColor(244, 67, 54);
      pdf.text(formatCurrency(expense), pageWidth - margin - 8, yPosition + 18, { align: "right" });
      
      // Net Savings Row
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "bold");
      pdf.text("Net Savings:", margin + 8, yPosition + 26);
      const savingsColor = savings >= 0 ? [76, 175, 80] : [244, 67, 54];
      pdf.setTextColor(savingsColor[0], savingsColor[1], savingsColor[2]);
      const savingsText = `${savings >= 0 ? "+" : ""}${formatCurrency(Math.abs(savings))}`;
      pdf.text(savingsText, pageWidth - margin - 8, yPosition + 26, { align: "right" });
      
      // Savings Rate Row
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "bold");
      pdf.text("Savings Rate:", margin + 8, yPosition + 34);
      const savingsRateColor = savingsRate >= 20 ? [76, 175, 80] : savingsRate >= 10 ? [255, 152, 0] : [244, 67, 54];
      pdf.setTextColor(savingsRateColor[0], savingsRateColor[1], savingsRateColor[2]);
      pdf.text(`${Math.round(savingsRate)}%`, pageWidth - margin - 8, yPosition + 34, { align: "right" });
      
      // Visual progress bar for savings rate
      const barWidth = pageWidth - 2 * margin - 16;
      const barHeight = 4;
      pdf.setFillColor(230, 230, 230);
      pdf.rect(margin + 8, yPosition + 38, barWidth, barHeight, "F");
      const fillWidth = Math.min(100, Math.max(0, savingsRate)) / 100 * barWidth;
      pdf.setFillColor(savingsRateColor[0], savingsRateColor[1], savingsRateColor[2]);
      pdf.rect(margin + 8, yPosition + 38, fillWidth, barHeight, "F");
      
      yPosition += summaryBoxHeight + 5;

      // Chart Section - Income vs Expenses
      if (chartRef.current && analyticsData.comparisonData.length > 0) {
        yPosition = addSectionHeader("Income vs Expenses Comparison", yPosition);
        checkPageBreak(75);
        
        try {
          // Add a black background box for the chart
          const chartBoxHeight = 70;
          pdf.setFillColor(0, 0, 0);
          pdf.rect(margin, yPosition, pageWidth - 2 * margin, chartBoxHeight, "F");
          
          // Add a subtle border
          pdf.setDrawColor(50, 50, 50);
          pdf.setLineWidth(0.5);
          pdf.rect(margin, yPosition, pageWidth - 2 * margin, chartBoxHeight, "S");
          
          // Capture chart with pure black background
          const chartCanvas = await html2canvas(chartRef.current, {
            backgroundColor: "#000000",
            scale: 2.5,
            logging: false,
            useCORS: true,
            allowTaint: true,
            windowWidth: chartRef.current.scrollWidth,
            windowHeight: chartRef.current.scrollHeight,
          });
          
          const chartImgData = chartCanvas.toDataURL("image/png");
          const imgWidth = pageWidth - 2 * margin - 4;
          const imgHeight = (chartCanvas.height * imgWidth) / chartCanvas.width;
          const maxHeight = chartBoxHeight - 4;
          
          // Center the chart image in the black box
          const imgY = yPosition + 2;
          const imgX = margin + 2;
          
          pdf.addImage(chartImgData, "PNG", imgX, imgY, imgWidth, Math.min(imgHeight, maxHeight));
          yPosition += chartBoxHeight + 5;
        } catch (error) {
          console.error("Error capturing chart:", error);
          // Draw error message on black background
          pdf.setFillColor(0, 0, 0);
          pdf.rect(margin, yPosition, pageWidth - 2 * margin, 30, "F");
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(10);
          pdf.text("Chart could not be generated", margin + 5, yPosition + 15);
          yPosition += 35;
        }
      }

      // Category Breakdown Section
      if (analyticsData.topCategories.length > 0) {
        yPosition = addSectionHeader("Spending by Category", yPosition);
        checkPageBreak(analyticsData.topCategories.length * 12 + 5);
        
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");
        
        analyticsData.topCategories.forEach((category, index) => {
          checkPageBreak(15);
          const percentage = expense > 0 ? Math.round((category.value / expense) * 100) : 0;
          
          // Category row with background
          pdf.setFillColor(250, 250, 255);
          pdf.rect(margin, yPosition - 2, pageWidth - 2 * margin, 12, "F");
          
          // Category name and amount
          pdf.setTextColor(0, 0, 0);
          pdf.setFont("helvetica", "bold");
          pdf.text(`${index + 1}. ${category.name}`, margin + 5, yPosition + 5);
          
          pdf.setFont("helvetica", "normal");
          pdf.text(formatCurrency(category.value), pageWidth - margin - 60, yPosition + 5, { align: "right" });
          pdf.text(`(${percentage}%)`, pageWidth - margin - 5, yPosition + 5, { align: "right" });
          
          // Progress bar
          const barWidth = pageWidth - 2 * margin - 10;
          const barHeight = 3;
          pdf.setFillColor(230, 230, 230);
          pdf.rect(margin + 5, yPosition + 7, barWidth, barHeight, "F");
          
          // Progress bar fill with category color
          const fillWidth = (percentage / 100) * barWidth;
          // Convert hex color to RGB for PDF
          const hexColor = category.color.replace('#', '');
          const r = parseInt(hexColor.substring(0, 2), 16);
          const g = parseInt(hexColor.substring(2, 4), 16);
          const b = parseInt(hexColor.substring(4, 6), 16);
          pdf.setFillColor(r, g, b);
          pdf.rect(margin + 5, yPosition + 7, fillWidth, barHeight, "F");
          
          yPosition += 12;
        });
        
        yPosition += 2;
      }

      // Key Insights Section
      yPosition = addSectionHeader("Key Insights & Recommendations", yPosition);
      checkPageBreak(60);
      
      pdf.setFontSize(9.5);
      pdf.setFont("helvetica", "normal");
      
      const insights: Array<{ text: string; color: number[]; icon: string }> = [];
      
      if (savingsRate >= 20) {
        insights.push({
          text: `Excellent Savings Rate: You are saving ${Math.round(savingsRate)}% of your income. Keep up the great work!`,
          color: [76, 175, 80],
          icon: "✓"
        });
      } else if (savingsRate < 10 && savingsRate >= 0) {
        insights.push({
          text: `Low Savings Rate: Your savings rate is ${Math.round(savingsRate)}%. Aim for at least 20% for better financial health.`,
          color: [255, 152, 0],
          icon: "!"
        });
      }
      
      if (savings < 0) {
        insights.push({
          text: `Spending Exceeds Income: You are spending ${formatCurrency(Math.abs(savings))} more than you earn. Consider reducing expenses or increasing income.`,
          color: [244, 67, 54],
          icon: "X"
        });
      }
      
      if (analyticsData.topCategories.length > 0) {
        const topCat = analyticsData.topCategories[0];
        const topCatPercentage = expense > 0 ? Math.round((topCat.value / expense) * 100) : 0;
        insights.push({
          text: `Top Spending Category: ${topCat.name} accounts for ${topCatPercentage}% of your expenses (${formatCurrency(topCat.value)})`,
          color: [33, 150, 243],
          icon: "•"
        });
      }
      
      if (analyticsData.expenseChange > 10) {
        insights.push({
          text: `Expense Increase: Your expenses increased by ${Math.round(analyticsData.expenseChange)}% compared to last ${periodLabel.toLowerCase()}. Review your spending patterns.`,
          color: [255, 152, 0],
          icon: "↑"
        });
      } else if (analyticsData.expenseChange < -10) {
        insights.push({
          text: `Expense Reduction: Great job! Your expenses decreased by ${Math.abs(Math.round(analyticsData.expenseChange))}% compared to last ${periodLabel.toLowerCase()}.`,
          color: [76, 175, 80],
          icon: "↓"
        });
      }
      
      insights.forEach((insight) => {
        checkPageBreak(10);
        pdf.setFillColor(insight.color[0], insight.color[1], insight.color[2]);
        pdf.circle(margin + 3, yPosition - 1, 2, "F");
        
        pdf.setTextColor(insight.color[0], insight.color[1], insight.color[2]);
        pdf.setFont("helvetica", "bold");
        pdf.text(insight.icon, margin + 7, yPosition);
        
        pdf.setTextColor(0, 0, 0);
        pdf.setFont("helvetica", "normal");
        const lines = pdf.splitTextToSize(insight.text, pageWidth - 2 * margin - 15);
        if (Array.isArray(lines)) {
          lines.forEach((line: string, idx: number) => {
            pdf.text(line, margin + 12, yPosition + (idx * 4.5));
          });
          yPosition += lines.length * 4.5 + 3;
        } else {
          pdf.text(lines, margin + 12, yPosition);
          yPosition += 6;
        }
      });

      // Helper function to convert HSL to RGB
      function hslToRgb(h: number, s: number, l: number): number[] {
        let r, g, b;
        if (s === 0) {
          r = g = b = l;
        } else {
          const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
          };
          const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
          const p = 2 * l - q;
          r = hue2rgb(p, q, h / 360 + 1/3);
          g = hue2rgb(p, q, h / 360);
          b = hue2rgb(p, q, h / 360 - 1/3);
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
      }

      // Footer on all pages
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
        pdf.setTextColor(150, 150, 150);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.text(
          `Page ${i} of ${totalPages} | Finora Financial Analytics`,
          pageWidth / 2,
          pageHeight - 10,
          { align: "center" }
        );
      }

      // Generate filename
      const fileName = `Finora_Analytics_${userName.replace(/\s+/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.pdf`;
      
      // Save PDF
      pdf.save(fileName);
      
      toast.success("PDF report generated successfully!", { id: "pdf-export" });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF. Please try again.", { id: "pdf-export" });
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
      </header>

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
            <p className="text-lg sm:text-xl font-bold text-success mb-1">₹{income.toLocaleString()}</p>
            {incomeChange !== 0 && (
              <p className={`text-xs flex items-center gap-1 ${
                incomeChange > 0 ? "text-success" : "text-destructive"
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
            <p className="text-lg sm:text-xl font-bold text-destructive mb-1">₹{expense.toLocaleString()}</p>
            {expenseChange !== 0 && (
              <p className={`text-xs flex items-center gap-1 ${
                expenseChange < 0 ? "text-success" : "text-destructive"
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
              <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                savings >= 0 ? "bg-success/20" : "bg-destructive/20"
              }`}>
                <PiggyBank className={`w-4 h-4 ${savings >= 0 ? "text-success" : "text-destructive"}`} />
              </div>
              <span className="text-sm font-medium text-foreground">Net Savings</span>
            </div>
            <span className={`text-sm sm:text-base font-bold ${
              savings >= 0 ? "text-success" : "text-destructive"
            }`}>
              {savings >= 0 ? "+" : ""}₹{Math.abs(savings).toLocaleString()}
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Savings Rate</span>
              <span className={`text-xs font-semibold ${
                savingsRate >= 20 ? "text-success" : savingsRate >= 10 ? "text-warning" : "text-destructive"
              }`}>
                {savingsRate >= 0 ? Math.round(savingsRate) : 0}%
              </span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  savingsRate >= 20 ? "bg-success" : savingsRate >= 10 ? "bg-warning" : "bg-destructive"
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
              className={`flex-1 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium capitalize transition-all ${
                activeTab === tab
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
                <BarChart data={comparisonData} margin={{ top: 10, right: 5, left: -10, bottom: 5 }}>
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
                      if (value >= 1000000) return `₹${(value/1000000).toFixed(1)}M`;
                      if (value >= 1000) return `₹${(value/1000).toFixed(1)}k`;
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

      {/* Spending by Category */}
      {pieData.length > 0 && (
      <motion.div
          ref={categoryRef}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="px-4 sm:px-5 mb-4 sm:mb-6"
        >
          <div className="glass-card p-4 sm:p-5 rounded-xl">
            <h3 className="font-semibold text-sm sm:text-base mb-4">Spending by Category</h3>
            <div className="space-y-3">
              {topCategories.map((category, index) => {
                const percentage = expense > 0 ? Math.round((category.value / expense) * 100) : 0;
                return (
                  <div key={category.name} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div 
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                          style={{ backgroundColor: `${category.color}20` }}
                        >
                          {category.icon || "📦"}
                        </div>
                        <span className="text-sm font-medium text-foreground truncate">{category.name}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <span className="text-xs text-muted-foreground">{percentage}%</span>
                        <span className="text-sm font-semibold text-foreground">₹{category.value.toLocaleString()}</span>
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
                  </div>
                );
              })}
            </div>
        </div>
      </motion.div>
      )}

      {/* Key Insights */}
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

            {expenseChange > 10 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
                <div className="w-6 h-6 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <ArrowUpRight className="w-3.5 h-3.5 text-warning" />
                </div>
                <div>
                  <p className="text-sm font-medium text-warning mb-0.5">Expense Increase</p>
                  <p className="text-xs text-muted-foreground">
                    Your expenses increased by {Math.round(expenseChange)}% compared to last {activeTab === "weekly" ? "week" : activeTab === "monthly" ? "month" : "year"}. Review your spending patterns.
                  </p>
                </div>
                  </div>
            )}

            {expenseChange < -10 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-success/10 border border-success/20">
                <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <ArrowDownLeft className="w-3.5 h-3.5 text-success" />
                </div>
                <div>
                  <p className="text-sm font-medium text-success mb-0.5">Expense Reduction</p>
                  <p className="text-xs text-muted-foreground">
                    Great job! Your expenses decreased by {Math.abs(Math.round(expenseChange))}% compared to last {activeTab === "weekly" ? "week" : activeTab === "monthly" ? "month" : "year"}.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

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
