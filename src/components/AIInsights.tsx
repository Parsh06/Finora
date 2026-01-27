import { motion } from "framer-motion";
import { useState } from "react";
import { Sparkles, Send, MessageCircle, TrendingDown, AlertTriangle, Award } from "lucide-react";

interface Message {
  id: string;
  type: "user" | "ai";
  content: string;
  timestamp: Date;
}

const suggestedPrompts = [
  "How can I save more?",
  "What am I overspending on?",
  "Suggest a budget for next month",
  "Compare my spending to last month",
];

const initialMessages: Message[] = [
  {
    id: "1",
    type: "ai",
    content: "Hi Rahul! 👋 I've analyzed your spending patterns. You have a financial health score of **78/100** - that's good! Let me know what you'd like to explore.",
    timestamp: new Date(),
  },
];

export const AIInsights = () => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const healthScore = 78;

  const handleSend = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    // Simulate AI response
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const aiResponses: { [key: string]: string } = {
      "How can I save more?": "Based on your spending patterns, here are 3 ways to save:\n\n1. **Reduce food delivery** - You spent ₹4,200 on delivery this month. Cooking at home could save ₹2,500/month.\n\n2. **Cancel unused subscriptions** - I noticed 2 subscriptions with low usage. Potential savings: ₹800/month.\n\n3. **Use public transport twice a week** - This could save ₹1,200/month on transportation.",
      "What am I overspending on?": "You're spending **23% more on entertainment** compared to your 3-month average. Here's the breakdown:\n\n• Movies & streaming: ₹2,100 (+₹400)\n• Games: ₹1,400 (+₹800)\n\nConsider setting a ₹3,000 entertainment budget to stay on track.",
      "Suggest a budget for next month": "Based on your income of ₹75,000 and goals, here's my suggested budget:\n\n🏠 **Essentials** - ₹30,000 (40%)\n💰 **Savings** - ₹15,000 (20%)\n🛒 **Shopping** - ₹10,000 (13%)\n🎬 **Entertainment** - ₹5,000 (7%)\n📦 **Others** - ₹15,000 (20%)",
      "Compare my spending to last month": "Great news! Your overall spending is **8% lower** than last month. 📉\n\n✅ Food: -12% (₹8,500 vs ₹9,650)\n✅ Transport: -5% (₹4,200 vs ₹4,420)\n⚠️ Shopping: +15% (₹6,800 vs ₹5,913)\n\nKeep up the good work on food savings!",
    };

    const aiMessage: Message = {
      id: (Date.now() + 1).toString(),
      type: "ai",
      content: aiResponses[text] || "I understand you're asking about your finances. Based on my analysis, you're managing your money well. Your savings rate of 62% is excellent! Is there something specific you'd like to explore?",
      timestamp: new Date(),
    };

    setIsTyping(false);
    setMessages((prev) => [...prev, aiMessage]);
  };

  return (
    <div className="min-h-screen flex flex-col pb-24">
      {/* Header */}
      <header className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">AI Insights</h1>
            <p className="text-muted-foreground text-sm">Your personal finance advisor</p>
          </div>
        </div>

        {/* Financial Health Score */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card-elevated p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Financial Health Score</p>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-primary">{healthScore}</span>
                <span className="text-muted-foreground">/100</span>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="w-10 h-10 rounded-xl bg-success/20 flex items-center justify-center">
                <Award className="w-5 h-5 text-success" />
              </div>
            </div>
          </div>
          <div className="mt-3 progress-bar">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${healthScore}%` }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="progress-fill"
            />
          </div>
        </motion.div>
      </header>

      {/* Quick Insights */}
      <div className="px-5 mb-4">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-shrink-0 glass-card p-3 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Overspending</p>
              <p className="text-sm font-medium">Entertainment +23%</p>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="flex-shrink-0 glass-card p-3 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-success/20 flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Good Job</p>
              <p className="text-sm font-medium">Food -12%</p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 px-5 overflow-y-auto space-y-4 mb-4">
        {messages.map((message, index) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl p-4 ${
                message.type === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "glass-card rounded-bl-md"
              }`}
            >
              {message.type === "ai" && (
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-primary">Finora AI</span>
                </div>
              )}
              <p className="text-sm whitespace-pre-line">{message.content}</p>
            </div>
          </motion.div>
        ))}

        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="glass-card rounded-2xl rounded-bl-md p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium text-primary">Finora AI</span>
              </div>
              <div className="flex gap-1 mt-2">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    className="w-2 h-2 rounded-full bg-primary"
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Suggested Prompts */}
      <div className="px-5 mb-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => handleSend(prompt)}
              className="flex-shrink-0 px-4 py-2 rounded-full border border-border bg-secondary/50 text-sm hover:bg-secondary transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="px-5 pb-4">
        <div className="glass-card flex items-center gap-3 p-2">
          <MessageCircle className="w-5 h-5 text-muted-foreground ml-2" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend(input)}
            placeholder="Ask anything about your finances..."
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => handleSend(input)}
            disabled={!input.trim()}
            className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center disabled:opacity-50"
          >
            <Send className="w-4 h-4 text-primary-foreground" />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default AIInsights;
