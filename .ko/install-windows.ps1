# Windows: build the Korean fork and install it with its NSIS installer.
# Needs: Rust (MSVC toolchain), Visual Studio C++ Build Tools, Node 20+, pnpm.
# WebView2 ships with Windows 10/11.
# Run: powershell -ExecutionPolicy Bypass -File .ko\install-windows.ps1
#
# ASCII only on purpose: Windows PowerShell 5.1 reads a BOM-less script in the
# system code page, so Korean text here would come out garbled.

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

# Native commands don't throw on failure; stop on a non-zero exit code.
function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command $($Arguments -join ' ') failed (exit $LASTEXITCODE)"
    }
}

Invoke-Checked 'pnpm' @('install', '--frozen-lockfile')
Invoke-Checked 'pnpm' @('tauri', 'build', '--bundles', 'nsis')

$installer = Get-ChildItem 'src-tauri\target\release\bundle\nsis\*-setup.exe' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $installer) { throw 'NSIS installer not found under src-tauri\target\release\bundle\nsis' }

Get-Process -Name 'anyscp' -ErrorAction SilentlyContinue | Stop-Process -Force
# /S = silent install (per-user, no admin prompt).
$setup = Start-Process -FilePath $installer.FullName -ArgumentList '/S' -Wait -PassThru
if ($setup.ExitCode -ne 0) { throw "installer failed (exit $($setup.ExitCode))" }

$commit = git rev-parse --short HEAD
Write-Host "Installed: $($installer.Name) ($commit)"
