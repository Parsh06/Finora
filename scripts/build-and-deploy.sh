#!/bin/bash

# Build and Deploy Script for Finora
# This script verifies environment variables and builds the application

echo "🚀 Finora Build and Deploy Script"
echo "=================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found!"
    echo "📝 Creating .env.example template..."
    echo ""
    echo "Please create a .env file with:"
    echo "  VITE_GEMINI_API_KEY=your_key_here"
    echo "  VITE_GROQ_API_KEY=your_key_here"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Verify environment variables
echo "🔍 Verifying environment variables..."
npm run verify-env

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Environment variable verification failed!"
    echo "Please set all required environment variables before building."
    exit 1
fi

echo ""
echo "📦 Building application..."
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful!"
    echo ""
    echo "📤 Ready to deploy. Choose your platform:"
    echo "  1. Firebase: firebase deploy --only hosting"
    echo "  2. Vercel: vercel --prod"
    echo "  3. Netlify: netlify deploy --prod"
    echo ""
else
    echo ""
    echo "❌ Build failed!"
    exit 1
fi

