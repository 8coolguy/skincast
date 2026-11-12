Add-Type -AssemblyName System.Windows.Forms
while ($true) {
  $point = [System.Windows.Forms.Cursor]::Position
  $screen = [System.Windows.Forms.Screen]::FromPoint($point)
  $bounds = $screen.Bounds
  $x = [Math]::Max(-1, [Math]::Min(1, (($point.X - $bounds.X) / $bounds.Width) * 2 - 1))
  $y = [Math]::Max(-1, [Math]::Min(1, (($point.Y - $bounds.Y) / $bounds.Height) * 2 - 1))
  @{x=$x; y=$y; display=$screen.DeviceName} | ConvertTo-Json -Compress
  Start-Sleep -Milliseconds 33
}
