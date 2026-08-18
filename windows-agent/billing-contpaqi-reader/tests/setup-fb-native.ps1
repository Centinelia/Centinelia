# setup-fb-native.ps1
# Downloads and extracts Firebird 3.0 embedded binaries required to run
# FirebirdCatalogRepositoryTests locally.
#
# Idempotent: if fbembed.dll already exists in tests/fb-native/, does nothing.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File tests\setup-fb-native.ps1
#
# The script downloads Firebird 3.0.11 embedded (x64) from the official
# GitHub releases page and extracts it into tests/fb-native/.
# These binaries are gitignored. CI environments must run this script before
# running dotnet test if Firebird tests are enabled.

$ErrorActionPreference = "Stop"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$FbNativeDir = Join-Path $ScriptDir "fb-native"
$FbEmbedDll  = Join-Path $FbNativeDir "fbembed.dll"

# Idempotent check
if (Test-Path $FbEmbedDll) {
    Write-Host "fbembed.dll already present at $FbEmbedDll. Nothing to do."
    exit 0
}

Write-Host "Setting up Firebird embedded in $FbNativeDir ..."

$ZipUrl  = "https://github.com/FirebirdSQL/firebird/releases/download/v3.0.11/Firebird-3.0.11.33703-0-x64-embed.zip"
$ZipFile = Join-Path $env:TEMP "Firebird-3.0.11-x64-embed.zip"
$ExtractDir = Join-Path $env:TEMP "firebird-embed-extract"

# Download ZIP
Write-Host "Downloading $ZipUrl ..."
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipFile -UseBasicParsing

# Extract to temp dir
if (Test-Path $ExtractDir) {
    Remove-Item -Recurse -Force $ExtractDir
}
New-Item -ItemType Directory -Path $ExtractDir | Out-Null
Write-Host "Extracting ..."
Expand-Archive -Path $ZipFile -DestinationPath $ExtractDir -Force

# Find the root of the extracted archive (may be nested in a subdirectory)
$ExtractedRoot = Get-ChildItem $ExtractDir -Directory | Select-Object -First 1
if (-not $ExtractedRoot) {
    # Files may be directly at root of the zip
    $ExtractedRoot = $ExtractDir
} else {
    $ExtractedRoot = $ExtractedRoot.FullName
}

# Ensure destination directory exists
if (-not (Test-Path $FbNativeDir)) {
    New-Item -ItemType Directory -Path $FbNativeDir | Out-Null
}

# Copy all extracted files to fb-native/
Write-Host "Copying files to $FbNativeDir ..."
Copy-Item -Path (Join-Path $ExtractedRoot "*") -Destination $FbNativeDir -Recurse -Force

# Verify fbembed.dll is present
if (-not (Test-Path $FbEmbedDll)) {
    Write-Error "Setup failed: fbembed.dll not found in $FbNativeDir after extraction."
    exit 1
}

# Cleanup temp files
Remove-Item -Force $ZipFile -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $ExtractDir -ErrorAction SilentlyContinue

Write-Host "Firebird embedded setup complete. fbembed.dll is ready at $FbEmbedDll"
