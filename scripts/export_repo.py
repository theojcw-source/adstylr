#!/usr/bin/env python3
"""
Export repository source files into a single text file for AI review.

Defaults are intentionally conservative:
- excludes secrets, lockfiles, generated folders, docs, binaries and exports
- includes source/config files useful for auditing a Next.js/TypeScript app
- writes export.txt at the repository root
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "export.txt"
MAX_FILE_BYTES = 512 * 1024

SKIP_DIRS = {
    ".branches",
    ".claude",
    ".continue",
    ".git",
    ".next",
    ".temp",
    ".turbo",
    ".vercel",
    ".yalc",
    "build",
    "coverage",
    "dist",
    "exports",
    "node_modules",
    "out",
    "playwright-report",
    "test-results",
}

CODE_EXTENSIONS = {
    ".cjs",
    ".css",
    ".html",
    ".js",
    ".jsx",
    ".mjs",
    ".mts",
    ".cts",
    ".py",
    ".sh",
    ".sql",
    ".toml",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
}

SKIP_FILENAMES = {
    ".DS_Store",
    "bun.lock",
    "bun.lockb",
    "deno.lock",
    "export.txt",
    "export_repo.txt",
    "exportkanban.txt",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "yalc.lock",
    "yalc.sig",
}

SKIP_EXTENSIONS = {
    ".avif",
    ".gif",
    ".gz",
    ".ico",
    ".jpeg",
    ".jpg",
    ".lock",
    ".md",
    ".mp4",
    ".png",
    ".sig",
    ".svg",
    ".tar",
    ".txt",
    ".wasm",
    ".webm",
    ".webp",
    ".zip",
}

JSON_WHITELIST = {
    "components.json",
    "package.json",
    "tsconfig.json",
    "tsconfig.typecheck.json",
    "vercel.json",
    "vitest.config.json",
}

SECRET_NAME_PARTS = {
    "credential",
    "credentials",
    "secret",
    "secrets",
    "token",
}


def is_probably_binary(path: Path) -> bool:
    try:
        chunk = path.read_bytes()[:2048]
    except OSError:
        return True
    return b"\0" in chunk


def should_include(path: Path, relative_path: Path, output_path: Path) -> bool:
    filename = path.name
    suffix = path.suffix.lower()
    lower_name = filename.lower()

    if path == output_path:
        return False
    if filename in SKIP_FILENAMES:
        return False
    if lower_name.startswith(".env"):
        return False
    if any(part in lower_name for part in SECRET_NAME_PARTS):
        return False
    if suffix in SKIP_EXTENSIONS:
        return False
    if suffix == ".json":
        return filename in JSON_WHITELIST
    if suffix not in CODE_EXTENSIONS:
        return False
    if path.stat().st_size > MAX_FILE_BYTES:
        return False
    if is_probably_binary(path):
        return False

    return not any(part.startswith(".") for part in relative_path.parts[:-1])


def collect_files(output_path: Path) -> list[tuple[Path, Path]]:
    files: list[tuple[Path, Path]] = []

    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [
            dirname
            for dirname in dirnames
            if dirname not in SKIP_DIRS and not dirname.startswith(".")
        ]

        for filename in filenames:
            full_path = Path(dirpath) / filename
            relative_path = full_path.relative_to(ROOT)

            if should_include(full_path, relative_path, output_path):
                files.append((relative_path, full_path))

    return sorted(files, key=lambda item: item[0].as_posix())


def write_export(output_path: Path) -> tuple[int, int, int]:
    files = collect_files(output_path)
    total_lines = 0

    with output_path.open("w", encoding="utf-8") as output:
        output.write("# StyleForge — AI code export\n")
        output.write(f"# Root: {ROOT}\n")
        output.write(f"# Files: {len(files)}\n\n")

        for relative_path, full_path in files:
            output.write("=" * 80 + "\n")
            output.write(f"FILE: {relative_path.as_posix()}\n")
            output.write("=" * 80 + "\n")

            try:
                content = full_path.read_text(encoding="utf-8", errors="replace")
            except OSError as error:
                content = f"[ERROR reading file: {error}]\n"

            output.write(content)
            total_lines += content.count("\n")

            if not content.endswith("\n"):
                output.write("\n")

            output.write("\n")

    size_kb = output_path.stat().st_size // 1024
    return len(files), total_lines, size_kb


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export repo source code for AI audit.")
    parser.add_argument(
        "-o",
        "--output",
        default=str(DEFAULT_OUTPUT),
        help="Output file path. Defaults to export.txt at the repo root.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_path = Path(args.output).expanduser().resolve()

    files_count, total_lines, size_kb = write_export(output_path)
    print(f"{output_path.name} — {files_count} files · {total_lines:,} lines · {size_kb} KB")


if __name__ == "__main__":
    main()
