#!/bin/bash

# Test script for HTTP Monitor extension
# Builds, installs, and launches a GNOME Shell devkit session for testing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Testing HTTP Monitor extension..."

# Build and install
make -C "$SCRIPT_DIR" install

echo ""
echo "Launching GNOME Shell devkit session..."
echo "Press Ctrl+C to exit the test session"
echo ""

# Launch GNOME Shell devkit session
env MUTTER_DEBUG_DUMMY_MODE_SPECS=1500x1000 \
    MUTTER_DEBUG_DUMMY_MONITOR_SCALES=1 \
    dbus-run-session -- gnome-shell --devkit --wayland
