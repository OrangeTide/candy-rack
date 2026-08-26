# PUBLIC DOMAIN (CC0-1.0)
# This Makefile has no copyright. See https://creativecommons.org/publicdomain/zero/1.0/

NPM ?= npm
NODE ?= $(shell command -v node 2>/dev/null || echo node)

PROGRAMS := rack
OUT := $(patsubst %,build/%.html,$(PROGRAMS))

ENGINE ?= fm2

.PHONY: all build clean deps check wav

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

clean:
	rm -rf build
