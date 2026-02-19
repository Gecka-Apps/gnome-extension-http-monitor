// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Laurent Dinclaux <laurent@gecka.nc>

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const CheckMode = {
    HTTP: 0,
    CONTENT: 1,
    JSON: 2,
};

const CHECK_MODE_STRINGS = ['http', 'content', 'json'];

export default class UrlMonitorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        // URL list group
        const urlGroup = new Adw.PreferencesGroup({
            title: _('URLs to monitor'),
            description: _('The extension checks each URL at regular intervals'),
        });
        page.add(urlGroup);

        // Add button in group header
        const addButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            css_classes: ['flat', 'circular'],
            valign: Gtk.Align.CENTER,
        });
        urlGroup.set_header_suffix(addButton);

        const urlRows = [];

        const addUrlRow = (config = {}) => {
            const url = config.url || '';
            const check = CHECK_MODE_STRINGS.indexOf(config.check || 'http');
            const content = config.content || '';
            const field = config.field || '';
            const value = config.value || '';

            const row = new Adw.ExpanderRow({
                title: url || _('New URL'),
                subtitle: this._checkModeLabel(check),
            });

            // Delete button
            const deleteButton = new Gtk.Button({
                icon_name: 'edit-delete-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat', 'circular'],
            });
            deleteButton.connect('clicked', () => {
                urlGroup.remove(row);
                urlRows.splice(urlRows.indexOf(row), 1);
                this._saveUrls(settings, urlRows);
            });
            row.add_suffix(deleteButton);

            // URL entry
            const urlEntry = new Adw.EntryRow({
                title: _('URL'),
                text: url,
            });
            urlEntry.connect('changed', () => {
                const text = urlEntry.text.trim();
                row.title = text || _('New URL');
                this._saveUrls(settings, urlRows);
            });
            row.add_row(urlEntry);

            // Check mode combo
            const checkModel = new Gtk.StringList();
            checkModel.append(_('HTTP Status (default)'));
            checkModel.append(_('Content Match'));
            checkModel.append(_('JSON Field'));

            const checkCombo = new Adw.ComboRow({
                title: _('Check mode'),
                model: checkModel,
                selected: check >= 0 ? check : CheckMode.HTTP,
            });
            row.add_row(checkCombo);

            // Content match field
            const contentEntry = new Adw.EntryRow({
                title: _('Expected content'),
                text: content,
                visible: check === CheckMode.CONTENT,
            });
            contentEntry.connect('changed', () => this._saveUrls(settings, urlRows));
            row.add_row(contentEntry);

            // JSON field name
            const fieldEntry = new Adw.EntryRow({
                title: _('JSON field'),
                text: field,
                visible: check === CheckMode.JSON,
            });
            fieldEntry.connect('changed', () => this._saveUrls(settings, urlRows));
            row.add_row(fieldEntry);

            // JSON expected value
            const valueEntry = new Adw.EntryRow({
                title: _('Expected value'),
                text: value,
                visible: check === CheckMode.JSON,
            });
            valueEntry.connect('changed', () => this._saveUrls(settings, urlRows));
            row.add_row(valueEntry);

            // Toggle conditional fields visibility
            checkCombo.connect('notify::selected', () => {
                const mode = checkCombo.selected;
                contentEntry.visible = mode === CheckMode.CONTENT;
                fieldEntry.visible = mode === CheckMode.JSON;
                valueEntry.visible = mode === CheckMode.JSON;
                row.subtitle = this._checkModeLabel(mode);
                this._saveUrls(settings, urlRows);
            });

            // Store references for serialization
            row._urlEntry = urlEntry;
            row._checkCombo = checkCombo;
            row._contentEntry = contentEntry;
            row._fieldEntry = fieldEntry;
            row._valueEntry = valueEntry;

            urlRows.push(row);
            urlGroup.add(row);
            return row;
        };

        // Load existing URL configs
        const entries = settings.get_strv('monitor-urls');
        for (const entry of entries) {
            const config = this._parseConfig(entry);
            if (config)
                addUrlRow(config);
        }

        addButton.connect('clicked', () => {
            const row = addUrlRow({});
            row.set_expanded(true);
        });

        // Settings group
        const settingsGroup = new Adw.PreferencesGroup({
            title: _('Settings'),
        });
        page.add(settingsGroup);

        const timeoutRow = new Adw.SpinRow({
            title: _('Request timeout'),
            subtitle: _('In seconds'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 60,
                step_increment: 1,
                value: settings.get_uint('timeout'),
            }),
        });
        settings.bind('timeout', timeoutRow.adjustment, 'value',
            Gio.SettingsBindFlags.DEFAULT);
        settingsGroup.add(timeoutRow);
    }

    _checkModeLabel(mode) {
        switch (mode) {
        case CheckMode.CONTENT:
            return _('Content match');
        case CheckMode.JSON:
            return _('JSON field');
        default:
            return _('HTTP status');
        }
    }

    _parseConfig(entry) {
        if (!entry || entry.trim() === '')
            return null;

        try {
            const config = JSON.parse(entry);
            if (config && typeof config === 'object' && config.url)
                return config;
        } catch {
            // Fall through
        }

        // Plain URL string (backward compatibility)
        if (entry.startsWith('http'))
            return {url: entry, check: 'http'};

        return null;
    }

    _saveUrls(settings, urlRows) {
        const configs = [];
        for (const row of urlRows) {
            const url = row._urlEntry.text.trim();
            if (!url)
                continue;

            const mode = row._checkCombo.selected;
            const config = {url};

            if (mode === CheckMode.CONTENT) {
                config.check = 'content';
                const content = row._contentEntry.text.trim();
                if (content)
                    config.content = content;
            } else if (mode === CheckMode.JSON) {
                config.check = 'json';
                const field = row._fieldEntry.text.trim();
                const value = row._valueEntry.text.trim();
                if (field)
                    config.field = field;
                if (value)
                    config.value = value;
            }

            configs.push(JSON.stringify(config));
        }
        settings.set_strv('monitor-urls', configs);
    }
}
