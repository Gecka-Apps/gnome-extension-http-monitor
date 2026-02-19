// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Laurent Dinclaux <laurent@gecka.nc>

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Soup from 'gi://Soup?version=3.0';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const Status = {
    PENDING: 'pending',
    SUCCESS: 'success',
    ERROR: 'error',
    CONNECTION_ERROR: 'connection_error',
};

const CheckMode = {
    HTTP: 'http',
    CONTENT: 'content',
    JSON: 'json',
};

function parseUrlConfig(entry) {
    try {
        const config = JSON.parse(entry);
        if (config && typeof config === 'object' && config.url)
            return config;
    } catch {
        // Fall through
    }

    // Plain URL string (backward compatibility)
    if (entry && entry.startsWith('http'))
        return {url: entry, check: CheckMode.HTTP};

    return null;
}

const UrlMenuItem = GObject.registerClass(
class UrlMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(config) {
        super._init({reactive: false, can_focus: false});

        this._config = config;

        this._label = new St.Label({
            text: this._truncateUrl(config.url),
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._label);

        this._statusWidget = new St.Label({
            style_class: 'http-monitor-status-pending',
            text: '...',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._statusWidget);
    }

    _truncateUrl(url) {
        try {
            const u = new URL(url);
            let display = u.hostname + u.pathname;
            if (display.length > 30)
                display = `${display.substring(0, 27)}...`;
            return display;
        } catch {
            return url.length > 30 ? `${url.substring(0, 27)}...` : url;
        }
    }

    updateStatus(status, message) {
        if (status === Status.SUCCESS) {
            this._statusWidget.style_class = 'http-monitor-status-ok';
            this._statusWidget.text = message || '200';
        } else if (status === Status.ERROR) {
            this._statusWidget.style_class = 'http-monitor-status-error';
            this._statusWidget.text = message || _('Error');
        } else if (status === Status.CONNECTION_ERROR) {
            this._statusWidget.style_class = 'http-monitor-status-error';
            this._statusWidget.text = message || _('Connection error');
        } else {
            this._statusWidget.style_class = 'http-monitor-status-pending';
            this._statusWidget.text = '...';
        }
    }
});

const UrlMonitorToggle = GObject.registerClass(
class UrlMonitorToggle extends QuickMenuToggle {
    _init(indicator) {
        super._init({
            title: 'HTTP Monitor',
            iconName: 'network-transmit-receive-symbolic',
            toggleMode: true,
        });

        this._indicator = indicator;

        this.menu.setHeader('network-transmit-receive-symbolic', 'HTTP Monitor');

        this._urlSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._urlSection);

        this._placeholder = new PopupMenu.PopupMenuItem(_('No URLs configured'), {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(this._placeholder);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const settingsItem = this.menu.addAction(_('Settings'), () => {
            Main.panel.statusArea.quickSettings.menu.close();
            indicator._extension.openPreferences();
        });
        settingsItem.visible = Main.sessionMode.allowSettings;
    }

    sync(urlItems, hasUrls) {
        this._placeholder.visible = !hasUrls;

        let errorCount = 0;
        for (const item of urlItems) {
            if (item._lastStatus === Status.ERROR || item._lastStatus === Status.CONNECTION_ERROR)
                errorCount++;
        }

        if (!this.checked) {
            this.subtitle = _('Off');
        } else if (!hasUrls) {
            this.subtitle = _('No URLs');
        } else if (errorCount > 0) {
            this.subtitle = errorCount === 1
                ? _('1 error')
                : _('%d errors').format(errorCount);
        } else {
            this.subtitle = _('All OK');
        }
    }
});

const UrlMonitorIndicator = GObject.registerClass(
class UrlMonitorIndicator extends SystemIndicator {
    _init(extension) {
        super._init();

        this._extension = extension;
        this._settings = extension.getSettings();
        this._session = new Soup.Session({
            user_agent: 'HttpMonitor (GNOME Shell Extension; +https://github.com/Gecka-Apps/gnome-extension-http-monitor)',
        });
        this._cancellable = new Gio.Cancellable();
        this._pollingTimeout = null;
        this._urlItems = new Map();

        this._updateSessionTimeout();

        this._warningButton = new PanelMenu.Button(0.0, 'HTTP Monitor');
        const warningIcon = new St.Icon({
            icon_name: 'network-transmit-receive-symbolic',
            style_class: 'system-status-icon',
        });
        this._warningButton.add_child(warningIcon);
        this._warningButton.add_style_class_name('http-monitor-indicator');
        this._warningButton.visible = false;

        this._warningMenuSection = new PopupMenu.PopupMenuSection();
        this._warningButton.menu.addMenuItem(this._warningMenuSection);
        this._warningMenuDirty = true;
        this._warningButton.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._syncWarningMenu();
        });

        this._toggle = new UrlMonitorToggle(this);
        this.quickSettingsItems.push(this._toggle);

        this._settings.bind('enabled',
            this._toggle, 'checked',
            Gio.SettingsBindFlags.DEFAULT);

        this._urlsChangedId = this._settings.connect('changed::monitor-urls',
            () => this._rebuildUrlItems());
        this._enabledChangedId = this._settings.connect('changed::enabled',
            () => this._onEnabledChanged());
        this._timeoutChangedId = this._settings.connect('changed::timeout',
            () => this._updateSessionTimeout());

        this._rebuildUrlItems();
        this._onEnabledChanged();
    }

    _updateSessionTimeout() {
        this._session.timeout = this._settings.get_uint('timeout');
    }

    _rebuildUrlItems() {
        this._cancellable.cancel();
        this._cancellable = new Gio.Cancellable();

        this._urlItems.forEach(item => item.destroy());
        this._urlItems.clear();
        this._toggle._urlSection.removeAll();

        const entries = this._settings.get_strv('monitor-urls');
        for (const entry of entries) {
            if (!entry || entry.trim() === '')
                continue;

            const config = parseUrlConfig(entry);
            if (!config)
                continue;

            const item = new UrlMenuItem(config);
            item._lastStatus = Status.PENDING;
            this._urlItems.set(entry, item);
            this._toggle._urlSection.addMenuItem(item);
        }

        this._syncState();

        if (this._pollingTimeout)
            this._checkAllUrls();
    }

    _onEnabledChanged() {
        const enabled = this._settings.get_boolean('enabled');

        if (enabled) {
            this._startMonitoring();
        } else {
            this._stopMonitoring();
            this._warningButton.visible = false;
        }

        this._syncState();
    }

    _startMonitoring() {
        this._stopMonitoring();
        this._checkAllUrls();

        this._pollingTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            this._checkAllUrls();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopMonitoring() {
        if (this._pollingTimeout) {
            GLib.source_remove(this._pollingTimeout);
            this._pollingTimeout = null;
        }
    }

    _checkAllUrls() {
        for (const [_entry, item] of this._urlItems)
            this._checkUrl(item);
    }

    _checkUrl(item) {
        const config = item._config;
        const checkMode = config.check || CheckMode.HTTP;
        const message = Soup.Message.new('GET', config.url);

        if (!message) {
            item._lastStatus = Status.CONNECTION_ERROR;
            item.updateStatus(Status.CONNECTION_ERROR, _('Invalid URL'));
            this._syncState();
            return;
        }

        const cancellable = this._cancellable;
        this._session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (session, result) => {
                if (cancellable.is_cancelled())
                    return;

                try {
                    const bytes = session.send_and_read_finish(result);
                    const httpStatus = message.get_status();

                    if (httpStatus < 200 || httpStatus >= 300) {
                        item._lastStatus = Status.ERROR;
                        item.updateStatus(Status.ERROR, `HTTP ${httpStatus}`);
                        this._syncState();
                        return;
                    }

                    const body = new TextDecoder('utf-8').decode(bytes.get_data());
                    this._validateResponse(item, checkMode, config, body, httpStatus);
                } catch (error) {
                    item._lastStatus = Status.CONNECTION_ERROR;
                    item.updateStatus(Status.CONNECTION_ERROR,
                        this._formatNetworkError(error));
                }

                this._syncState();
            }
        );
    }

    _validateResponse(item, checkMode, config, body, httpStatus) {
        const statusLabel = `${httpStatus}`;

        if (checkMode === CheckMode.CONTENT) {
            if (!config.content) {
                item._lastStatus = Status.SUCCESS;
                item.updateStatus(Status.SUCCESS, statusLabel);
            } else if (body.includes(config.content)) {
                item._lastStatus = Status.SUCCESS;
                item.updateStatus(Status.SUCCESS, statusLabel);
            } else {
                item._lastStatus = Status.ERROR;
                item.updateStatus(Status.ERROR, _('Content not found'));
            }
        } else if (checkMode === CheckMode.JSON) {
            if (!config.field) {
                item._lastStatus = Status.SUCCESS;
                item.updateStatus(Status.SUCCESS, statusLabel);
            } else {
                try {
                    const data = JSON.parse(body);
                    const actual = String(data[config.field]);
                    if (actual === String(config.value ?? '')) {
                        item._lastStatus = Status.SUCCESS;
                        item.updateStatus(Status.SUCCESS, statusLabel);
                    } else {
                        item._lastStatus = Status.ERROR;
                        item.updateStatus(Status.ERROR, `${config.field}=${actual}`);
                    }
                } catch {
                    item._lastStatus = Status.ERROR;
                    item.updateStatus(Status.ERROR, _('Invalid JSON'));
                }
            }
        } else {
            // HTTP mode: 200 OK is enough
            item._lastStatus = Status.SUCCESS;
            item.updateStatus(Status.SUCCESS, statusLabel);
        }
    }

    _formatNetworkError(error) {
        if (!error.message)
            return _('Connection error');

        const msg = error.message.toLowerCase();
        if (msg.includes('timeout'))
            return _('Timeout');
        if (msg.includes('dns') || msg.includes('resolve'))
            return _('DNS error');
        if (msg.includes('refused'))
            return _('Refused');
        if (msg.includes('unreachable'))
            return _('Unreachable');

        return _('Connection error');
    }

    _syncState() {
        const items = [...this._urlItems.values()];
        const hasUrls = items.length > 0;
        const enabled = this._settings.get_boolean('enabled');

        let hasError = false;
        for (const item of items) {
            if (item._lastStatus === Status.ERROR ||
                item._lastStatus === Status.CONNECTION_ERROR) {
                hasError = true;
                break;
            }
        }

        this._warningButton.visible = enabled && hasError;
        this._warningMenuDirty = true;
        this._toggle.sync(items, hasUrls);
    }

    _syncWarningMenu() {
        if (!this._warningMenuDirty)
            return;
        this._warningMenuDirty = false;

        const items = [...this._urlItems.values()];
        this._warningMenuSection.removeAll();
        for (const item of items) {
            const statusText = item._statusWidget.text;
            const isError = item._lastStatus === Status.ERROR ||
                item._lastStatus === Status.CONNECTION_ERROR;
            const styleClass = isError
                ? 'http-monitor-status-error'
                : 'http-monitor-status-ok';

            const menuItem = new PopupMenu.PopupBaseMenuItem({
                reactive: false, can_focus: false,
            });
            menuItem.add_child(new St.Label({
                text: item._label.text,
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            }));
            menuItem.add_child(new St.Label({
                text: statusText,
                style_class: styleClass,
                y_align: Clutter.ActorAlign.CENTER,
            }));
            this._warningMenuSection.addMenuItem(menuItem);
        }
    }

    destroy() {
        this._stopMonitoring();

        if (this._urlsChangedId) {
            this._settings.disconnect(this._urlsChangedId);
            this._urlsChangedId = null;
        }

        if (this._enabledChangedId) {
            this._settings.disconnect(this._enabledChangedId);
            this._enabledChangedId = null;
        }

        if (this._timeoutChangedId) {
            this._settings.disconnect(this._timeoutChangedId);
            this._timeoutChangedId = null;
        }

        this._cancellable.cancel();

        if (this._session) {
            this._session.abort();
            this._session = null;
        }

        if (this._warningButton) {
            this._warningButton.destroy();
            this._warningButton = null;
        }

        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
});

export default class UrlMonitorExtension extends Extension {
    enable() {
        this._indicator = new UrlMonitorIndicator(this);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
        const pos = Main.panel._rightBox.get_n_children() - 1;
        Main.panel.addToStatusArea('http-monitor-warning',
            this._indicator._warningButton, pos, 'right');
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
