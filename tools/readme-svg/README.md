Generators for the animated SVGs in `docs/media/` that the README shows (`agent`, `audit`, `how-it-works`, each with a `-narrow` variant for phones). Plain Node, no dependencies:

```sh
node tools/readme-svg/build.mjs            # all six
node tools/readme-svg/build.mjs agent      # just one
```

The command lines and output strings in `agent.mjs` and `audit.mjs` are copied from real runs of `npm run audit` and `npm run check:ui`; when those messages change, update the text here and rebuild. The GIFs in `docs/media/` come from `e2e/readme-media.spec.mjs` instead (`UPDATE_MEDIA=1 npx playwright test e2e/readme-media.spec.mjs`, needs ffmpeg).
