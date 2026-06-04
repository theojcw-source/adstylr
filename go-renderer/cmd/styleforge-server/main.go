package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"styleforge/go-renderer/internal/renderer"
)

const maxDownloadBytes = 40 << 20
const maxRequestBytes = 64 << 20

type renderRequest struct {
	renderer.Config
	InputDataBase64 string `json:"inputDataBase64"`
	InputFormat     string `json:"inputFormat"`
}

type renderResponse struct {
	Files []renderedFile `json:"files"`
}

type renderedFile struct {
	ID          string `json:"id"`
	Width       int    `json:"width"`
	Height      int    `json:"height"`
	Format      string `json:"format"`
	ContentType string `json:"contentType"`
	DataBase64  string `json:"dataBase64"`
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", healthHandler)
	mux.HandleFunc("/render", renderHandler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Printf("styleforge renderer listening on :%s", port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func renderHandler(w http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"message": "method not allowed"})
		return
	}

	request.Body = http.MaxBytesReader(w, request.Body, maxRequestBytes)
	defer request.Body.Close()

	var payload renderRequest
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "invalid JSON"})
		return
	}

	result, err := render(payload)
	if err != nil {
		log.Printf("render error: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"message": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func render(payload renderRequest) (renderResponse, error) {
	config := payload.Config
	workDir, err := os.MkdirTemp("", "styleforge-render-*")
	if err != nil {
		return renderResponse{}, err
	}
	defer os.RemoveAll(workDir)

	if payload.InputDataBase64 != "" {
		inputPath := filepath.Join(workDir, "input"+extensionFromFormat(payload.InputFormat, ".png"))
		bytes, err := base64.StdEncoding.DecodeString(payload.InputDataBase64)
		if err != nil {
			return renderResponse{}, fmt.Errorf("decode inputDataBase64: %w", err)
		}
		if err := os.WriteFile(inputPath, bytes, 0o600); err != nil {
			return renderResponse{}, fmt.Errorf("write inputDataBase64: %w", err)
		}
		config.Input = inputPath
	} else if strings.HasPrefix(config.Input, "http://") || strings.HasPrefix(config.Input, "https://") {
		inputPath := filepath.Join(workDir, "input"+extensionFromURL(config.Input, ".png"))
		if err := downloadFile(config.Input, inputPath); err != nil {
			return renderResponse{}, fmt.Errorf("download input: %w", err)
		}
		config.Input = inputPath
	}

	for variantIndex := range config.Variants {
		for overlayIndex := range config.Variants[variantIndex].Overlays {
			overlay := &config.Variants[variantIndex].Overlays[overlayIndex]
			if !strings.HasPrefix(overlay.Path, "http://") && !strings.HasPrefix(overlay.Path, "https://") {
				continue
			}

			overlayPath := filepath.Join(
				workDir,
				fmt.Sprintf("overlay-%d-%d%s", variantIndex, overlayIndex, extensionFromURL(overlay.Path, ".png")),
			)
			if err := downloadFile(overlay.Path, overlayPath); err != nil {
				return renderResponse{}, fmt.Errorf("download overlay: %w", err)
			}
			overlay.Path = overlayPath
		}
	}

	config.OutputDir = filepath.Join(workDir, "out")
	if config.Prefix == "" {
		config.Prefix = fmt.Sprintf("styleforge-render-%d", time.Now().UnixMilli())
	}

	rendered, err := renderer.Render(config, workDir)
	if err != nil {
		return renderResponse{}, err
	}

	response := renderResponse{Files: make([]renderedFile, 0, len(rendered.Files))}
	for _, file := range rendered.Files {
		bytes, err := os.ReadFile(file.Path)
		if err != nil {
			return renderResponse{}, fmt.Errorf("read rendered file: %w", err)
		}

		response.Files = append(response.Files, renderedFile{
			ID:          file.ID,
			Width:       file.Width,
			Height:      file.Height,
			Format:      file.Format,
			ContentType: contentTypeForFormat(file.Format),
			DataBase64:  base64.StdEncoding.EncodeToString(bytes),
		})
	}

	return response, nil
}

func downloadFile(url string, destination string) error {
	client := &http.Client{Timeout: 45 * time.Second}
	response, err := client.Get(url)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("%s returned %d", url, response.StatusCode)
	}

	file, err := os.Create(destination)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = io.Copy(file, io.LimitReader(response.Body, maxDownloadBytes))
	return err
}

func extensionFromURL(value string, fallback string) string {
	path := strings.ToLower(strings.Split(value, "?")[0])
	ext := filepath.Ext(path)
	switch ext {
	case ".jpg", ".jpeg", ".png":
		return ext
	default:
		return fallback
	}
}

func extensionFromFormat(value string, fallback string) string {
	switch strings.ToLower(value) {
	case "jpg", "jpeg", "image/jpeg":
		return ".jpg"
	case "png", "image/png":
		return ".png"
	default:
		return fallback
	}
}

func contentTypeForFormat(format string) string {
	switch format {
	case "jpg", "jpeg":
		return "image/jpeg"
	default:
		return "image/png"
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("write json: %v", err)
	}
}
