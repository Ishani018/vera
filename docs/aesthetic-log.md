# The aesthetic redesign, overnight run

A running log. Newest stage last. Every hash here is on `main` and pushed.

## What to look at first

1. `?theme=sunrise`, `?theme=lagoon`, `?theme=candy` on any page — the three
   themes. Sunrise is the default and is remembered once you have asked for one.
2. The front page: the hero band, the coral Create button, the cards leaning
   towards the pointer.
3. The Sticker Studio with a picture open — the rail, the tool strip and the
   panels are the biggest change of this run.

## Rollback

`pre-aesthetic-4` points at `ec96f7d`, the commit this run started from.

```bash
git fetch origin
git reset --hard origin/pre-aesthetic-4   # on a branch you do not mind losing
```

## The run

### Before it started — ec96f7d

The design system (commit 1, `e171246`), the surfaces (commit 2, `6302315`) and
the front page and hub (commit 3, `ec96f7d`) were already in. This run picks up
at stage 1.
