/**
 * Environment Variable Verification Script
 * Run this before building to ensure all required environment variables are set
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file if it exists
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
  console.log('📄 Loaded environment variables from .env');
}

const requiredEnvVars = [
  'VITE_GEMINI_API_KEY',
  'VITE_GROQ_API_KEY'
];

console.log('🔍 Verifying environment variables...\n');

let allPresent = true;
const missing = [];
const present = [];

requiredEnvVars.forEach(varName => {
  const value = process.env[varName];
  if (value && value.length > 10 && !value.includes('your_') && !value.includes('here')) {
    present.push(varName);
    console.log(`✅ ${varName}: Set (${value.substring(0, 10)}...)`);
  } else {
    missing.push(varName);
    allPresent = false;
    console.log(`❌ ${varName}: Missing or invalid`);
  }
});

console.log('\n' + '='.repeat(50));

if (allPresent) {
  console.log('✅ All environment variables are set correctly!');
  console.log('🚀 Ready to build and deploy.\n');
  process.exit(0);
} else {
  console.log('❌ Missing or invalid environment variables:');
  missing.forEach(v => console.log(`   - ${v}`));
  console.log('\n📝 Please set these variables in your .env file or hosting platform.');
  console.log('📖 See DEPLOYMENT.md for instructions.\n');
  process.exit(1);
}

