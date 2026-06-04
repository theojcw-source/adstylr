package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"styleforge/go-renderer/internal/renderer"
)

func main() {
	configPath := flag.String("config", "", "Path to a render config JSON file.")
	inputPath := flag.String("input", "", "Source image path. Overrides config input.")
	outputDir := flag.String("out", "", "Output directory. Overrides config outputDir.")
	prefix := flag.String("prefix", "", "Output filename prefix. Defaults to styleforge-render-<timestamp>.")
	flag.Parse()

	if *configPath == "" {
		fmt.Fprintln(os.Stderr, "missing required -config")
		os.Exit(2)
	}

	config, err := readConfig(*configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read config: %v\n", err)
		os.Exit(1)
	}

	if *inputPath != "" {
		config.Input = mustAbs("input", *inputPath)
	}
	if *outputDir != "" {
		config.OutputDir = mustAbs("out", *outputDir)
	}
	if *prefix != "" {
		config.Prefix = *prefix
	}
	if config.Prefix == "" {
		config.Prefix = fmt.Sprintf("styleforge-render-%d", time.Now().UnixMilli())
	}

	absConfigPath, err := filepath.Abs(*configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "resolve config path: %v\n", err)
		os.Exit(1)
	}

	result, err := renderer.Render(config, filepath.Dir(absConfigPath))
	if err != nil {
		fmt.Fprintf(os.Stderr, "render: %v\n", err)
		os.Exit(1)
	}

	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		fmt.Fprintf(os.Stderr, "write result: %v\n", err)
		os.Exit(1)
	}
}

func readConfig(path string) (renderer.Config, error) {
	file, err := os.Open(path)
	if err != nil {
		return renderer.Config{}, err
	}
	defer file.Close()

	var config renderer.Config
	if err := json.NewDecoder(file).Decode(&config); err != nil {
		return renderer.Config{}, err
	}

	return config, nil
}

func mustAbs(name string, path string) string {
	absPath, err := filepath.Abs(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "resolve %s path: %v\n", name, err)
		os.Exit(1)
	}
	return absPath
}
