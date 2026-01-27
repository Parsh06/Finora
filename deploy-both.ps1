# Deploy to Both Firebase Hosting Sites
# This script builds once and deploys to both finora.web.app and finora-bd5cc.web.app

Write-Host ""
Write-Host "🚀 Finora - Deploy to Both Sites" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Load environment variables from .env
Write-Host "📄 Loading environment variables from .env..." -ForegroundColor Cyan
if (Test-Path .env) {
    Get-Content .env | ForEach-Object { 
        if ($_ -match '^VITE_GEMINI_API_KEY=(.+)$') { 
            $env:VITE_GEMINI_API_KEY = $matches[1].Trim()
        }
        if ($_ -match '^VITE_GROQ_API_KEY=(.+)$') { 
            $env:VITE_GROQ_API_KEY = $matches[1].Trim()
        }
    }
    Write-Host "✅ Environment variables loaded" -ForegroundColor Green
} else {
    Write-Host "⚠️  Warning: .env file not found!" -ForegroundColor Yellow
    Write-Host "   Continuing without environment variables..." -ForegroundColor Yellow
}

# Verify environment variables
Write-Host ""
Write-Host "🔍 Verifying environment variables..." -ForegroundColor Cyan
npm run verify-env

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Environment variable verification failed!" -ForegroundColor Red
    Write-Host "   Continuing anyway, but API features may not work..." -ForegroundColor Yellow
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

# Deploy to first site: finora.web.app
Write-Host ""
Write-Host "🚀 Deploying to finora.web.app..." -ForegroundColor Cyan
firebase deploy --only hosting:finora

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Deployment to finora.web.app failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Successfully deployed to finora.web.app" -ForegroundColor Green

# Deploy to second site: finora-bd5cc.web.app (default site)
Write-Host ""
Write-Host "🚀 Deploying to finora-bd5cc.web.app..." -ForegroundColor Cyan
# Temporarily change firebase.json to use default site, then deploy
$firebaseJson = Get-Content firebase.json -Raw | ConvertFrom-Json
$originalSite = $firebaseJson.hosting.site
$firebaseJson.hosting.site = "finora-bd5cc"
$firebaseJson | ConvertTo-Json -Depth 10 | Set-Content firebase.json
firebase deploy --only hosting
# Restore original site
$firebaseJson.hosting.site = $originalSite
$firebaseJson | ConvertTo-Json -Depth 10 | Set-Content firebase.json

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Deployment to finora-bd5cc.web.app failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Successfully deployed to finora-bd5cc.web.app" -ForegroundColor Green

# Success message
Write-Host ""
Write-Host "🎉 Deployment Complete!" -ForegroundColor Green
Write-Host "======================" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Your app is now live on both sites:" -ForegroundColor Green
Write-Host "   🌐 https://finora.web.app" -ForegroundColor Cyan
Write-Host "   🌐 https://finora-bd5cc.web.app" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Next steps:" -ForegroundColor Yellow
Write-Host "   1. Test both URLs to ensure they work correctly" -ForegroundColor White
Write-Host "   2. Verify Google sign-in works on both sites" -ForegroundColor White
Write-Host "   3. Check that all features are functioning properly -ForegroundColor White
Write-Host ""
