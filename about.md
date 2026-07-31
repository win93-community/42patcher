# 42patcher

42patcher is a tool for managing and applying patches to your system.  
Think of it as a feature flags manager.  
*Be cautious when using this tool, as it modifies system files and may break your system.*

## known quirks

- 42patcher stores info in ~/config. If you mess with the files, you may lose your ability to disable patches.
- reinstalling while patches are enabled may break your system.
- updating the patchlist while patches are enabled may break your system (if patches get removed, etc).

## config

- `~/config/42patcher.json5` - stores the patch state (enabled/disabled)
- `~/config/42patcher-patches.json5` - stores the downloaded patchlist
- `~/config/42patcher/backups` - stores original unmodified files for patches that are applied