BOTSWANA TRUCKERS - how to put it on your phone
================================================

This folder is a web app (PWA). It needs to be hosted on a web address (https) once.
After you open it online one time and "install" it, it works OFFLINE like a normal app.

EASIEST: GitHub Pages (free, works from a phone browser)
1. Sign in at https://github.com (free account), tap + > New repository.
   Name it  botswana-truckers , keep it Public, tap Create repository.
2. Tap "uploading an existing file". Choose ALL the files from this folder
   (index.html, main.js, ui.js, sim.js, track.js, world.js, actors.js, trucks.js,
   truckdata.js, audio.js, sw.js, manifest.json, icon-192.png, icon-512.png).
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
