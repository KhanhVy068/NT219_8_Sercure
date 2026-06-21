[CmdletBinding()]
param(
    [ValidateSet('quick', 'report')]
    [string]$Profile = 'quick',

    [int]$Port = 3020,

    [int]$Runs = 0,

    [int]$Duration = 0,

    [string]$ResultsDir = '',

    [switch]$IncludeVault
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required but was not found in PATH.'
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm is required but was not found in PATH.'
}

if (-not (Test-Path (Join-Path $Root 'backend\node_modules'))) {
    Write-Host 'Installing backend dependencies with npm ci...' -ForegroundColor Yellow
    & npm ci --prefix backend
    if ($LASTEXITCODE -ne 0) {
        throw 'npm ci failed.'
    }
}

$esPrivate = Join-Path $Root 'backend\es256-private.pem'
$esPublic = Join-Path $Root 'backend\es256-public.pem'
if (-not (Test-Path $esPrivate) -or -not (Test-Path $esPublic)) {
    Write-Host 'Generating local ES256 benchmark keys...' -ForegroundColor Yellow
    & node '.\backend\generate-es256-keys.js'
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to generate ES256 keys.'
    }
}

if (-not $ResultsDir) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $ResultsDir = Join-Path $Root "results\benchmark-$stamp"
}

$ResultsDir = [System.IO.Path]::GetFullPath($ResultsDir)
New-Item -ItemType Directory -Force -Path $ResultsDir | Out-Null
$env:BENCH_RESULTS_DIR = $ResultsDir
$env:BENCH_GATEWAY_TOKEN = 'demo-gateway-internal-token'

if ($Runs -le 0) {
    $Runs = if ($Profile -eq 'report') { 3 } else { 1 }
}
if ($Duration -le 0) {
    $Duration = if ($Profile -eq 'report') { 30 } else { 5 }
}

$warmup = if ($Profile -eq 'report') { 50 } else { 5 }
$server = $null

function Start-BenchmarkServer([int]$CacheTtlMs, [bool]$VaultEnabled) {
    $env:PORT = [string]$Port
    $env:VAULT_ENABLED = if ($VaultEnabled) { 'true' } else { 'false' }
    $env:VAULT_ADDR = 'http://localhost:8200'
    $env:VAULT_TOKEN = 'root'
    $env:DEMO_JWT_ISSUER = "http://localhost:$Port/demo-idp"
    $env:DEMO_JWT_AUDIENCE = 'secure-api'
    $env:RATE_LIMIT_MAX = '1000000'
    $env:INTROSPECTION_CACHE_TTL_MS = [string]$CacheTtlMs
    $env:GATEWAY_INTERNAL_TOKEN = $env:BENCH_GATEWAY_TOKEN

    $process = Start-Process node `
        -ArgumentList '.\backend\server.js' `
        -WorkingDirectory $Root `
        -WindowStyle Hidden `
        -PassThru

    $deadline = (Get-Date).AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 500
        if ($process.HasExited) {
            throw 'Benchmark server exited early. Run backend/server.js manually to inspect startup errors.'
        }
        try {
            $health = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Port/health" -TimeoutSec 2
            if ($health.StatusCode -eq 200) {
                return $process
            }
        } catch {
            # Retry until deadline.
        }
    } while ((Get-Date) -lt $deadline)

    Stop-Process -Id $process.Id -Force
    throw "Benchmark server did not become healthy on port $Port"
}

function Stop-BenchmarkServer {
    if ($script:server -and -not $script:server.HasExited) {
        Stop-Process -Id $script:server.Id -Force
        $script:server.WaitForExit()
    }
    $script:server = $null
}

function Run-NodeBenchmark([string]$Script, [string[]]$Arguments) {
    Write-Host "`n==> $Script $($Arguments -join ' ')" -ForegroundColor Cyan
    & node $Script @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Benchmark failed: $Script"
    }
}

function Run-Repeated([scriptblock]$Action) {
    1..$Runs | ForEach-Object {
        Write-Host "Run $_/$Runs" -ForegroundColor DarkCyan
        & $Action
    }
}

