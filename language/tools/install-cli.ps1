$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$installRoot = Join-Path $env:LOCALAPPDATA 'FableScript'
$runtimeTarget = Join-Path $installRoot 'runtime'
$binTarget = Join-Path $installRoot 'bin'

function Remove-LegacyVendor([string]$RuntimeDirectory) {
    $runtimeFullPath = [System.IO.Path]::GetFullPath($RuntimeDirectory).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    $vendorPath = [System.IO.Path]::GetFullPath((Join-Path $RuntimeDirectory 'vendor'))
    if (-not $vendorPath.StartsWith($runtimeFullPath + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path $vendorPath -Leaf) -ne 'vendor') {
        throw "Unsafe legacy vendor path: $vendorPath"
    }
    if (Test-Path -LiteralPath $vendorPath) {
        Remove-Item -LiteralPath $vendorPath -Recurse -Force
    }
}

$codeCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\Code.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft VS Code\Code.exe')
)
$codePath = $codeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $codePath) {
    throw 'VS Code was not found. It is required to run FableScript CLI without a separate Node.js installation.'
}

New-Item -ItemType Directory -Path $runtimeTarget -Force | Out-Null
New-Item -ItemType Directory -Path $binTarget -Force | Out-Null
Remove-LegacyVendor $runtimeTarget
Copy-Item -LiteralPath (Join-Path $projectRoot 'runtime\engine.js') -Destination $runtimeTarget -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'runtime\module-loader.js') -Destination $runtimeTarget -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'runtime\package-manager.js') -Destination $runtimeTarget -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'runtime\cli.js') -Destination $runtimeTarget -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'runtime\native-modules') -Destination $runtimeTarget -Recurse -Force
Remove-Item -LiteralPath (Join-Path $runtimeTarget 'native-modules\window-host.py') -Force -ErrorAction SilentlyContinue

$launcherPath = Join-Path $binTarget 'fable.cmd'
$primaryLauncher = @"
@echo off
chcp 65001 >nul
set "ELECTRON_RUN_AS_NODE=1"
"$codePath" "$runtimeTarget\cli.js" %*
"@
Set-Content -LiteralPath $launcherPath -Value $primaryLauncher -Encoding Ascii

$windowsApps = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps'
if (Test-Path -LiteralPath $windowsApps) {
    $windowsRuntime = Join-Path $windowsApps 'FableScriptRuntime'
    New-Item -ItemType Directory -Path $windowsRuntime -Force | Out-Null
    Remove-LegacyVendor $windowsRuntime
    Copy-Item -LiteralPath (Join-Path $projectRoot 'runtime\engine.js') -Destination $windowsRuntime -Force
    Copy-Item -LiteralPath (Join-Path $projectRoot 'runtime\module-loader.js') -Destination $windowsRuntime -Force
    Copy-Item -LiteralPath (Join-Path $projectRoot 'runtime\package-manager.js') -Destination $windowsRuntime -Force
    Copy-Item -LiteralPath (Join-Path $projectRoot 'runtime\cli.js') -Destination $windowsRuntime -Force
    Copy-Item -LiteralPath (Join-Path $projectRoot 'runtime\native-modules') -Destination $windowsRuntime -Recurse -Force
    Remove-Item -LiteralPath (Join-Path $windowsRuntime 'native-modules\window-host.py') -Force -ErrorAction SilentlyContinue
    $windowsLauncher = @"
@echo off
chcp 65001 >nul
set "ELECTRON_RUN_AS_NODE=1"
"$codePath" "$windowsRuntime\cli.js" %*
"@
    Set-Content -LiteralPath (Join-Path $windowsApps 'fable.cmd') -Value $windowsLauncher -Encoding Ascii
}

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$entries = @($userPath -split ';' | Where-Object { $_ })
if (-not ($entries | Where-Object { $_.TrimEnd('\') -ieq $binTarget.TrimEnd('\') })) {
    $newPath = (@($entries) + $binTarget) -join ';'
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
}

Write-Output "FableScript CLI installed: $launcherPath"
Write-Output 'Run: fable install greetings'
