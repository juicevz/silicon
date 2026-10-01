# Holder workspaces and recurring alerts

Release date: 2026-10-01. The first holder bundle adds wallet-signed saved
workspaces and advanced server alerts above 5,000 SILICON on Robinhood Chain.

- Five workspaces: GPU watchlist, selected model, chart range, search, notes and
  up to 50 strategy templates. Explicit saves with cross-device version checks.
- 100 advanced server rules: up to three AND conditions, optional recurrence,
  cooldowns and a wallet-linked event inbox. Price levels, receipt-backed 24-hour
  changes, and complete/fresh H100 benchmark coverage.
- New saves require a fresh backend eligibility check. Monitoring pauses on
  failed verification or lost eligibility. Authenticated owners keep read/delete
  access. Rules expire at 90 days; events at 30 days.
- Wallet message authentication is independent of Compute enrollment and never
  authorizes a transaction. Loading a workspace never opens a paper or live trade.
- Preserves the rental planner, Compute key controls, public market tools and
  existing anonymous alerts. No contract, fee setting or funded service is changed.

Open [workspaces](https://siliconmarkets.io/terminal?workspaces=1) or
[advanced alerts](https://siliconmarkets.io/terminal?holderAlerts=1).
The [public guide](https://siliconmarkets.io/docs#holder-workspaces) and root README
cover session lifetime, data storage, exact trigger/reset behavior, push devices,
API endpoints and deployment.

## Draft copy

These are review-ready drafts. Nothing has been posted to X.

- [Official posts](OFFICIAL-TWEETS.txt): five standalone posts and a seven-post thread.
- [Founder posts](FOUNDER-TWEETS.txt): five standalone posts and a seven-post thread.
- [Official article](OFFICIAL-ARTICLE.txt)
- [Founder article](FOUNDER-ARTICLE.txt)
- [Bio suggestions](BIO-SUGGESTIONS.txt): three for each account.

Standalone 1 in each tweet file is the recommended launch post. Every post is
under 280 characters and each bio under 160. Claims describe this implemented
bundle; custom baskets, historical replay, exports/API feeds and monthly Compute
credits are outside this release.

## Media and verification

Product previews use a clearly identified demonstration wallet and example saved
research. They do not show real customer holdings or imply executed trades. Live
public prices retain the site's freshness and coverage labels. Production guest
screenshots are captured separately after deployment.


### Validation

- Backend: 132 passed, 2 optional RPC tests skipped.
- TypeScript production build and lint pass. Existing third-party wallet bundle
  size/annotation warnings remain unchanged in scope.
- 23 selected browser checks pass against the compiled frontend after targeted
  fixes to the wallet fixture and tour selectors. Coverage includes cross-device
  saves, save conflicts, 320/390px layout, eligibility loss, basic monitoring,
  the planner/key controls, tour and terminal recovery.
- Preview PNGs and the 11-second MP4/GIF were visually inspected. Prefer the MP4
  for posting; the GIF is a smaller-resolution looping preview.

[Workspace screenshot](media/workspaces-desktop.png) ·
[Advanced alerts screenshot](media/saved-alert-desktop.png) ·
[Mobile screenshot](media/workspaces-mobile.png) ·
[MP4 preview](media/holder-tools-preview.mp4) · [GIF preview](media/holder-tools-preview.gif)
