
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || import.meta.env.VITE_GROK_API_KEY || "";

// Track failures
let apiFailureCount = 0;
const MAX_FAILURES = 3;
let apiDisabled = false;

export interface GroqMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface GroqCompletionOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
}

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const FALLBACK_MODELS = ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];

/**
 * Check if the API key is valid
 */
export const isGroqConfigured = (): boolean => {
    return !!GROQ_API_KEY && GROQ_API_KEY.length > 10;
};

/**
 * Core function to call Groq API
 */
export const groqChatCompletion = async (
    messages: GroqMessage[],
    options: GroqCompletionOptions = {}
): Promise<string> => {
    if (!isGroqConfigured()) {
        throw new Error("Groq API key is not configured.");
    }

    if (apiDisabled) {
        throw new Error("Groq API disabled due to repeated failures.");
    }

    const models = [options.model || DEFAULT_MODEL, ...FALLBACK_MODELS];
    let lastError: Error | null = null;

    for (const model of models) {
        // Avoid using a model that just failed if it was explicitly passed as option.model? 
        // Simplified logic: try the list in order.

        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${GROQ_API_KEY}`,
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    temperature: options.temperature ?? 0.7,
                    max_tokens: options.maxTokens ?? 1024,
                    response_format: options.jsonMode ? { type: "json_object" } : undefined,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `Status ${response.status}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (!content) {
                throw new Error("Empty response from Groq API");
            }

            apiFailureCount = 0; // Reset on success
            return content;

        } catch (error: any) {
            console.warn(`[Groq] Model ${model} failed:`, error.message);
            lastError = error;
            // Continue to next model
        }
    }

    apiFailureCount++;
    if (apiFailureCount >= MAX_FAILURES) {
        apiDisabled = true;
        console.error("[Groq] API disabled due to too many failures.");
    }

    throw lastError || new Error("All Groq models failed.");
};

/**
 * Helper for JSON responses
 */
export const groqJsonCompletion = async <T>(
    messages: GroqMessage[],
    options: GroqCompletionOptions = {}
): Promise<T> => {
    // Enforce system prompt to request JSON if not already present (optional, but good practice)
    // We assume the caller handles the prompt engineering for JSON, but we enforce jsonMode.

    const content = await groqChatCompletion(messages, { ...options, jsonMode: true });

    try {
        return JSON.parse(content) as T;
    } catch (e) {
        console.error("[Groq] JSON parse error:", e, "Content:", content);
        throw new Error("Failed to parse AI response as JSON.");
    }
};
