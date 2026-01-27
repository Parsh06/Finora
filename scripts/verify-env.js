/**
 * Environment Variable Verification Script
 * Run this before building to ensure all required environment variables are set
 */

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

