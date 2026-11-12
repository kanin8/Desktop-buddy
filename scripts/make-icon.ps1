# Generates the app icon (icon.png + icon.ico) from the frog's idle sprite sheet.
# Re-run this after the frog art changes: powershell -File scripts/make-icon.ps1

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$spriteSheetPath = Join-Path $projectRoot 'avatar\idle.png'
$pngOutputPath = Join-Path $projectRoot 'icon.png'
$icoOutputPath = Join-Path $projectRoot 'icon.ico'

# Only the head is used: the big eyes are what make the frog recognisable, and
# the full standing body turns into a thin green smudge at 16-32px.
# Measured on the first 392x616 frame of idle.png (top-left cell of the sheet).
$headCrop = [System.Drawing.Rectangle]::new(8, 0, 376, 260)

# Empty margin around the head, as a fraction of the icon size, so the icon
# doesn't touch the edges of taskbar and Start Menu tiles.
$paddingRatio = 0.06

# Sizes Windows picks from for Start Menu, search results, taskbar and tray.
$iconSizes = @(16, 24, 32, 48, 64, 128, 256)

# Draws the cropped head centred on a transparent square of the given size.
# Returns the rendered bitmap; the caller disposes it.
function New-IconBitmap([System.Drawing.Image]$sheet, [int]$size) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $available = $size * (1 - 2 * $paddingRatio)
  $scale = [Math]::Min($available / $headCrop.Width, $available / $headCrop.Height)
  $drawWidth = $headCrop.Width * $scale
  $drawHeight = $headCrop.Height * $scale
  $target = [System.Drawing.RectangleF]::new(($size - $drawWidth) / 2, ($size - $drawHeight) / 2, $drawWidth, $drawHeight)
  $graphics.DrawImage($sheet, $target, [System.Drawing.RectangleF]$headCrop, [System.Drawing.GraphicsUnit]::Pixel)
  $graphics.Dispose()
  return $bitmap
}

function ConvertTo-PngBytes([System.Drawing.Bitmap]$bitmap) {
  $stream = [System.IO.MemoryStream]::new()
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  return ,$stream.ToArray()
}

# Encodes a bitmap as a classic .ico entry: a 32-bit BGRA bitmap stored
# bottom-up, then a 1-bit AND mask. Small sizes use this format because some
# Windows code paths (and .NET's Icon class) can't read PNG data below 256px.
function ConvertTo-IcoBitmapBytes([System.Drawing.Bitmap]$bitmap) {
  $size = $bitmap.Width
  $maskRowBytes = [int]([Math]::Ceiling($size / 32) * 4)
  $stream = [System.IO.MemoryStream]::new()
  $writer = [System.IO.BinaryWriter]::new($stream)

  # BITMAPINFOHEADER; the height is doubled because it covers colour + mask.
  $writer.Write([UInt32]40)
  $writer.Write([Int32]$size)
  $writer.Write([Int32]($size * 2))
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]0)
  $writer.Write([UInt32]($size * $size * 4 + $maskRowBytes * $size))
  $writer.Write([Int32]0)
  $writer.Write([Int32]0)
  $writer.Write([UInt32]0)
  $writer.Write([UInt32]0)

  for ($y = $size - 1; $y -ge 0; $y--) {
    for ($x = 0; $x -lt $size; $x++) {
      $pixel = $bitmap.GetPixel($x, $y)
      $writer.Write([byte]$pixel.B)
      $writer.Write([byte]$pixel.G)
      $writer.Write([byte]$pixel.R)
      $writer.Write([byte]$pixel.A)
    }
  }
  # The alpha channel already carries transparency, so the mask stays all zero.
  $writer.Write([byte[]]::new($maskRowBytes * $size))

  $writer.Flush()
  return ,$stream.ToArray()
}

# Packs the encoded entries into one .ico file, smallest size first.
function Write-IcoFile([string]$path, [int[]]$sizes, [byte[][]]$entryImages) {
  $writer = [System.IO.BinaryWriter]::new([System.IO.File]::Create($path))
  $writer.Write([UInt16]0)                # reserved
  $writer.Write([UInt16]1)                # type: icon
  $writer.Write([UInt16]$sizes.Count)

  $dataOffset = 6 + 16 * $sizes.Count
  for ($i = 0; $i -lt $sizes.Count; $i++) {
    $sizeByte = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }  # 0 means 256
    $writer.Write([byte]$sizeByte)        # width
    $writer.Write([byte]$sizeByte)        # height
    $writer.Write([byte]0)                # palette colours
    $writer.Write([byte]0)                # reserved
    $writer.Write([UInt16]1)              # colour planes
    $writer.Write([UInt16]32)             # bits per pixel
    $writer.Write([UInt32]$entryImages[$i].Length)
    $writer.Write([UInt32]$dataOffset)
    $dataOffset += $entryImages[$i].Length
  }
  foreach ($entry in $entryImages) { $writer.Write($entry) }
  $writer.Close()
}

$sheet = [System.Drawing.Image]::FromFile($spriteSheetPath)
$entryImages = foreach ($size in $iconSizes) {
  $bitmap = New-IconBitmap $sheet $size
  if ($size -ge 256) {
    # PNG keeps the largest entry small; Windows reads PNG at this size.
    [System.IO.File]::WriteAllBytes($pngOutputPath, (ConvertTo-PngBytes $bitmap))
    ,(ConvertTo-PngBytes $bitmap)
  } else {
    ,(ConvertTo-IcoBitmapBytes $bitmap)
  }
  $bitmap.Dispose()
}
$sheet.Dispose()

Write-IcoFile $icoOutputPath $iconSizes $entryImages
Write-Host "Wrote $pngOutputPath and $icoOutputPath"
