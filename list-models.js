import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Manually load env file since we are running a standalone script
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '.env');

if (fs.existsSync(envPath)) {
    const envConfig = config({ path: envPath });
    // Add to process.env
    for (const k in envConfig.parsed) {
        process.env[k] = envConfig.parsed[k];
    }
}

const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.VITE_GOOGLE_GENAI_API_KEY;

if (!API_KEY) {
    console.error("No API Key found in .env file (VITE_GEMINI_API_KEY or VITE_GOOGLE_GENAI_API_KEY)");
    process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

console.log(`Fetching models from: ${url.replace(API_KEY, 'HIDDEN_KEY')}`);

async function listModels() {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error(text);
            return;
        }
        const data = await response.json();
        const modelNames = data.models ? data.models.map(m => m.name) : [];
        fs.writeFileSync('models.json', JSON.stringify(modelNames, null, 2));
        console.log("Models written to models.json");
    } catch (error) {
        console.error("Failed to fetch models:", error);
    }
}

listModels();
