# Build script for Toddo application with optimizations

Write-Host "Starting optimized build process for Toddo..." -ForegroundColor Cyan

# Set environment variables for optimization
$env:RUSTFLAGS = "-C target-cpu=native"
$env:CARGO_PROFILE_RELEASE_LTO = "true"
$env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS = "1"
$env:CARGO_PROFILE_RELEASE_OPT_LEVEL = "3"

# Clean previous builds
Write-Host "Cleaning previous builds..." -ForegroundColor Yellow
Push-Location src-tauri
cargo clean
$cleanResult = $LASTEXITCODE
Pop-Location
if ($cleanResult -ne 0) {
    Write-Host "Failed to clean previous builds" -ForegroundColor Red
    exit $cleanResult
}

# Build in release mode
Write-Host "Building in release mode with optimizations..." -ForegroundColor Yellow
Push-Location src-tauri
cargo tauri build
$buildResult = $LASTEXITCODE
Pop-Location
if ($buildResult -ne 0) {
    Write-Host "Build failed" -ForegroundColor Red
    exit $buildResult
}

Write-Host "Build completed successfully!" -ForegroundColor Green
Write-Host "The optimized application can be found in src-tauri/target/release/" -ForegroundColor Cyan
