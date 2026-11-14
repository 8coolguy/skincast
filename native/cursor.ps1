Add-Type -AssemblyName System.Windows.Forms
$leftWasDown = $false
while ($true) {
  $point = [System.Windows.Forms.Cursor]::Position
  $screen = [System.Windows.Forms.Screen]::FromPoint($point)
  $bounds = $screen.Bounds
  $x = [Math]::Max(-1, [Math]::Min(1, (($point.X - $bounds.X) / $bounds.Width) * 2 - 1))
  $y = [Math]::Max(-1, [Math]::Min(1, (($point.Y - $bounds.Y) / $bounds.Height) * 2 - 1))
  $leftDown = ([System.Windows.Forms.Control]::MouseButtons -band [System.Windows.Forms.MouseButtons]::Left) -ne 0
  $leftClicks = [int]($leftDown -and -not $leftWasDown)
  $leftWasDown = $leftDown
  @{x=$x; y=$y; display=$screen.DeviceName; leftClicks=$leftClicks} | ConvertTo-Json -Compress
  Start-Sleep -Milliseconds 33
}
