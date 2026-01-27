import { useState } from "react";
import { Calendar, ChevronDown, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";

export type DateFilterMode = "all" | "year" | "month" | "day";

export interface DateFilterState {
  mode: DateFilterMode;
  year?: number;
  month?: number; // 0-11 (0 = January)
  day?: number; // 1-31
}

interface DateFilterProps {
  value: DateFilterState;
  onChange: (filter: DateFilterState) => void;
  className?: string;
}

export const DateFilter = ({ value, onChange, className = "" }: DateFilterProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const getDisplayText = () => {
    if (value.mode === "all") return "All Time";
    if (value.mode === "year" && value.year) return `Year ${value.year}`;
    if (value.mode === "month" && value.year !== undefined && value.month !== undefined) {
      return `${months[value.month]} ${value.year}`;
    }
    if (value.mode === "day" && value.year !== undefined && value.month !== undefined && value.day !== undefined) {
      const date = new Date(value.year, value.month, value.day);
      return format(date, "MMMM d, yyyy");
    }
    return "Select Date";
  };

  const handleModeChange = (mode: DateFilterMode) => {
    if (mode === "all") {
      onChange({ mode: "all" });
      setIsOpen(false);
    } else {
      onChange({ ...value, mode });
    }
  };

  const handleYearSelect = (year: number) => {
    if (value.mode === "year") {
      onChange({ mode: "year", year });
      setIsOpen(false);
    } else {
      onChange({ ...value, year });
    }
  };

  const handleMonthSelect = (month: number) => {
    if (value.mode === "month") {
      onChange({ mode: "month", year: value.year || currentYear, month });
      setIsOpen(false);
    } else {
      onChange({ ...value, month });
    }
  };

  const handleDaySelect = (day: number) => {
    onChange({
      mode: "day",
      year: value.year || currentYear,
      month: value.month !== undefined ? value.month : new Date().getMonth(),
      day,
    });
    setIsOpen(false);
  };

  const clearFilter = () => {
    onChange({ mode: "all" });
    setIsOpen(false);
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl bg-muted/30 border border-border/50 text-xs sm:text-sm font-medium text-foreground hover:bg-muted/50 transition-colors w-full sm:w-auto"
      >
        <Calendar className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline truncate">{getDisplayText()}</span>
        <span className="sm:hidden truncate text-xs">{value.mode === "all" ? "All Time" : value.mode === "year" ? `${value.year}` : value.mode === "month" ? format(new Date(value.year || currentYear, value.month ?? 0, 1), "MMM yyyy") : format(new Date(value.year || currentYear, value.month ?? 0, value.day || 1), "MMM d")}</span>
        <ChevronDown className={`w-4 h-4 transition-transform flex-shrink-0 ml-auto sm:ml-0 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              className="absolute top-full left-0 mt-2 z-50 w-[calc(100vw-2rem)] sm:w-80 max-w-sm bg-card border border-border/50 rounded-xl shadow-lg p-3 sm:p-4 max-h-[80vh] overflow-y-auto"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Filter by Date</h3>
                {value.mode !== "all" && (
                  <button
                    onClick={clearFilter}
                    className="p-1 rounded-lg hover:bg-muted/50 transition-colors"
                    aria-label="Clear filter"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </div>

              {/* Mode Selection */}
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">View Mode</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["all", "year", "month", "day"] as DateFilterMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => handleModeChange(mode)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                          value.mode === mode
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        {mode === "all" ? "All Time" : mode}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Year Selection */}
                {value.mode !== "all" && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Year</p>
                    <div className="grid grid-cols-5 gap-1.5 sm:gap-2 max-h-32 overflow-y-auto">
                      {years.map((year) => (
                        <button
                          key={year}
                          onClick={() => handleYearSelect(year)}
                          className={`px-1.5 sm:px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            value.year === year
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/30 text-foreground hover:bg-muted/50"
                          }`}
                        >
                          {year}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Month Selection */}
                {(value.mode === "month" || value.mode === "day") && value.year !== undefined && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Month</p>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 max-h-40 overflow-y-auto">
                      {months.map((month, index) => (
                        <button
                          key={index}
                          onClick={() => handleMonthSelect(index)}
                          className={`px-1.5 sm:px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            value.month === index
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/30 text-foreground hover:bg-muted/50"
                          }`}
                        >
                          {month.substring(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Day Selection */}
                {value.mode === "day" && value.year !== undefined && value.month !== undefined && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Day</p>
                    <div className="grid grid-cols-7 gap-1 sm:gap-1.5 max-h-48 overflow-y-auto">
                      {Array.from({ length: getDaysInMonth(value.year, value.month) }, (_, i) => i + 1).map((day) => (
                        <button
                          key={day}
                          onClick={() => handleDaySelect(day)}
                          className={`px-1 sm:px-2 py-1 sm:py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            value.day === day
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/30 text-foreground hover:bg-muted/50"
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

