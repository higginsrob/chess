#!/usr/bin/env bash
# Download the 2K Poly Haven packs used by the scene.
# CC0 — see README credits. Do not ingest 8K.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

mkdir -p public/assets/chess_set/textures public/assets/worn_concrete_floor

chess() {
  curl -fsSL -o "public/assets/chess_set/$2" "$1"
}

tex() {
  curl -fsSL -o "public/assets/chess_set/textures/$2" "$1"
}

floor() {
  curl -fsSL -o "public/assets/worn_concrete_floor/$2" "$1"
}

echo "chess set glTF…"
chess "https://dl.polyhaven.org/file/ph-assets/Models/gltf/2k/chess_set/chess_set_2k.gltf" chess_set_2k.gltf
chess "https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/chess_set/chess_set.bin" chess_set.bin
tex "https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/chess_set/chess_set_pieces_black_arm_2k.jpg" chess_set_pieces_black_arm_2k.jpg
tex "https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/chess_set/chess_set_board_nor_gl_2k.jpg" chess_set_board_nor_gl_2k.jpg
tex "https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/chess_set/chess_set_pieces_white_arm_2k.jpg" chess_set_pieces_white_arm_2k.jpg
tex "https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/chess_set/chess_set_pieces_white_diff_2k.jpg" chess_set_pieces_white_diff_2k.jpg
tex "https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/chess_set/chess_set_pieces_black_nor_gl_2k.jpg" chess_set_pieces_black_nor_gl_2k.jpg
tex "https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/chess_set/chess_set_board_diff_2k.jpg" chess_set_board_diff_2k.jpg
tex "https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/chess_set/chess_set_pieces_white_nor_gl_2k.jpg" chess_set_pieces_white_nor_gl_2k.jpg
tex "https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/chess_set/chess_set_board_arm_2k.jpg" chess_set_board_arm_2k.jpg
tex "https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/chess_set/chess_set_pieces_black_diff_2k.jpg" chess_set_pieces_black_diff_2k.jpg

echo "worn concrete floor…"
floor "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/worn_concrete_floor/worn_concrete_floor_diff_2k.jpg" worn_concrete_floor_diff_2k.jpg
floor "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/worn_concrete_floor/worn_concrete_floor_nor_gl_2k.jpg" worn_concrete_floor_nor_gl_2k.jpg
floor "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/worn_concrete_floor/worn_concrete_floor_arm_2k.jpg" worn_concrete_floor_arm_2k.jpg

echo "done."
