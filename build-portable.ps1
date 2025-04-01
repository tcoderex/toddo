# Build script for Toddo portable application

Write-Host "Starting optimized portable build for Toddo..." -ForegroundColor Cyan

# Set environment variables for optimization
$env:RUSTFLAGS = "-C target-cpu=native"
$env:CARGO_PROFILE_RELEASE_LTO = "true"
$env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS = "1"
$env:CARGO_PROFILE_RELEASE_OPT_LEVEL = "3"

# Build in release mode
Write-Host "Building release version..." -ForegroundColor Yellow
Push-Location src-tauri
cargo tauri build
$buildResult = $LASTEXITCODE
Pop-Location

if ($buildResult -ne 0) {
    Write-Host "Build failed" -ForegroundColor Red
    exit $buildResult
}

# Create a portable directory if it doesn't exist
$portableDir = "src-tauri/target/release/bundle/portable"
if (-not (Test-Path $portableDir)) {
    New-Item -ItemType Directory -Path $portableDir -Force | Out-Null
}

# Copy the executable to the portable directory
Copy-Item "src-tauri/target/release/toddo.exe" -Destination "$portableDir/Toddo-Portable.exe"

# Copy any necessary resources
$resourcesDir = "$portableDir/resources"
if (-not (Test-Path $resourcesDir)) {
    New-Item -ItemType Directory -Path $resourcesDir -Force | Out-Null
}

# Copy the icon
Copy-Item "src-tauri/icons/app.ico" -Destination "$resourcesDir/app.ico"

Write-Host "Portable build completed successfully!" -ForegroundColor Green
Write-Host "The portable application can be found at: $portableDir/Toddo-Portable.exe" -ForegroundColor Cyan
