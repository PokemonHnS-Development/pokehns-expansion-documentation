# Pokémon Heart & Soul — Documentation

Player documentation for Pokémon Heart & Soul, served with GitHub Pages.

Every page is generated directly from the game's own data — encounter tables,
species info, learnsets, evolutions, item placements and trainer parties are
read out of the ROM source rather than maintained by hand, so the docs can't
drift from the game.

## Editing

Don't edit the HTML in this repo by hand; it is overwritten on every build.
The generators live in the main development workspace:

```
documenation_generators/gen_*.py     extract game data to CSV
documenation_generators/build_site.py   turn those CSVs into this site
```

## AI Disclosure

AI-assisted PR's are accepted, but all code must be human-reviewed and tested.

## Local preview

```
python3 -m http.server 8000
```
