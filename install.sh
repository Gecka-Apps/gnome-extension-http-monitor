#!/bin/bash

# Install script for HTTP Monitor extension

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID="http-monitor@gecka.nc"
INSTALL_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "Installing HTTP Monitor extension..."

# Build first
echo "Running build..."
make -C "$SCRIPT_DIR" build

# Install
echo "Installing to $INSTALL_DIR..."
gnome-extensions install -f "$SCRIPT_DIR/build/$UUID.shell-extension.zip"

echo "✓ Installation completed successfully"
echo ""
echo "To enable the extension, run:"
echo "  gnome-extensions enable $UUID"
echo ""
echo "To restart GNOME Shell:"
echo "  - X11: Press Alt+F2, type 'r', press Enter"
echo "  - Wayland: Log out and log back in"
