# VLL Construction

Website for VLL Construction. Scrolling the page builds a tower in 3D, from the first dig to a lit-up skyline.

## What's on the page

- **The build**, a scroll-driven three.js scene in six stages:
  1. **Site survey**: stakes, string lines and a blueprint outline of the tower
  2. **Excavation**: an excavator digs an 18 × 18 m pit and loads the spoil into a truck
  3. **Foundation**: 16 piles, two rebar mats and the raft pour
  4. **Superstructure**: 728 modules placed block by block, with a climbing tower crane
  5. **Envelope**: glass facade panels go on, the crane comes down, the spire goes up
  6. **Skyline**: the city rises around the tower and the lights come on
- A live site readout (depth, concrete, modules, height) that follows the build, with buttons to jump between stages
- **Watch the build** plays the whole story as a timelapse
- Services cards that tilt in 3D, CSS 3D models for each sector, and an enquiry form

## Run it locally

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Publish with GitHub Pages

Go to **Settings → Pages**, choose **Deploy from a branch**, then pick `main` and `/ (root)`. On a free GitHub account, Pages only works for public repositories.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Page markup |
| `styles.css` | Layout and theme (light "whiteprint" and dark "blueprint") |
| `main.js` | The 3D scene and page behaviour. three.js r128 loads from cdnjs. |

## Before going live

- The enquiry form doesn't send anything yet. Connect it to a form service or your own backend.
- Replace the placeholder service copy with VLL's real details, and add contact information and past projects.
