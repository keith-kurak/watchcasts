# Icon archive

Superseded launcher icon artwork, kept so a previous look can be recovered. Nothing here is
built or bundled — these files are referenced by no code. They live under `docs/` rather than
`apps/mobile/assets/` deliberately, so they cannot be swept into the app bundle.

One directory per retired icon, named `<date>-<description>`.

## How the live icon is produced

The phone and the watch share **one** source asset,
`apps/mobile/assets/images/android-icon-foreground.png`:

- **Phone** — consumed directly by `android.adaptiveIcon.foregroundImage` in
  `apps/mobile/app.config.js`. `expo prebuild` generates the mipmaps.
- **Watch** — `apps/watch/android/app/src/main/res/mipmap-*/ic_launcher_foreground.png` are a
  plain resize of that same file to the 108dp canvas at each density:

  ```sh
  src=apps/mobile/assets/images/android-icon-foreground.png
  for p in "mdpi 108" "hdpi 162" "xhdpi 216" "xxhdpi 324" "xxxhdpi 432"; do
    d="${p%% *}"; s="${p##* }"
    sips -z "$s" "$s" "$src" \
      --out "apps/watch/android/app/src/main/res/mipmap-$d/ic_launcher_foreground.png"
  done
  ```

The background colour is **not** shared — it is mirrored by hand in two places, and both must be
changed together:

| Where | What |
|---|---|
| `apps/mobile/app.config.js` | `android.adaptiveIcon.backgroundColor` |
| `apps/watch/.../res/values/ic_launcher_background.xml` | `ic_launcher_background` |

## Glyph size: 44% of the canvas

Artwork exported for the phone tends to sit small in the frame, which reads badly on a watch. The
live asset has the duck at **44% of its 512px canvas**, and that number is set by the *watch*, not
the phone — Wear's round mask is the tighter of the two.

The glyph's bounding box is 1.36x as long on its diagonal as it is wide, so:

| Glyph width | Diagonal vs Wear's visible circle | |
|---|---|---|
| 29% | 59% | as-exported; too small on a watch |
| 44% | 90% | **current** |
| 56% | 114% | clipped the mic and headphone |

To adapt a new export, centre-crop it to a box around the glyph and scale that back to 512px, then
regenerate the watch mipmaps. Judge any change against the round mask, never the phone's squircle.

## Contents

### `2026-08-06-green-duck/`

The green duck, retired the same day for an orange one on a cream background.

| File | Notes |
|---|---|
| `phone/android-icon-foreground.green-29pct-original-export.png` | The original export, glyph at 29%. Never used in a build — kept because it is the only copy of the untouched artwork. |
| `phone/android-icon-foreground.green-44pct.png` | What actually shipped: the above, cropped and scaled to 44%. |
| `watch-mipmaps/*.png` | Derived from the 44% file by the loop above. Reproducible, kept only for convenience. |

Background colour in use at the time: `#E4F0FE`.
