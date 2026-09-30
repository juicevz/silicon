# Silicon logo study

Date: 2026-09-29
Stage: symbol exploration

## Approval and usage

- Logo approval: none. Options 01 through 20 are exploratory candidates.
- Background approval: none. Gallery fields are comparison contexts only.
- Palette approval: none. Individual fills are deliberate exploratory colours, not the permanent Silicon palette.
- Less-zoomed exploration: not started. All comparison masters use the same scale.
- Banner approval: none. No banner has been composed.
- Deployment: this review gallery only. These assets have not been installed in the Silicon navbar, favicon, docs, app or authentication provider.
- Gallery favourites are local browser preferences, not approval or a published choice.
- Preserve these option numbers in later rounds. Add new candidates after 20. Preserve selected silhouettes and counters when refining colour or background.

## Direction

White-first, quiet technical branding for a GPU rental-price market. Explore chip dies, parallel processing, cooling fins, material lattices, time and market flow as abstract symbols. Prefer balance and rotational symmetry, with several deliberate asymmetric options. Use generous negative space, restrained mineral colours and soft edges. No lettering or slogans inside the standalone symbols.

The supplied Sophon X screenshot is the primary composition reference. The reference review below informs spacing, visual consistency and restraint; no reference logo, avatar, banner, type treatment or artwork was traced or reused.

## Production method

Original code-native vector construction in scripts/generate.mjs. Each geometry is independently authored with SVG paths and primitives. No raster generation or image model was used for these masters. There are no embedded images, filters, lighting effects, text glyphs, backgrounds or remote resources in the SVGs.

The brief, names, mechanism notes, symmetry, palette values and geometry are preserved in scripts/generate.mjs and concepts.json. Raster exports use Chromium's SVG renderer through scripts/export.mjs. Recolouring changes only the root paint values; scripts/package.mjs checks that the full geometry is identical across variants.

## Artboard and exports

- SVG master: 512 by 512 viewBox, declared 2048 by 2048 export size.
- Normalised symbol extent: 320 viewBox units on its longest axis, including stroke extents.
- Clear space: at least 96 units per side, approximately 18.75 percent of the artboard.
- Three SVG fills per option: exploratory colour, graphite #293336, soft white #F4F1EA.
- Transparent 2048 px PNGs for all three fills.
- Additional transparent colour PNGs at 256, 32 and 16 px.
- All 120 PNG exports checked for real alpha, non-empty pixels and unclipped margins.
- Master holes are transparent. The checkerboard visible in the gallery is CSS and is absent from downloads.
- Gallery square and circle previews retain the exact same artboard and scale.
- Small-size previews use the complete master at actual 16 and 32 CSS pixels. Tiny icon optical refinement is reserved for the selected mark.

### Comparison fields

Colour on white: #FFFFFF. Graphite on oat: #293336 / #F0EEE7. Soft white on slate: #F4F1EA / #354145. Circular colour previews use #F0F3EE. These are shared proofing fields, not a background selection exercise. No gradients were needed for this round.

## Stable options

| ID | Name | Source idea | Balance | Exploratory fill | Approval |
| --- | --- | --- | --- | --- | --- |
| 01 | Die window | Silicon | Fourfold | #344847 | Unapproved |
| 02 | Parallel | Compute | Bilateral | #516A81 | Unapproved |
| 03 | Facet | Silicon | Threefold | #8A685C | Unapproved |
| 04 | Relay | Markets | Asymmetric | #52635F | Unapproved |
| 05 | Impeller | Compute | Fivefold | #626781 | Unapproved |
| 06 | Wafer pair | Silicon | Twofold | #82704F | Unapproved |
| 07 | Clearing | Markets | Twofold | #455D69 | Unapproved |
| 08 | Lattice | Silicon | Fourfold | #617265 | Unapproved |
| 09 | Fin | Compute | Asymmetric | #805F69 | Unapproved |
| 10 | Phase | Markets | Fourfold | #526C78 | Unapproved |
| 11 | Fold | Compute | Asymmetric | #596363 | Unapproved |
| 12 | Channel | Markets | Asymmetric | #706B8A | Unapproved |
| 13 | Bond | Silicon | Fourfold | #536963 | Unapproved |
| 14 | Socket | Compute | Bilateral | #8A6C50 | Unapproved |
| 15 | Hour | Markets | Bilateral | #6F788A | Unapproved |
| 16 | Flux | Markets | Asymmetric | #795F52 | Unapproved |
| 17 | Register | Compute | Bilateral | #485F74 | Unapproved |
| 18 | Seed | Silicon | Bilateral | #7A7560 | Unapproved |
| 19 | Vector | Compute | Asymmetric | #78617A | Unapproved |
| 20 | Torus | Silicon | Threefold | #465C61 | Unapproved |

