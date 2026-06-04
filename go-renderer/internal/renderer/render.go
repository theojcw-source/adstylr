package renderer

import (
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	defaultWidth   = 1080
	defaultHeight  = 1920
	defaultQuality = 92
)

func Render(config Config, baseDir string) (Result, error) {
	if config.Input == "" {
		return Result{}, fmt.Errorf("input is required")
	}
	if config.OutputDir == "" {
		return Result{}, fmt.Errorf("outputDir is required")
	}
	if len(config.Variants) == 0 {
		return Result{}, fmt.Errorf("at least one variant is required")
	}

	source, err := loadImage(resolvePath(baseDir, config.Input))
	if err != nil {
		return Result{}, fmt.Errorf("load input: %w", err)
	}

	outputDir := resolvePath(baseDir, config.OutputDir)
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return Result{}, fmt.Errorf("create output dir: %w", err)
	}

	result := Result{Files: make([]RenderedFile, 0, len(config.Variants))}
	for _, variant := range config.Variants {
		rendered, err := renderVariant(source, variant, baseDir)
		if err != nil {
			return Result{}, fmt.Errorf("variant %q: %w", variant.ID, err)
		}

		format := normalizeFormat(variant.Format)
		outputPath := filepath.Join(outputDir, fmt.Sprintf("%s-%s.%s", config.Prefix, safeName(variant.ID), format))
		if err := saveImage(outputPath, rendered, format, variant.Quality); err != nil {
			return Result{}, fmt.Errorf("save %q: %w", outputPath, err)
		}

		result.Files = append(result.Files, RenderedFile{
			ID:     variant.ID,
			Path:   outputPath,
			Width:  rendered.Bounds().Dx(),
			Height: rendered.Bounds().Dy(),
			Format: format,
		})
	}

	return result, nil
}

func renderVariant(source image.Image, variant Variant, baseDir string) (*image.RGBA, error) {
	width := variant.Width
	if width <= 0 {
		width = defaultWidth
	}
	height := variant.Height
	if height <= 0 {
		height = defaultHeight
	}

	background := parseHexColor(variant.Background, color.RGBA{0, 0, 0, 255})
	canvas := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{background}, image.Point{}, draw.Src)

	placed := resizeToFit(source, width, height, variant.Fit)
	placedBounds := placed.Bounds()
	x := (width - placedBounds.Dx()) / 2
	y := (height - placedBounds.Dy()) / 2
	draw.Draw(canvas, image.Rect(x, y, x+placedBounds.Dx(), y+placedBounds.Dy()), placed, placedBounds.Min, draw.Over)

	if variant.Gradient != nil {
		applyGradient(canvas, *variant.Gradient)
	}

	for _, block := range variant.ColorBlocks {
		drawColorBlock(canvas, block)
	}

	for _, overlay := range variant.Overlays {
		if err := drawOverlay(canvas, overlay, baseDir); err != nil {
			return nil, err
		}
	}

	return canvas, nil
}

func loadImage(path string) (image.Image, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	img, _, err := image.Decode(file)
	return img, err
}

func saveImage(path string, img image.Image, format string, quality int) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	switch format {
	case "jpg", "jpeg":
		if quality <= 0 {
			quality = defaultQuality
		}
		return jpeg.Encode(file, img, &jpeg.Options{Quality: quality})
	default:
		return png.Encode(file, img)
	}
}

func resizeToFit(src image.Image, targetW, targetH int, fit string) *image.RGBA {
	bounds := src.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()
	if srcW == 0 || srcH == 0 {
		return image.NewRGBA(image.Rect(0, 0, targetW, targetH))
	}

	scaleX := float64(targetW) / float64(srcW)
	scaleY := float64(targetH) / float64(srcH)
	scale := math.Max(scaleX, scaleY)
	if fit == "contain" {
		scale = math.Min(scaleX, scaleY)
	}

	outW := max(1, int(math.Round(float64(srcW)*scale)))
	outH := max(1, int(math.Round(float64(srcH)*scale)))
	return resizeBilinear(src, outW, outH)
}

func resizeBilinear(src image.Image, width, height int) *image.RGBA {
	dst := image.NewRGBA(image.Rect(0, 0, width, height))
	bounds := src.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()

	for y := 0; y < height; y++ {
		sy := (float64(y)+0.5)*float64(srcH)/float64(height) - 0.5
		y0 := clampInt(int(math.Floor(sy)), 0, srcH-1)
		y1 := clampInt(y0+1, 0, srcH-1)
		wy := sy - math.Floor(sy)

		for x := 0; x < width; x++ {
			sx := (float64(x)+0.5)*float64(srcW)/float64(width) - 0.5
			x0 := clampInt(int(math.Floor(sx)), 0, srcW-1)
			x1 := clampInt(x0+1, 0, srcW-1)
			wx := sx - math.Floor(sx)

			c00 := rgbaAt(src, bounds.Min.X+x0, bounds.Min.Y+y0)
			c10 := rgbaAt(src, bounds.Min.X+x1, bounds.Min.Y+y0)
			c01 := rgbaAt(src, bounds.Min.X+x0, bounds.Min.Y+y1)
			c11 := rgbaAt(src, bounds.Min.X+x1, bounds.Min.Y+y1)

			dst.SetRGBA(x, y, bilinear(c00, c10, c01, c11, wx, wy))
		}
	}

	return dst
}

func rgbaAt(img image.Image, x, y int) color.RGBA {
	r, g, b, a := img.At(x, y).RGBA()
	return color.RGBA{uint8(r >> 8), uint8(g >> 8), uint8(b >> 8), uint8(a >> 8)}
}

