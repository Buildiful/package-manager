# Package Manager by Buildiful®

A free, local-first browser tool for tracking package deliveries, returns, and items that need attention. No account or server is required to manage package records.

**Live URL:** https://buildiful.github.io/package-manager/

## Features

- Starts with two editable blank package entries. Add and remove entries as needed.
- Record an item name, sender, expected date, carrier, tracking number, tracking URL, and notes.
- Statuses: Waiting for delivery, Received, To be returned, Lost (action needed), Returned, and custom status.
- Custom statuses can be classified as Open / action needed or Completed.
- Open, History, and All views, search, summaries, and expected-date sorting.
- Completed-record retention: immediately, 7/30/90/365 days, or forever; default 30 days. Open records do not automatically expire. Cleanup runs when the app opens or while it is active, not as a guaranteed background task.
- Entries autosave to browser `localStorage`, under `buildiful.packageManager.v1`.
- Export/import JSON backups to transfer or recover entries. Import replaces the list; it does not merge. **Backup important data periodically.**
- Installable PWA and offline app shell. Background music loads only when enabled, and caches after fetching. Sound feedback can be disabled in Settings.
- Original four-minute looping instrumental: `music/parcel-route.mp3`, off by default.
- Basic, privacy-aware analytics using the standard Buildiful Analytics v2.1.0 module; no package field values are sent as event data.

## Deploy

Deploy the **contents of this directory** to a GitHub repository with GitHub Pages, at `https://buildiful.github.io/package-manager/`. No build, dependencies, or API keys are required. The live host is enforced by the analytics module.

For development, serve using any static HTTP server, such as:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080/`. Service worker support requires localhost or HTTPS. Google Analytics is disabled outside the official production hostname.

## Important local storage notes

`localStorage` is generally suitable for lightweight package records but is quota-limited and can be cleared or unavailable in certain browser modes. The app displays a warning if it cannot save. An installed iOS Home Screen web app may have storage separate from Safari, and separate browsers/devices do not synchronize. Export from the original app and import into the new app when switching environments.

All entry fields are processed locally. Tracking links, if opened, navigate to the URL the user supplied. The analytics and coarse region policy module can make third-party requests as described on the Privacy page. Service worker caching only handles same-origin app files.

## Event allowlist

`package_added`, `package_removed`, `package_status_changed`, `backup_exported`, `backup_imported`, `retention_changed`, `music_toggled`.

No package content, tracking information, dates, or search text is included in analytics calls. The analytics module is copied from the supplied Buildiful Tool Shell v1.0 + Analytics v2.1.0 reference.

## Music and licenses

The supplied **Parcel Route** instrumental is an original composition and synthesized recording, approximately 4:00 long, looped by the HTML Audio API after an explicit user gesture. The editable generator `tools/compose_original_music.py` is provided. This recording/composition is offered under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), so it can be used in promotional videos, including social media.

Application source is released under the MIT License (see `LICENSE`). The generated music and source composition are CC0 1.0. Buildiful® branding, supplied official logo files, and official favicon assets are excluded from the MIT license; see `TRADEMARKS.md`.

## Pre-publication checks

Verify the app on real mobile and desktop browsers, especially Safari Home Screen storage, music playback, offline refresh, JSON backup restore, and changes to retention settings. Separately confirm GA4 property-level privacy settings and legal classifications as outlined in the supplied reference shell. Do not assume this implementation alone establishes compliance with every jurisdiction's rules.
