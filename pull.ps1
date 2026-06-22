param(
  [string]$Remote = "origin",
  [string]$Branch = "from-laptop"
)

$ErrorActionPreference = "Stop"

Write-Host "== Voxis sync start ==" -ForegroundColor Cyan

# 1) If a rebase is in progress, abort it cleanly first
$rebaseInProgress = (Test-Path ".git\rebase-merge") -or (Test-Path ".git\rebase-apply")
if ($rebaseInProgress) {
  Write-Host "Rebase in progress detected. Aborting..." -ForegroundColor Yellow
  git rebase --abort
}

# 2) Stash local work if needed
$hasChanges = git status --porcelain
$stashed = $false
if ($hasChanges) {
  $stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
  Write-Host "Stashing local changes..." -ForegroundColor Yellow
  git stash push -u -m "auto-stash before pull ($stamp)"
  $stashed = $true
}

# 3) Sync branch
git fetch $Remote $Branch
git checkout $Branch
git pull --ff-only $Remote $Branch

# 4) Re-apply stash if one was created
if ($stashed) {
  Write-Host "Re-applying stashed changes..." -ForegroundColor Yellow
  git stash pop
}

Write-Host "== Voxis sync complete ==" -ForegroundColor Green
git status -sb