func bilinear(c00, c10, c01, c11 color.RGBA, wx, wy float64) color.RGBA {
	return color.RGBA{
		R: interpolateChannel(c00.R, c10.R, c01.R, c11.R, wx, wy),
		G: interpolateChannel(c00.G, c10.G, c01.G, c11.G, wx, wy),
		B: interpolateChannel(c00.B, c10.B, c01.B, c11.B, wx, wy),
		A: interpolateChannel(c00.A, c10.A, c01.A, c11.A, wx, wy),
	}
}

func interpolateChannel(c00, c10, c01, c11 uint8, wx, wy float64) uint8 {
	top := float64(c00)*(1-wx) + float64(c10)*wx
	bottom := float64(c01)*(1-wx) + float64(c11)*wx
	return uint8(math.Round(top*(1-wy) + bottom*wy))
}

func applyGradient(img *image.RGBA, gradient Gradient) {
	bounds := img.Bounds()
	topColor := parseHexColor(gradient.Top, color.RGBA{0, 0, 0, 255})
	bottomColor := parseHexColor(gradient.Bottom, color.RGBA{0, 0, 0, 255})
	topOpacity := clampFloat(gradient.TopOpacity, 0, 1)
	bottomOpacity := clampFloat(gradient.BottomOpacity, 0, 1)

	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		t := float64(y-bounds.Min.Y) / float64(max(1, bounds.Dy()-1))
		c := color.RGBA{
			R: uint8(math.Round(float64(topColor.R)*(1-t) + float64(bottomColor.R)*t)),
			G: uint8(math.Round(float64(topColor.G)*(1-t) + float64(bottomColor.G)*t)),
			B: uint8(math.Round(float64(topColor.B)*(1-t) + float64(bottomColor.B)*t)),
			A: 255,
		}
		opacity := topOpacity*(1-t) + bottomOpacity*t
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			blendPixel(img, x, y, c, opacity)
		}
	}
}

func drawColorBlock(img *image.RGBA, block ColorBlock) {
	if block.Width <= 0 || block.Height <= 0 {
		return
	}

	c := parseHexColor(block.Color, color.RGBA{255, 255, 255, 255})
	opacity := clampFloat(block.Opacity, 0, 1)
	if block.Opacity == 0 {
		opacity = 1
	}
	rect := image.Rect(block.X, block.Y, block.X+block.Width, block.Y+block.Height).Intersect(img.Bounds())
	for y := rect.Min.Y; y < rect.Max.Y; y++ {
		for x := rect.Min.X; x < rect.Max.X; x++ {
			blendPixel(img, x, y, c, opacity)
		}
	}
}

func drawOverlay(canvas *image.RGBA, overlay Overlay, baseDir string) error {
	if overlay.Path == "" {
		return nil
	}

	img, err := loadImage(resolvePath(baseDir, overlay.Path))
	if err != nil {
		return fmt.Errorf("load overlay %q: %w", overlay.Path, err)
	}

	width := overlay.Width
	height := overlay.Height
	if width <= 0 || height <= 0 {
		bounds := img.Bounds()
		width = bounds.Dx()
		height = bounds.Dy()
	}

	resized := resizeBilinear(img, width, height)
	opacity := clampFloat(overlay.Opacity, 0, 1)
	if overlay.Opacity == 0 {
		opacity = 1
	}

	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			targetX := overlay.X + x
			targetY := overlay.Y + y
			if !image.Pt(targetX, targetY).In(canvas.Bounds()) {
				continue
			}
			src := resized.RGBAAt(x, y)
			alpha := float64(src.A) / 255 * opacity
			blendPixel(canvas, targetX, targetY, src, alpha)
		}
	}

	return nil
}

func blendPixel(img *image.RGBA, x, y int, src color.RGBA, alpha float64) {
	alpha = clampFloat(alpha, 0, 1)
	if alpha <= 0 {
		return
	}

	dst := img.RGBAAt(x, y)
	img.SetRGBA(x, y, color.RGBA{
		R: uint8(math.Round(float64(src.R)*alpha + float64(dst.R)*(1-alpha))),
		G: uint8(math.Round(float64(src.G)*alpha + float64(dst.G)*(1-alpha))),
		B: uint8(math.Round(float64(src.B)*alpha + float64(dst.B)*(1-alpha))),
		A: 255,
	})
}

func parseHexColor(value string, fallback color.RGBA) color.RGBA {
	value = strings.TrimPrefix(strings.TrimSpace(value), "#")
	if len(value) != 6 {
		return fallback
	}

	parsed, err := strconv.ParseUint(value, 16, 32)
	if err != nil {
		return fallback
	}
	return color.RGBA{
		R: uint8(parsed >> 16),
		G: uint8(parsed >> 8),
		B: uint8(parsed),
		A: 255,
	}
}

func normalizeFormat(format string) string {
	switch strings.ToLower(format) {
	case "jpg", "jpeg":
		return "jpg"
	default:
		return "png"
	}
}

func resolvePath(baseDir, path string) string {
	if filepath.IsAbs(path) {
		return path
	}
	return filepath.Clean(filepath.Join(baseDir, path))
}

func safeName(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return "variant"
	}

	var builder strings.Builder
	for _, r := range value {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-' || r == '_' {
			builder.WriteRune(r)
			continue
		}
		builder.WriteByte('-')
	}

	name := strings.Trim(builder.String(), "-")
	if name == "" {
		return "variant"
	}
	return name
}

func clampInt(value, minValue, maxValue int) int {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func clampFloat(value, minValue, maxValue float64) float64 {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
