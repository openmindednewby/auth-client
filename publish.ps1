[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("patch", "minor", "major")]
  [string]$Bump,

  # Explicit opt-in for a MAJOR bump. Without it, publish-guard refuses '-Bump major':
  # a stray '-Bump major' shipped @dloizides/auth-client@4.0.0 with an API identical to 3.4.1.
  [switch]$AllowMajor
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
# Defensive: strip BOM if a prior failed publish corrupted package.json.
$rawPkg = Get-Content -Path $packageJsonPath -Raw
if ($rawPkg.Length -gt 0 -and $rawPkg[0] -eq [char]0xFEFF) { $rawPkg = $rawPkg.Substring(1) }
$packageJson = $rawPkg | ConvertFrom-Json
$packageName = $packageJson.name
$currentVersion = $packageJson.version

Write-Host "Building and publishing $packageName package..." -ForegroundColor Cyan
Write-Host "Current Version: $currentVersion"
Write-Host "Bump Type: $Bump"
Write-Host ""

# --- Publish guard (NpmPackages/scripts/publish-guard.ps1) ----------------------------
# Refuses: a dirty working tree (registry drifting ahead of the repo), an un-opted-in major,
# and re-publishing a version that already exists on npm. Warns on a missing CHANGELOG entry.
$script:VersionCommitted = $false
$script:NewVersion = $currentVersion
# Vendored per-package so the guard is versioned WITH the package and survives a fresh clone
# (NpmPackages/ and the SaaS root are not git repos — a shared copy would be tracked by nothing).
$guardPath = Join-Path $PSScriptRoot "publish-guard.ps1"
if (-not (Test-Path $guardPath)) {
  throw "Missing publish guard: $guardPath - it is mandatory. Restore NpmPackages/scripts/publish-guard.ps1 before publishing."
}
& $guardPath -PackageDir $repoRoot -Bump $Bump -AllowMajor:$AllowMajor
# --------------------------------------------------------------------------------------

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

  # --- Release commit (publish-guard) -------------------------------------------------
  # Commit the bump BEFORE publishing so the repo can never lag the registry again:
  # auth-client@4.0.0 / ui-layout@1.2.0 went live on npm while their repos said 3.4.1 / 1.1.0.
  # We commit, we do NOT push - pushing stays a human decision.
  Write-Host ""
  Write-Host "Step: Committing version bump (release: $packageName v$newVersion)..." -ForegroundColor Yellow
  $filesToCommit = @("package.json")
  if (Test-Path (Join-Path $repoRoot "package-lock.json")) { $filesToCommit += "package-lock.json" }
  if (Test-Path (Join-Path $repoRoot "CHANGELOG.md")) { $filesToCommit += "CHANGELOG.md" }
  & git -C $repoRoot add -- $filesToCommit
  if ($LASTEXITCODE -ne 0) { throw "git add failed - ABORTING BEFORE npm publish. Never publish a version that is not committed. Fix the repo in $repoRoot and re-run." }
  & git -C $repoRoot commit -m "release: $packageName v$newVersion"
  if ($LASTEXITCODE -ne 0) { throw "git commit failed - ABORTING BEFORE npm publish (better to not publish than to publish uncommitted). Check 'git -C $repoRoot status', fix it, and re-run publish.ps1." }
  $script:VersionCommitted = $true
  $script:NewVersion = $newVersion
  Write-Host "Committed 'release: $packageName v$newVersion' (NOT pushed - run: git -C $repoRoot push)" -ForegroundColor Green
  # ------------------------------------------------------------------------------------

  # Step 8: Publish
  Write-Host ""
  Write-Host "Step 8: Publishing to npm..." -ForegroundColor Yellow
  & $npmCmd publish --access public
  if ($LASTEXITCODE -ne 0) { throw "npm publish failed" }

  Write-Host ""
  Write-Host "Successfully published $packageName@$newVersion to npm!" -ForegroundColor Green
}
catch {
  # The bump is already committed: rolling package.json back here would re-dirty the tree
  # and desync it from the release commit. Leave the commit; tell the human what to do.
  if ($script:VersionCommitted) {
    Write-Warning "Publish FAILED, but the version bump to v$($script:NewVersion) is ALREADY COMMITTED."
    Write-Warning "Nothing was published. Either fix the failure and re-run 'npm publish --access public' in $repoRoot,"
    Write-Warning "or undo the release commit with: git -C $repoRoot reset --hard HEAD~1"
    throw
  }
  # Rollback version on failure
  Write-Warning "Build/publish failed. Attempting to rollback version change..."
    # Rewrite ONLY the version string in the raw text. Do NOT round-trip the file
  # through ConvertFrom-Json | ConvertTo-Json: PowerShell re-serialises the WHOLE
  # document, unicode-escaping '>' as \u003e and '&' as \u0026 and reindenting it.
  # The output stays VALID JSON -- so nothing complains -- but it is no longer the
  # file npm wrote. That silently corrupted 10 package.json files (2 got committed).
  $raw = [System.IO.File]::ReadAllText($packageJsonPath)
  $pattern = '("version"\s*:\s*")[^"]*(")'
  $rolledBack = [regex]::Replace($raw, $pattern, "`${1}$currentVersion`${2}", 1)
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($packageJsonPath, $rolledBack, $utf8NoBom)
  Write-Warning "Rolled back version in package.json to $currentVersion"
  throw
}
finally {
  Pop-Location
}
