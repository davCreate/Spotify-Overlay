# Reads what the Spotify desktop app is playing from Windows' media controls (SMTC) and prints
# one compact JSON line per second on stdout. Used by windows-media.js; needs no Spotify Web API
# call, so it is never rate limited. Album art is sent (as base64) only when the track changes.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($op, [Type]$type) {
  $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $null = $task.Wait(-1)
  $task.Result
}

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]

$null = [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))

$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

function Read-Art($props) {
  try {
    if (-not $props.Thumbnail) { return $null }
    $ras = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    # PowerShell sees the stream as a bare COM object, so call AsStreamForRead through reflection
    # (the runtime then finds the IInputStream interface itself).
    $stream = $asStreamForRead.Invoke($null, @($ras))
    $ms = New-Object System.IO.MemoryStream
    $stream.CopyTo($ms)
    $stream.Dispose()
    $bytes = $ms.ToArray()
    if ($bytes.Length -lt 4) { return $null }
    $type = 'image/jpeg'
    if ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50) { $type = 'image/png' }
    elseif ($bytes[0] -eq 0x47 -and $bytes[1] -eq 0x49) { $type = 'image/gif' }
    elseif ($bytes[0] -eq 0x42 -and $bytes[1] -eq 0x4D) { $type = 'image/bmp' }
    return "data:$type;base64," + [Convert]::ToBase64String($bytes)
  } catch { return $null }
}

$lastKey = $null
while ($true) {
  $out = @{ found = $false }
  try {
    $session = $manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -like '*Spotify*' } | Select-Object -First 1
    if ($session) {
      $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $timeline = $session.GetTimelineProperties()
      $playing = $session.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing'
      $position = $timeline.Position.TotalMilliseconds
      if ($playing -and $timeline.LastUpdatedTime.Year -gt 2000) {
        $position += ([DateTimeOffset]::Now - $timeline.LastUpdatedTime).TotalMilliseconds
      }
      $duration = ($timeline.EndTime - $timeline.StartTime).TotalMilliseconds
      if ($duration -gt 0) { $position = [Math]::Min($position, $duration) }
      $key = "$($props.Title)|$($props.Artist)|$($props.AlbumTitle)"
      $out = @{
        found = $true
        title = $props.Title
        artist = $props.Artist
        album = $props.AlbumTitle
        playing = $playing
        positionMs = [Math]::Max(0, [Math]::Round($position))
        durationMs = [Math]::Max(0, [Math]::Round($duration))
      }
      if ($key -ne $lastKey -and $props.Title) {
        $out.art = Read-Art $props
        $lastKey = $key
      }
    }
  } catch {
    $out = @{ found = $false; error = $_.Exception.Message }
  }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 1000
}
