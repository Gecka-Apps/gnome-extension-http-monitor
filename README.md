# HTTP Monitor

A GNOME Shell extension that monitors HTTP endpoints and displays their status in Quick Settings. Warning indicator in the top bar when something goes wrong. Silent when everything is OK.

![License](https://img.shields.io/badge/license-GPL--3.0+-green)
![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-46%20|%2047%20|%2048%20|%2049-blue)
![Release](https://img.shields.io/github/v/release/Gecka-Apps/gnome-extension-http-monitor)

## Features

- **Quick Settings integration**: Toggle and URL status list in the system menu
- **Multiple URLs**: Monitor as many endpoints as you need
- **Flexible check modes**:
  - **HTTP Status**: Just check that the URL responds with HTTP 200
  - **Content Match**: Check that the response body contains a specific string
  - **JSON Field**: Check that a JSON field has an expected value
- **Warning indicator**: Icon in the top bar when errors are detected, click to see status details
- **Polling every 60 seconds**: Automatic checks at regular intervals
- **Configurable timeout**: Set the HTTP request timeout (1-60 seconds)
- **Error detection**: Timeout, DNS failure, connection refused, HTTP errors

## Check Modes

### HTTP Status (default)

Simply checks that the URL responds with HTTP 200. Works with any website or API.

### Content Match

Checks that the response body contains a specific string. Useful for verifying a page displays expected content.

### JSON Field

Parses the JSON response and checks that a specific field matches an expected value. Example: field `status` with value `success` for a health check endpoint returning:

```json
{"status": "success", "message": "All systems operational"}
```

## Installation

### From Source

```bash
git clone https://github.com/Gecka-Apps/gnome-extension-http-monitor.git
cd gnome-extension-http-monitor
make install
```

Then restart GNOME Shell and enable the extension:

```bash
gnome-extensions enable http-monitor@gecka.nc
```

## Development

### Building from Source

```bash
# Build the extension package
make build

# Build and install
make install

# Test in nested GNOME Shell
make test-shell

# Test preferences dialog
make test-prefs

# Clean build artifacts
make clean

# Show all available commands
make help
```

### Testing with the Test Server

A Python test server is included for local development:

```bash
python3 test-server.py --port 8080 --status success
```

Then configure the extension to monitor:

| URL | Check Mode | Expected |
|-----|-----------|----------|
| `http://localhost:8080/` | HTTP Status | HTTP 200 |
| `http://localhost:8080/` | Content Match | `All systems operational` |
| `http://localhost:8080/status` | JSON Field | `status` = `success` |
| `http://localhost:8080/status2` | JSON Field | `status` = `success` (will fail) |

## Compatibility

- **GNOME Shell**: 46, 47, 48, 49
- **Dependencies**: GLib 2.x, Soup 3.x

## License

This project is licensed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html) or later - see the [LICENSE](LICENSE) file for details.

## Author

- **Laurent Dinclaux** <laurent@gecka.nc> - Gecka

---

Built with 🥥 and ☕ by [Gecka](https://gecka.nc) — Kanaky-New Caledonia 🇳🇨
