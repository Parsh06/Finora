import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Sparkles, AlertCircle, Bot, User, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getAIChatResponse, FinancialContext, ChatMessage } from "@/lib/ai-chat-service";
import { toast } from "sonner";

interface AIChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  context: FinancialContext;
}

export const AIChatDrawer = ({ isOpen, onClose, context }: AIChatDrawerProps) => {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hi! I'm Finora AI. You can ask me things like 'Can I afford a ₹5,000 dinner tonight?' or 'How's my spending this week?'"
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      const response = await getAIChatResponse(newMessages.slice(-5), context);
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