## Reference review and provenance

Reviewed 2026-09-29. Website screenshots were inspected in Chromium. Direct X pages returned access errors; public X avatar and banner images were obtained from pbs.twimg.com using FxTwitter profile metadata. The eight available profile pairs were visually inspected together. No X authentication or account actions were performed. The current Sophon website differs from the X profile and the supplied screenshot; the screenshot remains the primary visual reference.

### Sophon

- Website: https://sophon.com/
- X: https://x.com/Sophon
- Takeaway: A light field, generous space and one recognisable symbol. Your supplied X screenshot is the primary direction.
- Evidence limits: Website and X avatar/banner inspected. The current website differs from the X header.

### Fab

- Website: https://fabrwa.xyz/
- X: https://x.com/Fab_RWA
- Takeaway: One recurring object can tie an entire technical world together. Keep that consistency; develop our own hardware forms.
- Evidence limits: Website and X avatar/banner inspected.

### LiquidMuppets

- Website: https://liquidmuppets.io/
- X: https://x.com/liquidmuppets
- Takeaway: A clear central motif carries from avatar to banner. Keep that discipline and the restrained spacing.
- Evidence limits: X avatar/banner inspected. Website timed out during this review.

### Aeva

- Website: https://aevachain.org/
- X: https://x.com/AevaChain
- Takeaway: A compact mark and calm type work well against a light field. Keep the presentation sparse.
- Evidence limits: Current website and X avatar/banner inspected. Earlier aevachain.com reference has moved.

### Canopy

- Website: https://canopyfinance.io/
- X: https://x.com/canopyfinance
- Takeaway: The small symbol remains separate from its larger visual world. Give Silicon the same independence.
- Evidence limits: Website and X avatar/banner inspected.

### Blueprint

- Website: https://useblueprint.tools/
- X: Not verified. No unrelated Blueprint account was substituted.
- Takeaway: Technical geometry can provide a consistent grammar. Use a quieter version of that precision for Silicon.
- Evidence limits: Website inspected. An official X account could not be verified; unrelated Blueprint accounts were excluded.

### Bagwork

- Website: https://bagworkagent.fun/
- X: https://x.com/bagworkagent
- Takeaway: Avatar, objects and environment speak one visual language. Build that continuity after a mark is selected.
- Evidence limits: Website and X avatar/banner inspected.

### Signal

- Website: https://signal.family/
- X: https://x.com/SignalFam
- Takeaway: A single silhouette stays recognisable across scales and compositions. Aim for the same immediate recognition.
- Evidence limits: Website and X avatar/banner inspected.

### Any Finance

- Website: https://www.anyfinance.live/
- X: https://x.com/AnyFinanceOrg
- Takeaway: A focused visual motif is stronger than a collection of unrelated assets. Keep Silicon's motif tied to compute.
- Evidence limits: Website and X avatar/banner inspected.

## Ownership and dependencies

The reference brands retain their own marks and artwork. They are linked for attribution and excluded from this package. These concepts are new SVG constructions for Silicon; this study does not represent a trademark clearance search.

The gallery uses Inter under the SIL Open Font License, bundled at fonts/LICENSE.txt. Inter is only the gallery UI font; no wordmark has been selected. The logo masters have no font dependency.

## Rebuild and review

From frontend/brand/logo-study-20260929, using the existing frontend dependencies:

```sh
node scripts/generate.mjs
node scripts/export.mjs
node scripts/package.mjs
../../node_modules/.bin/tsc -p tsconfig.json
../../node_modules/.bin/vite build
../../node_modules/.bin/vite --host 127.0.0.1 --port 4317
node scripts/qa.mjs
```

Always run generation immediately before export, because export normalises the SVG geometry once. The packaged silhouette hashes in silhouette-hashes.json identify the reviewed shapes.

The gallery is static and has no backend, authentication, analytics or external font calls. Favourites are stored locally under silicon-logo-study-20260929. The live review is served by nginx at /brand/logo-study-20260929/ from the dedicated shared/reviews/logo-study-20260929 directory, independent of the application release.
