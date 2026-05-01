[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("patch", "minor", "major")]
  [string]$Bump
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Use npm.cmd on Windows to avoid PowerShell wrapper issues with strict mode
$npmCmd = if ($env:OS -match "Windows") { "npm.cmd" } else { "npm" }

$repoRoot = $PSScriptRoot
$packageJsonPath = Join-Path $repoRoot "package.json"

if (-not (Test-Path $packageJsonPath)) {
  throw "Missing file: $packageJsonPath"
}

# Read package.json
$packageJson = Get-Content -Path $packageJsonPath -Raw | ConvertFrom-Json
$packageName = $packageJson.name
$currentVersion = $packageJson.version

Write-Host "Building and publishing $packageName package..." -ForegroundColor Cyan
Write-Host "Current Version: $currentVersion"
Write-Host "Bump Type: $Bump"
Write-Host ""

try {
  Push-Location $repoRoot

  # Step 1: Clean
  Write-Host "Step 1: Cleaning previous build..." -ForegroundColor Yellow
  & $npmCmd run clean
  if ($LASTEXITCODE -ne 0) { throw "& $npmCmd run clean failed" }

  # Step 2: Install dependencies
  Write-Host ""
  Write-Host "Step 2: Installing dependencies..." -ForegroundColor Yellow
  & $npmCmd ci
  if ($LASTEXITCODE -ne 0) { throw "& $npmCmd ci failed" }

  # Step 3: Lint
  Write-Host ""
  Write-Host "Step 3: Linting..." -ForegroundColor Yellow
  & $npmCmd run lint
  if ($LASTEXITCODE -ne 0) { throw "& $npmCmd run lint failed" }

  # Step 4: Type check
  Write-Host ""
  Write-Host "Step 4: Type checking..." -ForegroundColor Yellow
  & $npmCmd run typecheck
  if ($LASTEXITCODE -ne 0) { throw "& $npmCmd run typecheck failed" }

  # Step 5: Test
  Write-Host ""
  Write-Host "Step 5: Running tests..." -ForegroundColor Yellow
  & $npmCmd test
  if ($LASTEXITCODE -ne 0) { throw "& $npmCmd test failed" }

  # Step 6: Build
  Write-Host ""
  Write-Host "Step 6: Building..." -ForegroundColor Yellow
  & $npmCmd run build
  if ($LASTEXITCODE -ne 0) { throw "& $npmCmd run build failed" }

  # Step 7: Version bump (this also creates a git tag)
  Write-Host ""
  Write-Host "Step 7: Bumping version ($Bump)..." -ForegroundColor Yellow
  & $npmCmd version $Bump --no-git-tag-version
  if ($LASTEXITCODE -ne 0) { throw "npm version failed" }

  # Read new version
  $packageJson = Get-Content -Path $packageJsonPath -Raw | ConvertFrom-Json
  $newVersion = $packageJson.version

  Write-Host "Version: $currentVersion -> $newVersion" -ForegroundColor Green

  # Step 8: Publish
  Write-Host ""
  Write-Host "Step 8: Publishing to npm..." -ForegroundColor Yellow
  & $npmCmd publish --access public
  if ($LASTEXITCODE -ne 0) { throw "npm publish failed" }

  Write-Host ""
  Write-Host "Successfully published $packageName@$newVersion to npm!" -ForegroundColor Green
}
catch {
  # Rollback version on failure
  Write-Warning "Build/publish failed. Attempting to rollback version change..."
  $packageJson = Get-Content -Path $packageJsonPath -Raw | ConvertFrom-Json
  $packageJson.version = $currentVersion
  $packageJson | ConvertTo-Json -Depth 100 | Set-Content -Path $packageJsonPath -Encoding utf8
  Write-Warning "Rolled back version in package.json to $currentVersion"
  throw
}
finally {
  Pop-Location
}
