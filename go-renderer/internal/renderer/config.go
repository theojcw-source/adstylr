package renderer

type Config struct {
	Input     string    `json:"input"`
	OutputDir string    `json:"outputDir"`
	Prefix    string    `json:"prefix"`
	Variants  []Variant `json:"variants"`
}

type Variant struct {
	ID          string       `json:"id"`
	Width       int          `json:"width"`
	Height      int          `json:"height"`
	Fit         string       `json:"fit"`
	Format      string       `json:"format"`
	Quality     int          `json:"quality"`
	Background  string       `json:"background"`
	Gradient    *Gradient    `json:"gradient"`
	ColorBlocks []ColorBlock `json:"colorBlocks"`
	Overlays    []Overlay    `json:"overlays"`
}

type Gradient struct {
	Top           string  `json:"top"`
	TopOpacity    float64 `json:"topOpacity"`
	Bottom        string  `json:"bottom"`
	BottomOpacity float64 `json:"bottomOpacity"`
}

type ColorBlock struct {
	Color   string  `json:"color"`
	Opacity float64 `json:"opacity"`
	X       int     `json:"x"`
	Y       int     `json:"y"`
	Width   int     `json:"width"`
	Height  int     `json:"height"`
}

type Overlay struct {
	Path    string  `json:"path"`
	Opacity float64 `json:"opacity"`
	X       int     `json:"x"`
	Y       int     `json:"y"`
	Width   int     `json:"width"`
	Height  int     `json:"height"`
}

type Result struct {
	Files []RenderedFile `json:"files"`
}

type RenderedFile struct {
	ID     string `json:"id"`
	Path   string `json:"path"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Format string `json:"format"`
}
