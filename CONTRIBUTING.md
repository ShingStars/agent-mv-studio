# Contributing

Thanks for looking. This repository is deliberately small: one engine, two styles,
one compiler, one render path. Contributions that keep it small are welcome.

## Before you start

- Read `docs/METHODOLOGY.md` and `docs/AGENTS.md`.
- Run `pnpm install && pnpm run build && pnpm test`.
- `node dist/cli.js doctor` must pass on your machine.

## What we accept

1. **Bug fixes** with a failing reproduction (command + expected/actual).
2. **New scenes inside an existing style** that follow that style's bible.
3. **Docs fixes** — especially places where a new user got stuck.
4. **QC tools** that make verification cheaper than generation.
5. **New styles** only as a self-contained `src/styles/<name>/` with a style bible
   and a 29-second demo; do not fork the engine.

## What we do not accept

- Copied assets, screenshots, fonts or code from the reference works.
- `Math.random()` / `Date.now()` in scenes; non-deterministic output.
- Hard-coded seconds without a `why` and a measurement.
- A new dependency that is not needed by the render path.
- Generated MP4s in `examples/*/out/` (use `docs/media/` for small previews).

## Adding a scene

1. Implement a pure `SceneFn` in the style's `scenes.ts`; register it.
2. Add the scene to the style bible (`docs/STYLE_*.md`) with params and a rule.
3. Add one demo shot that uses it, with a `moment`.
4. Render a still and a strip; check readability at 100% and at 25%.
5. Run `node tools/qc.mjs flash` on the new segment.

## Commit format

```text
<area>: <what changed>

Why:
- ...

Verification:
- <command> → <result>

Known gaps:
- ...
```

## License

By contributing you agree your code is MIT and your generated demo assets may be
distributed under the same license as this repository.
