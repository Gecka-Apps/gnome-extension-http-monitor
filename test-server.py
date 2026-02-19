#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Laurent Dinclaux <laurent@gecka.nc>

"""
Simple test server for HTTP Monitor extension.

Endpoints:
    /         — HTML page (test http mode and content match)
    /status   — JSON success or error based on --status flag
    /status2  — JSON always error

Usage:
    python3 test-server.py --port 8080 --status success

    Then configure the extension to monitor:
        http://localhost:8080/          check=http (just HTTP 200)
        http://localhost:8080/          check=content, content="All systems operational"
        http://localhost:8080/status    check=json, field=status, value=success
        http://localhost:8080/status2   check=json, field=status, value=success (will fail)
"""

import argparse
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
import random

class StatusHandler(BaseHTTPRequestHandler):
    status_mode = 'success'

    def _send_json(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _send_html(self, html):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(html.encode())

    def do_GET(self):
        if self.path == '/':
            self._send_html(
                '<html><body>'
                '<h1>HTTP Monitor Test Server</h1>'
                '<p>All systems operational</p>'
                '</body></html>'
            )

        elif self.path == '/status':
            if self.status_mode == 'random':
                current_status = random.choice(['success', 'error'])
            else:
                current_status = self.status_mode

            if current_status == 'success':
                self._send_json({
                    'status': 'success',
                    'message': 'All systems operational',
                })
            else:
                self._send_json({
                    'status': 'error',
                    'message': 'Service degradation detected',
                })

        elif self.path == '/status2':
            self._send_json({
                'status': 'error',
                'message': 'Database connection failed',
            })

        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")

def main():
    parser = argparse.ArgumentParser(description='Test server for HTTP Monitor extension')
    parser.add_argument('--port', type=int, default=8080, help='Port to listen on (default: 8080)')
    parser.add_argument('--status', choices=['success', 'error', 'random'], default='success',
                        help='JSON status to return on /status (default: success)')

    args = parser.parse_args()

    StatusHandler.status_mode = args.status

    server = HTTPServer(('localhost', args.port), StatusHandler)
    print(f"Test server running on http://localhost:{args.port}")
    print(f"\nEndpoints:")
    print(f"  http://localhost:{args.port}/          HTML page")
    print(f"  http://localhost:{args.port}/status    JSON ({args.status})")
    print(f"  http://localhost:{args.port}/status2   JSON (always error)")
    print(f"\nPress Ctrl+C to stop")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")

if __name__ == '__main__':
    main()
