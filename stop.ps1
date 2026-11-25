#requires -Version 7.2
[CmdletBinding()]
param()

& (Join-Path $PSScriptRoot 'start.ps1') -Stop
