# DYA Studio configuration workflow

This directory stores configuration snapshots exported through Keyboard Abyss.
The files here are backups and are not compiled directly into the firmware.

## Normal workflow

1. Edit the keymap, macros, combos, and pointing-device settings in DYA Studio.
2. Save the changes to the keyboard.
3. Export both `KeyboardHubKeymap v1` and `ZMK .keymap` from Keyboard Abyss.
4. Store both files in a dated directory under `dya/exports/`.
5. Review the export and copy supported values into the firmware defaults.
6. Build with GitHub Actions and flash only when the firmware defaults need updating.

## Important

- Do not replace `config/FrostOrtho.keymap` with the generated `.keymap` file.
  The generated file does not contain the board includes, sensor bindings, or
  FrostOrtho-specific behavior definitions required by the firmware.
- DYA Studio settings saved on the keyboard override firmware defaults.
- A settings reset removes Bluetooth pairings and saved DYA Studio settings.
  Export a backup before using the reset firmware.
- Keep hardware definitions, split settings, sensor drivers, and Bluetooth
  configuration in the regular ZMK source files.

The `2026-09-12-pre-runtime-migration` snapshot was exported before the runtime
combo and macro defaults were flashed. It is retained as a recovery reference.
