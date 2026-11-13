# Skies

A weather app with an animated scene, and a home-screen widget for iPhone.

- `index.html`: the web app. Drag the timeline. The scene changes continuously with the time.
- `widget.js`: the widget. It runs in the free Scriptable app.

## Install the widget

1. Install Scriptable from the App Store.
2. Make a new script. Paste the contents of `widget.js`. Give it the name Skies.
3. Add a Scriptable widget to the home screen. Hold the widget, tap Edit Widget, and select Skies.
4. Optional: for a fixed place, set Parameter to `lat,lon,Name`. Example: `12.97,77.59,Bengaluru`.

## Install the web app

Put `index.html` on an HTTPS address (for example, GitHub Pages). Open it in Safari. Tap Share, then Add to Home Screen.
To open the app from the widget, set `APP_URL` in `widget.js` to that address.

## Accuracy

No forecast is fully accurate. The app shows how much to trust each value:

- Data comes from Open-Meteo "best match". It selects the best national model for the place.
- The app compares four independent models (ECMWF, GFS, ICON, GEM). It shows a confidence level and a ± range.
- The app shows the age of the data. Old data has a warning.