$baseUrl = "http://localhost:$Port"

try {
    Write-Host "Results: $ResultsDir" -ForegroundColor Green
    Write-Host "Profile=$Profile Runs=$Runs Duration=${Duration}s" -ForegroundColor Green

    $server = Start-BenchmarkServer -CacheTtlMs 5000 -VaultEnabled:$false

    Run-Repeated {
        Run-NodeBenchmark '.\scripts\bench-hs256.js' @("--url=$baseUrl", "--duration=$Duration", '--concurrency=100', "--warmup=$warmup", '--scenario=alg-compare')
        Run-NodeBenchmark '.\scripts\bench-es256.js' @("--url=$baseUrl", "--duration=$Duration", '--concurrency=100', "--warmup=$warmup", '--scenario=alg-compare')
        Run-NodeBenchmark '.\scripts\bench-hs256.js' @("--url=$baseUrl", "--duration=$Duration", '--concurrency=100', "--warmup=$warmup", '--scenario=validation-mode')
        Run-NodeBenchmark '.\scripts\bench-introspection.js' @("--url=$baseUrl", "--duration=$Duration", '--concurrency=100', "--warmup=$warmup", '--scenario=validation-mode', '--cache=cache-on')
        Run-NodeBenchmark '.\scripts\bench-introspection.js' @("--url=$baseUrl", "--duration=$Duration", '--concurrency=100', "--warmup=$warmup", '--scenario=introspection-cache', '--cache=cache-on')
        Run-NodeBenchmark '.\scripts\bench-hmac.js' @("--url=$baseUrl", "--duration=$Duration", '--concurrency=10', "--warmup=$warmup", '--scenario=hmac-load')
        Run-NodeBenchmark '.\scripts\bench-hmac.js' @("--url=$baseUrl", "--duration=$Duration", '--concurrency=100', "--warmup=$warmup", '--scenario=hmac-load')
    }

    if ($Profile -eq 'report') {
        foreach ($concurrency in 10, 100, 500) {
            Run-NodeBenchmark '.\scripts\bench-hs256.js' @("--url=$baseUrl", "--duration=$Duration", "--concurrency=$concurrency", "--warmup=$warmup", '--scenario=scalability')
            Run-NodeBenchmark '.\scripts\bench-es256.js' @("--url=$baseUrl", "--duration=$Duration", "--concurrency=$concurrency", "--warmup=$warmup", '--scenario=scalability')
            Run-NodeBenchmark '.\scripts\bench-introspection.js' @("--url=$baseUrl", "--duration=$Duration", "--concurrency=$concurrency", "--warmup=$warmup", '--scenario=scalability', '--cache=cache-on')
        }
    }

    Stop-BenchmarkServer
    $server = Start-BenchmarkServer -CacheTtlMs 0 -VaultEnabled:$false
    Run-Repeated {
        Run-NodeBenchmark '.\scripts\bench-introspection.js' @("--url=$baseUrl", "--duration=$Duration", '--concurrency=100', "--warmup=$warmup", '--scenario=introspection-cache', '--cache=cache-off')
    }

    if ($IncludeVault) {
        Stop-BenchmarkServer
        $server = Start-BenchmarkServer -CacheTtlMs 5000 -VaultEnabled:$true
        Run-Repeated {
            Run-NodeBenchmark '.\scripts\bench-vault-reload.js' @("--url=$baseUrl", '--duration=10', '--concurrency=2', '--warmup=3', '--scenario=vault-reload')
        }
    }
}
finally {
    Stop-BenchmarkServer
}

Run-NodeBenchmark '.\scripts\aggregate-results.js' @()
Run-NodeBenchmark '.\scripts\summarize-benchmarks.js' @()
if ($Profile -eq 'report') {
    Run-NodeBenchmark '.\scripts\generate-ablation-report.js' @()
}

if (Get-Command python -ErrorAction SilentlyContinue) {
    & python '.\scripts\plot-benchmarks.py'
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'Chart generation failed. Install matplotlib and run plot-benchmarks.py again.'
    }
}

Write-Host "`nBenchmark complete: $ResultsDir" -ForegroundColor Green
