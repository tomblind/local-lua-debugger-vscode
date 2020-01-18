## Version 0.1.5
Fixed path formatting on windows when custom lua interpreter uses forward slashes

## Version 0.1.4
Fixed issues with package search paths
- Default lua paths are now correctly retained when `LUA_PATH` is not set
- Correctly handling version-specific `LUA_PATH` environment variables (`LUA_PATH_5_2`, etc...)

## Version 0.1.3
Fix for attempting to debug builtin functions in luajit

## Version 0.1.2
Fix for empty source mappings

## Version 0.1.1
Fixed installation from marketplace

## Version 0.1.0
Initial release
