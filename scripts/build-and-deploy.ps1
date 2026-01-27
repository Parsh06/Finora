# Build and Deploy Script for Finora (PowerShell)
# This script verifies environment variables and builds the application

Write-Host "🚀 Finora Build and Deploy Script" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env file exists
if (-not (Test-Path .env)) {
    Write-Host "⚠️  Warning: .env file not found!" -ForegroundColor Yellow
    Write-Host "📝 Please create a .env file with:" -ForegroundColor Yellow
    Write-Host "  VITE_GEMINI_API_KEY=your_key_here" -ForegroundColor Yellow
    Write-Host "  VITE_GROQ_API_KEY=your_key_here" -ForegroundColor Yellow
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 1
    }
}

# Verify environment variables
Write-Host "🔍 Verifying environment variables..." -ForegroundColor Cyan
npm run verify-env

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Environment variable verification failed!" -ForegroundColor Red
    Write-Host "Please set all required environment variables before building." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📦 Building application..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Build successful!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📤 Ready to deploy. Choose your platform:" -ForegroundColor Cyan
    Write-Host "  1. Firebase: firebase deploy --only hosting" -ForegroundColor White
    Write-Host "  2. Vercel: vercel --prod" -ForegroundColor White
    Write-Host "  3. Netlify: netlify deploy --prod" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

