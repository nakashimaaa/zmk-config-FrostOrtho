# Zephyr Bluetooth backports

These patches are applied after `west update` by the GitHub Actions build.
They address a reproducible nRF52840 split-central crash in
`lll_prepare_resolve()` caused by the Bluetooth prepare pipeline filling up.

The failure was captured twice on FrostOrtho with matching UF2 and ELF files:

- after 23 h 03 m 32 s;
- after 2 d 23 h 27 m.

Both incidents failed at `LL_ASSERT(next)` after `ull_prepare_enqueue()`
returned `NULL`.

Backported fixes:

- `355648a69f51`: reset the radio timer status from `radio_disable()`;
- `10ba6d0cb38b`: cancel unexchanged connection events instead of retaining
  them in the prepare pipeline.

The Actions workflow checks each patch before applying it and removes the
patches from the cached Zephyr checkout after the build.

