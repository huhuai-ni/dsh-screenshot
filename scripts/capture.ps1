param(
  [ValidateSet('full','window')]
  [string]$Mode = 'full',
  [string]$OutDir = "$env:USERPROFILE\Pictures\dsh-shot"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$src = @'
using System;
using System.Runtime.InteropServices;

public class WinRect {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
}
'@

if (-not ("WinRect" -as [type])) {
  Add-Type -TypeDefinition $src
}

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }

if ($Mode -eq 'window') {
  $h = [WinRect]::GetForegroundWindow()
  $r = New-Object WinRect+RECT
  [void][WinRect]::GetWindowRect($h, [ref]$r)
  $w = $r.Right - $r.Left
  $hgt = $r.Bottom - $r.Top
  if ($w -le 0 -or $hgt -le 0) {
    $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  } else {
    $bounds = New-Object System.Drawing.Rectangle($r.Left, $r.Top, $w, $hgt)
  }
} else {
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
}

$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size)
$g.Dispose()

$name = "shot-{0}.png" -f (Get-Date -Format 'yyyyMMdd-HHmmss')
$path = Join-Path $OutDir $name
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output $path
