# Quick Redeploy Script for Finora
# Use this after fixing OAuth domain authorization

Write-Host ""
Write-Host "🚀 Finora Quick Redeploy" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host ""

# Load environment variables from .env
Write-Host "📄 Loading environment variables from .env..." -ForegroundColor Cyan
Get-Content .env | ForEach-Object { 
    if ($_ -match '^VITE_GEMINI_API_KEY=(.+)$') { 
        $env:VITE_GEMINI_API_KEY = $matches[1].Trim()
        Write-Host "   ✅ VITE_GEMINI_API_KEY loaded" -ForegroundColor Green
    }
    if ($_ -match '^VITE_GROQ_API_KEY=(.+)$') { 
        $env:VITE_GROQ_API_KEY = $matches[1].Trim()
        Write-Host "   ✅ VITE_GROQ_API_KEY loaded" -ForegroundColor Green
    }
}

# Verify environment variables
Write-Host ""
Write-Host "🔍 Verifying environment variables..." -ForegroundColor Cyan
npm run verify-env

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Environment variable verification failed!" -ForegroundColor Red
    exit 1
}

# Build
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

# Deploy
Write-Host ""
Write-Host "🚀 Deploying to finora.web.app..." -ForegroundColor Cyan
firebase deploy --only hosting:finora

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Deployment successful!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 Your app is live at: https://finora.web.app" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📝 Next steps:" -ForegroundColor Yellow
    Write-Host "   1. Make sure finora.web.app is added to Firebase Authorized Domains" -ForegroundColor White
    Write-Host "   2. Test Google sign-in on https://finora.web.app" -ForegroundColor White
    Write-Host "   3. Check browser console for any errors" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Deployment failed!" -ForegroundColor Red
    exit 1
}

