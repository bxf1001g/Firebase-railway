# ========================================
# Railway Proxy - GitHub Push Script
# ========================================
# This script pushes the Railway proxy code to GitHub
# Railway will auto-deploy after push

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  RAILWAY PROXY - GITHUB DEPLOY" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Navigate to Railway proxy directory
$railwayProxyPath = "d:\Git\relay_control_app\railway-proxy"

if (Test-Path $railwayProxyPath) {
    Set-Location $railwayProxyPath
    Write-Host "[OK] Found railway-proxy directory" -ForegroundColor Green
} else {
    Write-Host "[ERROR] railway-proxy directory not found!" -ForegroundColor Red
    Write-Host "   Expected: $railwayProxyPath" -ForegroundColor Yellow
    exit 1
}

# Check if git repository exists
if (-not (Test-Path ".git")) {
    Write-Host "`n[ERROR] Not a git repository!" -ForegroundColor Red
    Write-Host "`nInitializing new repository..." -ForegroundColor Yellow
    
    git init
    Write-Host "[OK] Git repository initialized" -ForegroundColor Green
    
    Write-Host "`nAdding remote repository..." -ForegroundColor Yellow
    $repoUrl = "https://github.com/bxf1001g/Firebase-railway.git"
    Write-Host "Using repository: $repoUrl" -ForegroundColor Cyan
    
    git remote add origin $repoUrl
    Write-Host "[OK] Remote repository added" -ForegroundColor Green
}

# Show current status
Write-Host "`n[STATUS] Current Git Status:" -ForegroundColor Cyan
git status --short

# Show files to be committed
Write-Host "`n[FILES] Files to commit:" -ForegroundColor Cyan
Write-Host "   - server.js (updated relay control logic)" -ForegroundColor White
Write-Host "   - package.json (dependencies)" -ForegroundColor White
Write-Host "   - README.md (documentation)" -ForegroundColor White

# Confirm before proceeding
Write-Host "`n[WARNING] This will:" -ForegroundColor Yellow
Write-Host "   1. Add all changes" -ForegroundColor White
Write-Host "   2. Commit with message" -ForegroundColor White
Write-Host "   3. Push to GitHub" -ForegroundColor White
Write-Host "   4. Trigger Railway auto-deploy" -ForegroundColor White

$confirm = Read-Host "`nProceed? (y/n)"

if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host "`n[CANCELLED] Deploy cancelled" -ForegroundColor Red
    exit 0
}

# Add all changes
Write-Host "`n[1/3] Adding files..." -ForegroundColor Cyan
git add .

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to add files" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Files added" -ForegroundColor Green

# Commit changes
Write-Host "`n[2/3] Committing changes..." -ForegroundColor Cyan
$commitMessage = "Update server.js for relay control via Railway proxy"
git commit -m $commitMessage

if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARNING] Nothing to commit or commit failed" -ForegroundColor Yellow
    Write-Host "   Checking if there are uncommitted changes..." -ForegroundColor Yellow
    git status
    exit 1
}
Write-Host "[OK] Changes committed" -ForegroundColor Green

# Push to GitHub
Write-Host "`n[3/3] Pushing to GitHub..." -ForegroundColor Cyan
git push origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARNING] Push failed! Trying 'master' branch..." -ForegroundColor Yellow
    git push origin master
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Push failed on both main and master branches" -ForegroundColor Red
        Write-Host "`nTroubleshooting:" -ForegroundColor Yellow
        Write-Host "   1. Check GitHub credentials" -ForegroundColor White
        Write-Host "   2. Verify remote URL: git remote -v" -ForegroundColor White
        Write-Host "   3. Try: git push -u origin main --force" -ForegroundColor White
        exit 1
    }
}

Write-Host "[OK] Pushed to GitHub!" -ForegroundColor Green

# Show next steps
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  DEPLOYMENT STATUS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "[SUCCESS] Code pushed to GitHub successfully!" -ForegroundColor Green
Write-Host "`n[INFO] Railway will auto-deploy in 1-2 minutes" -ForegroundColor Yellow
Write-Host "`n[NEXT] Check deployment status:" -ForegroundColor Cyan
Write-Host "   1. Go to: https://railway.app/dashboard" -ForegroundColor White
Write-Host "   2. Select your project" -ForegroundColor White
Write-Host "   3. Click Deployments tab" -ForegroundColor White
Write-Host "   4. Watch build logs" -ForegroundColor White

Write-Host "`n[TEST] Test deployment:" -ForegroundColor Cyan
Write-Host "   curl http://yamabiko.proxy.rlwy.net:45343/test" -ForegroundColor White

Write-Host "`n[LOGS] View logs:" -ForegroundColor Cyan
Write-Host "   1. Railway Dashboard -> Your Project" -ForegroundColor White
Write-Host "   2. Click Logs tab" -ForegroundColor White
Write-Host "   3. See real-time server output" -ForegroundColor White

Write-Host "`n========================================`n" -ForegroundColor Cyan

# Keep window open
Read-Host "Press Enter to exit"
