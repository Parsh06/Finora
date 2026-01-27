/**
 * Environment Variable Check Utility
 * Provides runtime checks and helpful error messages for missing API keys
 */

export const checkEnvironmentVariables = () => {
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_GENAI_API_KEY;
  const groqKey = import.meta.env.VITE_GROQ_API_KEY || import.meta.env.VITE_GROK_API_KEY;

  const issues: string[] = [];

  if (!geminiKey || geminiKey.length < 20) {
    issues.push("Gemini API key (VITE_GEMINI_API_KEY) is missing or invalid");
  }

  if (!groqKey || groqKey.length < 20) {
    issues.push("Groq API key (VITE_GROQ_API_KEY) is missing or invalid");
  }

  if (issues.length > 0 && import.meta.env.DEV) {
    console.warn("⚠️ Environment Variable Issues:");
    issues.forEach(issue => console.warn(`   - ${issue}`));
    console.warn("\n📝 To fix:");
    console.warn("   1. Create a .env file in the project root");
    console.warn("   2. Add: VITE_GEMINI_API_KEY=your_key_here");
    console.warn("   3. Add: VITE_GROQ_API_KEY=your_key_here");
    console.warn("   4. Restart the dev server");
  }

  return {
    geminiConfigured: !!geminiKey && geminiKey.length >= 20,
    groqConfigured: !!groqKey && groqKey.length >= 20,
    allConfigured: issues.length === 0,
    issues,
  };
};

// Run check on module load (development only)
if (import.meta.env.DEV) {
  checkEnvironmentVariables();
}

