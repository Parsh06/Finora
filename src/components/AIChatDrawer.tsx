import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Sparkles, AlertCircle, Bot, User, Trash2, TrendingUp, TrendingDown, Lightbulb, Target, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { FinancialContext, ChatMessage, ragAIService } from "@/lib/rag-ai-service";
import { toast } from "sonner";

interface AIChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  context: FinancialContext;
}

interface Insight {
  id: string;
  type: "tip" | "warning" | "achievement" | "trend";
  title: string;
  description: string;
  icon: any;
  color: string;
}

export const AIChatDrawer = ({ isOpen, onClose, context }: AIChatDrawerProps) => {
  const { currentUser, userProfile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Hi ${userProfile?.name || "there"}! I'm Finora AI. I've analyzed your finances and I'm ready to help. You can ask me things like 'Can I afford a ₹5,000 dinner tonight?' or 'How's my spending this week?'`
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [liveInsights, setLiveInsights] = useState<Insight[]>([]);
  const [showFullInsights, setShowFullInsights] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && currentUser && !healthScore && context.recentTransactions.length > 0) {
      fetchInsights();
    }
  }, [isOpen, currentUser, context.recentTransactions]);

  const fetchInsights = async () => {
    if (!currentUser) return;
    setLoadingInsights(true);
    try {
      const result = await ragAIService.generateInsights(
        context.recentTransactions as any,
        context.budgets as any,
        userProfile?.name,
        context.upcomingBills as any
      );
      
      setHealthScore(result.healthScore);
      
      const iconMap: Record<string, any> = {
        tip: Lightbulb,
        warning: AlertCircle,
        achievement: Target,
        trend: TrendingUp,
      };

      const colorMap: Record<string, string> = {
        tip: "text-emerald-400",
        warning: "text-yellow-400",
        achievement: "text-purple-400",
        trend: "text-cyan-400",
      };

      const formattedInsights = result.insights.map((ins: any, idx: number) => ({
        id: `insight-${idx}`,
        ...ins,
        icon: iconMap[ins.type] || Lightbulb,
        color: colorMap[ins.type] || "text-primary"
      }));

      setLiveInsights(formattedInsights);
    } catch (error) {
      console.error("Failed to fetch insights:", error);
    } finally {
      setLoadingInsights(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    
    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: userMessage }
    ];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await ragAIService.generateAdvice(
        userMessage,
        context.recentTransactions as any,
        context.budgets as any,
        userProfile?.name,
        context.upcomingBills as any
      );
      setMessages(prev => [...prev, { role: "assistant", content: response }]);
    } catch (error) {
      toast.error("Failed to get AI response");
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    if (confirm("Clear chat history?")) {
        setMessages([{
            role: "assistant",
            content: "Hi! I'm Finora AI. How can I help you with your finances today?"
        }]);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-primary/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Finora AI</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Predictive Advisor</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={clearChat}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  title="Clear Chat"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Financial Health & Insights */}
            <div className="px-4 py-3 bg-primary/5 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-background border border-border`}>
                    <Sparkles className={`w-4 h-4 ${healthScore && healthScore >= 80 ? 'text-emerald-400' : healthScore && healthScore >= 60 ? 'text-yellow-400' : 'text-red-400'}`} />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-tight font-medium">Financial Health</p>
                    <p className="text-sm font-bold text-foreground">
                      {loadingInsights ? "Analyzing..." : healthScore ? `${healthScore}/100 - ${healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : 'Needs Work'}` : "Calculating..."}
                    </p>
                  </div>
                </div>
                {liveInsights.length > 0 && (
                  <button 
                    onClick={() => setShowFullInsights(!showFullInsights)}
                    className="p-1 hover:bg-muted rounded-md transition-colors"
                  >
                    {showFullInsights ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                )}
              </div>

              {/* Progress Bar */}
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mb-2">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${healthScore || 0}%` }}
                  className={`h-full bg-gradient-to-r ${healthScore && healthScore >= 80 ? 'from-emerald-500 to-teal-500' : healthScore && healthScore >= 60 ? 'from-yellow-500 to-orange-500' : 'from-red-500 to-pink-500'}`}
                />
              </div>

              {/* Insights Preview/Full */}
              <AnimatePresence>
                {(showFullInsights || (!showFullInsights && liveInsights.length > 0)) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 pt-1">
                      {(showFullInsights ? liveInsights : liveInsights.slice(0, 1)).map((insight) => (
                        <div key={insight.id} className="glass-card p-2 rounded-xl flex items-start gap-2 border-primary/10">
                          <div className="mt-0.5 p-1 rounded-md bg-muted/50">
                            <insight.icon className={`w-3.5 h-3.5 ${insight.color}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">{insight.title}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight">{insight.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Context Summary Chip */}
            <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-2 overflow-x-auto scrollbar-hide">
              <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-full bg-background border border-border text-[10px] whitespace-nowrap">
                <span className="text-muted-foreground">Balance:</span>
                <span className="font-bold text-foreground">₹{context.balance.toLocaleString()}</span>
              </div>
              <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-full bg-background border border-border text-[10px] whitespace-nowrap">
                <span className="text-muted-foreground">Bills:</span>
                <span className="font-bold text-warning">{context.upcomingBills.length} upcoming</span>
              </div>
              <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-full bg-background border border-border text-[10px] whitespace-nowrap">
                <span className="text-muted-foreground">Goals:</span>
                <span className="font-bold text-primary">{context.savingsGoals.length} active</span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === "assistant" ? "justify-start" : "justify-end"}`}
                >
                  <div className={`flex gap-2 max-w-[85%] ${msg.role === "assistant" ? "flex-row" : "flex-row-reverse"}`}>
                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-1 ${
                      msg.role === "assistant" ? "bg-primary/10" : "bg-muted"
                    }`}>
                      {msg.role === "assistant" ? <Bot className="w-4 h-4 text-primary" /> : <User className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className={`p-3 rounded-2xl text-sm ${
                      msg.role === "assistant" 
                        ? "bg-muted text-foreground rounded-tl-none" 
                        : "bg-primary text-primary-foreground rounded-tr-none"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex gap-2 max-w-[80%]">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                    <div className="bg-muted p-3 rounded-2xl rounded-tl-none flex gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" />
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border bg-background">
              <div className="relative flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Can I afford a new laptop?"
                  className="flex-1 bg-muted/50 border border-border rounded-2xl py-3 px-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-1 w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 disabled:scale-95 transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-2 flex items-center justify-center gap-1">
                <AlertCircle className="w-3 h-3" />
                AI advice is for guidance only. Always review your bills.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
