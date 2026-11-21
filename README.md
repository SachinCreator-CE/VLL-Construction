# VLL Construction & Real Estate

Website for VLL, a developer and builder of luxury residences. The page tells the story of a tower being built, in 3D, from the first survey pin to a lit skyline. It then presents the two ways to buy: own a residence in a VLL tower, or commission a private home on your own land.

## What's on the page

- **The build**: a cinematic, scroll-driven three.js scene in six chapters:
  1. **The plot**: brass survey pins, laser lines and a traced blueprint of the tower
  2. **The ground**: the soil layers lift out of an 18 × 18 m, 10.5 m deep pit
  3. **The foundation**: 16 piles, two rebar mats and the raft pour
  4. **The structure**: 728 stone modules lowered level by level beside a climbing crane
  5. **The facade**: tinted glass, bronze fins, sky gardens, the crown lantern and spire
  6. **The skyline**: night falls, the city rises around the tower and the lights come on
- **Watch the build** plays the whole story in letterbox cinema mode
- A chapter rail and live depth, level and height readouts
- **Why VLL**: a statement whose words light up as you scroll, and three brand pillars
- **Residences**: indicative floor plans that tilt in 3D and lay flat on hover, with specifications and "price on request"
- **Bespoke homes**: the five-step commission process and a materials palette
- **Engineering** capabilities, and a private enquiry form
- Film grain, a custom cursor on desktop, and reduced-motion support

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
| `styles.css` | The graphite-and-brass design (Bodoni Moda and Jost from Google Fonts) |
| `main.js` | The 3D scene, floor plans, scroll effects and page behaviour. three.js r128 loads from cdnjs. |

## Before going live

- The enquiry form doesn't send anything yet. Connect it to a form service or your own backend.
- Residence plans, areas, amenities and the brand statements are drafts. Replace them with VLL's real projects and confirmed claims, and add contact details.
