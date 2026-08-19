Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $repoRoot 'src/assets/processed/weapons'
$minigunSource = Join-Path $repoRoot 'src/assets/downloaded/weapons/tiamalt-minigun/original/idlemingun/minigun_icon_00000.png'
$m249Source = Join-Path $repoRoot 'src/assets/downloaded/characters/kenney-topdown-shooter/PNG/weapon_machine.png'
$flamethrowerSource = Join-Path $repoRoot 'src/assets/downloaded/weapons/thejosh-flamethrower/flamethrower_0.png'

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

function New-WeaponCanvas {
  return [System.Drawing.Bitmap]::new(132, 48, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
}

function New-Brush([string]$color) {
  return [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($color))
}

function New-Pen([string]$color, [float]$width = 1) {
  return [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($color), $width)
}

function Save-Weapon([System.Drawing.Bitmap]$bitmap, [string]$name) {
  $target = Join-Path $outputDir $name
  $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  Write-Output "$name`: 132x48"
}

function Draw-Gatling {
  $bitmap = New-WeaponCanvas
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $outline = New-Pen '#111217' 3
  $metal = New-Pen '#79818a' 1
  $dark = New-Brush '#20242b'
  $mid = New-Brush '#434a54'
  $accent = New-Brush '#a63d2f'

  $stock = [System.Drawing.Point[]]@(
    [System.Drawing.Point]::new(2, 20), [System.Drawing.Point]::new(23, 14),
    [System.Drawing.Point]::new(31, 19), [System.Drawing.Point]::new(29, 34),
    [System.Drawing.Point]::new(7, 37), [System.Drawing.Point]::new(2, 32)
  )
  $graphics.FillPolygon($dark, $stock)
  $graphics.DrawPolygon($outline, $stock)
  $graphics.FillRectangle($mid, 25, 13, 37, 24)
  $graphics.DrawRectangle($outline, 25, 13, 37, 24)
  $graphics.FillRectangle($accent, 31, 17, 20, 5)
  $graphics.FillRectangle($dark, 32, 34, 25, 11)
  $graphics.DrawRectangle($outline, 32, 34, 25, 11)
  $graphics.DrawLine($outline, 35, 13, 42, 5)
  $graphics.DrawLine($outline, 42, 5, 58, 5)
  $graphics.DrawLine($outline, 58, 5, 62, 13)

  foreach ($y in @(14, 18, 22, 26, 30, 34)) {
    $graphics.DrawLine($outline, 58, $y, 121, $y)
    $graphics.DrawLine($metal, 59, $y, 120, $y)
  }
  $graphics.FillRectangle($dark, 57, 10, 9, 29)
  $graphics.DrawRectangle($outline, 57, 10, 9, 29)
  $graphics.FillRectangle($mid, 117, 9, 11, 31)
  $graphics.DrawRectangle($outline, 117, 9, 11, 31)

  $source = [System.Drawing.Bitmap]::new($minigunSource)
  $sourceRect = [System.Drawing.Rectangle]::new(10, 14, 44, 44)
  $graphics.DrawImage($source, [System.Drawing.Rectangle]::new(108, 10, 25, 28), $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
  $source.Dispose()

  $outline.Dispose(); $metal.Dispose(); $dark.Dispose(); $mid.Dispose(); $accent.Dispose()
  $graphics.Dispose()
  Save-Weapon $bitmap 'gatling.png'
}

function Draw-GoldenM249 {
  $source = [System.Drawing.Bitmap]::new($m249Source)
  for ($y = 0; $y -lt $source.Height; $y++) {
    for ($x = 0; $x -lt $source.Width; $x++) {
      $pixel = $source.GetPixel($x, $y)
      if ($pixel.A -eq 0) { continue }
      $luma = [Math]::Max(0.18, ($pixel.R + $pixel.G + $pixel.B) / 765.0)
      $red = [Math]::Min(255, [int](176 + 72 * $luma))
      $green = [Math]::Min(230, [int](112 + 92 * $luma))
      $blue = [Math]::Min(120, [int](25 + 46 * $luma))
      $source.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($pixel.A, $red, $green, $blue))
    }
  }

  $bitmap = New-WeaponCanvas
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.DrawImage($source, [System.Drawing.Rectangle]::new(5, 6, 119, 36))

  $outline = New-Pen '#2b1b08' 3
  $goldDark = New-Brush '#8f580f'
  $gold = New-Brush '#d8a62f'
  $box = [System.Drawing.Point[]]@(
    [System.Drawing.Point]::new(49, 25), [System.Drawing.Point]::new(70, 25),
    [System.Drawing.Point]::new(68, 43), [System.Drawing.Point]::new(51, 43)
  )
  $graphics.FillPolygon($goldDark, $box)
  $graphics.DrawPolygon($outline, $box)
  $graphics.FillRectangle($gold, 53, 29, 12, 4)
  $graphics.DrawLine($outline, 91, 30, 99, 45)
  $graphics.DrawLine($outline, 99, 45, 105, 45)

  $source.Dispose(); $outline.Dispose(); $goldDark.Dispose(); $gold.Dispose()
  $graphics.Dispose()
  Save-Weapon $bitmap 'golden_m249.png'
}

function Draw-Flamethrower {
  # The downloaded CC0 texture is deliberately sampled so the generated sprite
  # keeps the source model's steel-and-petrol palette without shipping a 3D render.
  $texture = [System.Drawing.Bitmap]::new($flamethrowerSource)
  $steelSample = $texture.GetPixel(570, 210)
  $tankSample = $texture.GetPixel(1710, 840)

  $bitmap = New-WeaponCanvas
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $outline = New-Pen '#111217' 3
  $hose = New-Pen '#20242b' 3
  $steel = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, $steelSample.R, $steelSample.G, $steelSample.B))
  $tank = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, $tankSample.R, $tankSample.G, [Math]::Max(45, $tankSample.B)))
  $dark = New-Brush '#252a31'
  $heat = New-Brush '#c65b24'
  $warning = New-Brush '#f2c94c'

  $graphics.FillRectangle($dark, 3, 20, 22, 16)
  $graphics.DrawRectangle($outline, 3, 20, 22, 16)
  $graphics.FillEllipse($tank, 19, 9, 37, 34)
  $graphics.DrawEllipse($outline, 19, 9, 37, 34)
  $graphics.FillRectangle($steel, 49, 15, 39, 20)
  $graphics.DrawRectangle($outline, 49, 15, 39, 20)
  $graphics.FillRectangle($heat, 82, 18, 38, 13)
  $graphics.DrawRectangle($outline, 82, 18, 38, 13)
  $graphics.FillRectangle($steel, 117, 21, 13, 7)
  $graphics.DrawRectangle($outline, 117, 21, 13, 7)
  $graphics.FillPolygon($warning, [System.Drawing.Point[]]@(
    [System.Drawing.Point]::new(34, 15), [System.Drawing.Point]::new(44, 32), [System.Drawing.Point]::new(24, 32)
  ))
  $graphics.DrawLine($hose, 33, 40, 63, 46)
  $graphics.DrawLine($hose, 63, 46, 73, 35)
  $graphics.FillRectangle($dark, 60, 32, 12, 12)
  $graphics.DrawRectangle($outline, 60, 32, 12, 12)

  $texture.Dispose(); $outline.Dispose(); $hose.Dispose(); $steel.Dispose(); $tank.Dispose()
  $dark.Dispose(); $heat.Dispose(); $warning.Dispose(); $graphics.Dispose()
  Save-Weapon $bitmap 'flamethrower.png'
}

Draw-Gatling
Draw-GoldenM249
Draw-Flamethrower
