# المملكة الأردنية الهاشمية — عرض سينمائي

Cinematic, interactive Arabic (RTL) web version of the Canva presentation about Jordan (19 slides → 19 scenes).

- Static site: `index.html`, `assets/styles.css`, `assets/app.js` — no build step, no libraries.
- Fonts (Reem Kufi, Amiri, Noto Naskh Arabic) are self-hosted in `assets/fonts`, so it works offline on a projector.
- Images and background videos come from the original Canva design (most Canva clips are only available at 480p; the Amman clips at 720p).
- 3D: scenes are sticky and stack — the next scene rises over the previous one, which tilts back into depth; titles flip in, layers move with the mouse.
- Controls: scroll, ↓ / PageDown / ← next, ↑ / PageUp / → previous, Home / End, `F` fullscreen, `G` slide index.
