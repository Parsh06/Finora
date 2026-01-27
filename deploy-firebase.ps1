# Firebase Deployment Script for Finora
# This script sets environment variables and deploys to Firebase Hosting

Write-Host ""
Write-Host "🚀 Finora Firebase Deployment" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# Check if .env file exists and read from it
$geminiKey = $null
$groqKey = $null

if (Test-Path .env) {
    Write-Host "📄 Found .env file, reading environment variables..." -ForegroundColor Green
    $envContent = Get-Content .env
    
    foreach ($line in $envContent) {
        if ($line -match "^VITE_GEMINI_API_KEY=(.+)$") {
            $geminiKey = $matches[1].Trim()
        }
        if ($line -match "^VITE_GROQ_API_KEY=(.+)$") {
            $groqKey = $matches[1].Trim()
        }
    }
}

# Prompt for API keys if not found in .env
if (-not $geminiKey -or $geminiKey -eq "" -or $geminiKey -match "your_|here") {
    Write-Host ""
    Write-Host "⚠️  Gemini API Key not found in .env file" -ForegroundColor Yellow
    Write-Host "📝 Please enter your Gemini API key:" -ForegroundColor Yellow
    Write-Host "   Get it from: https://aistudio.google.com/app/apikey" -ForegroundColor Gray
    $geminiKey = Read-Host "   VITE_GEMINI_API_KEY"
}

if (-not $groqKey -or $groqKey -eq "" -or $groqKey -match "your_|here") {
    Write-Host ""
    Write-Host "⚠️  Groq API Key not found in .env file" -ForegroundColor Yellow
    Write-Host "📝 Please enter your Groq API key:" -ForegroundColor Yellow
    Write-Host "   Get it from: https://console.groq.com/keys" -ForegroundColor Gray
    $groqKey = Read-Host "   VITE_GROQ_API_KEY"
}

# Validate API keys
if (-not $geminiKey -or $geminiKey.Length -lt 20) {
    Write-Host ""
    Write-Host "❌ Invalid Gemini API Key!" -ForegroundColor Red
    Write-Host "   API key should be at least 20 characters long." -ForegroundColor Red
    exit 1
}

if (-not $groqKey -or $groqKey.Length -lt 20) {
    Write-Host ""
    Write-Host "❌ Invalid Groq API Key!" -ForegroundColor Red
    Write-Host "   API key should be at least 20 characters long." -ForegroundColor Red
    exit 1
}

# Set environment variables for current session
Write-Host ""
Write-Host "🔧 Setting environment variables..." -ForegroundColor Cyan
$env:VITE_GEMINI_API_KEY = $geminiKey
$env:VITE_GROQ_API_KEY = $groqKey

Write-Host "✅ Environment variables set!" -ForegroundColor Green
Write-Host "   VITE_GEMINI_API_KEY: $($geminiKey.Substring(0, [Math]::Min(15, $geminiKey.Length)))..." -ForegroundColor Gray
Write-Host "   VITE_GROQ_API_KEY: $($groqKey.Substring(0, [Math]::Min(15, $groqKey.Length)))..." -ForegroundColor Gray

# Verify environment variables
Write-Host ""
Write-Host "🔍 Verifying environment variables..." -ForegroundColor Cyan
npm run verify-env

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Environment variable verification failed!" -ForegroundColor Red
    exit 1
}

# Build the application
Write-Host ""
Write-Host "📦 Building application..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Build successful!" -ForegroundColor Green

# Check if Firebase is initialized
if (-not (Test-Path firebase.json)) {
    Write-Host ""
    Write-Host "⚠️  Firebase not initialized. Initializing..." -ForegroundColor Yellow
    Write-Host "   Please select:" -ForegroundColor Yellow
    Write-Host "   - Use existing project: finora-bd5cc" -ForegroundColor Gray
    Write-Host "   - Public directory: dist" -ForegroundColor Gray
    Write-Host "   - Single-page app: Yes" -ForegroundColor Gray
    Write-Host ""
    firebase init hosting
}

# Deploy to Firebase
Write-Host ""
Write-Host "🚀 Deploying to Firebase Hosting (finora.web.app)..." -ForegroundColor Cyan
Write-Host ""
firebase deploy --only hosting:finora

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Deployment successful!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🎉 Your app is now live!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 Next steps:" -ForegroundColor Cyan
    Write-Host "   1. Ensure finora.web.app is in Firebase Authorized Domains" -ForegroundColor White
    Write-Host "   2. Test Google sign-in on https://finora.web.app" -ForegroundColor White
    Write-Host "   3. Test bill scanning feature" -ForegroundColor White
    Write-Host "   4. Test AI budget creation" -ForegroundColor White
    Write-Host "   5. Test voice transactions" -ForegroundColor White
    Write-Host "   6. Check browser console for any errors" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Deployment failed!" -ForegroundColor Red
    Write-Host "   Check the error messages above." -ForegroundColor Red
    exit 1
}

