BOTSWANA TRUCKERS - how to put it on your phone
================================================

This folder is a web app (PWA). It needs to be hosted on a web address (https) once.
After you open it online one time and "install" it, it works OFFLINE like a normal app.

EASIEST: GitHub Pages (free, works from a phone browser)
1. Sign in at https://github.com (free account), tap + > New repository.
   Name it  botswana-truckers , keep it Public, tap Create repository.
2. Tap "uploading an existing file". Choose ALL the files from this folder
   (index.html, main.js, ui.js, sim.js, track.js, world.js, actors.js, trucks.js,
   truckdata.js, audio.js, fuel.js, settings.js, sw.js, manifest.json, icon-192.png, icon-512.png).
   Tap Commit changes.
3. Repository > Settings > Pages > Source: "Deploy from a branch", Branch: main, folder: / (root) > Save.
4. After about 1 minute your game is at  https://YOURNAME.github.io/botswana-truckers/

INSTALL AS AN APP
- Android (Chrome): open the address, wait for it to load fully, then menu (3 dots) >
  "Install app" or "Add to Home screen". Open it once while online, then it works offline.
- iPhone (Safari): Share button > "Add to Home Screen".

REAL APK FILE (optional): go to https://www.pwabuilder.com , paste your address,
tap Start > Package for stores > Android. It gives you an installable .apk/.aab.

OTHER FREE HOSTS: https://app.netlify.com/drop  or  https://pages.cloudflare.com

TESTING ON A COMPUTER: open a terminal in this folder and run   python -m http.server 8000
then visit http://localhost:8000   (double-clicking index.html will NOT work).

NOTES
- The 3D library (Three.js) is loaded from the internet the first time and then saved
  for offline use by the app. Open the game once online before going offline.
- Your music is picked from your phone (Music button > Add songs) and stays saved in the app.
- Steering: Settings > Steering mode: Wheel, Arrows, Tilt or Gyro. If tilt turns the wrong way,
  use "Reverse tilt direction" and "Centre steering" in Settings.

NEW IN THIS VERSION
- Settings (top bar): Controls, Graphics (Low to Ultra, shadows, view distance, trees, haze, wet road),
  Traffic (amount, cattle, police on/off, time of day), Sound (engine/effects/music) and Game (fuel use).
- Fuel: tank 300 L, about 4-5 laps. Fuel stations are on the LEFT in every town. Stop on the forecourt,
  switch the engine off (key button) and the pump menu opens. If you run dry use the "Fuel delivery" button.
- Key button = engine on/off (starter sound). Red E-Brake button = emergency brake (hold).
- Guardrails now hurt. Trailer type (box, tanker, flatbed) is chosen in the showroom, Paint tab.

UPDATING AN EXISTING GITHUB SITE
Extract the zip, open your repository > Add file > Upload files, drop ALL the files (new ones: fuel.js and
settings.js), Commit. Wait one minute, open the game, close it fully and open it again once so the new version loads.
