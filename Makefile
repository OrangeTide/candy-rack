# PUBLIC DOMAIN (CC0-1.0)
# This Makefile has no copyright. See https://creativecommons.org/publicdomain/zero/1.0/

NPM ?= npm
NODE ?= $(shell command -v node 2>/dev/null || echo node)
CONVERT ?= convert
OPTIPNG ?= optipng

PROGRAMS := rack
OUT := $(patsubst %,build/%.html,$(PROGRAMS))

ENGINE ?= fm2

# Icon assets. The two 512 masters are the source of truth (hand-cropped, with
# transparent rounded corners); `make icons` derives the runtime favicon set.
ICON_MASTER := docs/candy-rack-icon.png
MARK_MASTER := docs/candy-rack-favicon.png

.PHONY: all build clean deps check wav mix icons

all: build

# Build every standalone program HTML into build/.
build: node_modules
	$(NODE) build.mjs

# Install the toolchain (esbuild) the first time.
node_modules: package.json
	$(NPM) install
	@touch node_modules

deps: node_modules

# Headless audio checks. Rebuilds first so the bundle test runs on fresh output.
check: build
	$(NODE) test/audio-check.mjs

# Render one engine to a listenable WAV: make wav ENGINE=chord
wav:
	$(NODE) test/render-wav.mjs $(ENGINE)

# Render the full 6-track starter pattern to build/preview-mix.wav
mix:
	$(NODE) test/render-mix.mjs

# Regenerate the favicon set from the two 512 masters. favicon.ico + the small
# tab PNGs come from the mark; apple-touch is an opaque 180 square from the icon
# (its transparent corners flattened onto the tile colour, since iOS rounds it).
icons:
	$(CONVERT) $(MARK_MASTER) -define icon:auto-resize=48,32,16 docs/favicon.ico
	$(CONVERT) $(MARK_MASTER) -resize 32x32 -colors 64 +dither -strip PNG8:docs/favicon-32.png
	$(CONVERT) $(MARK_MASTER) -resize 16x16 -colors 64 +dither -strip PNG8:docs/favicon-16.png
	$(CONVERT) $(ICON_MASTER) -background '#141d29' -flatten -resize 180x180 \
		-colors 256 +dither PNG24:docs/apple-touch-icon.png
	$(OPTIPNG) -quiet -o7 -strip all docs/favicon-16.png docs/favicon-32.png docs/apple-touch-icon.png

clean:
	rm -rf build
