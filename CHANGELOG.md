## Version 0.2.0
- Experimental support for mapping variable names from source maps
- Passing executable and script through 'arg' to fully simulate standard environment
- Using function environments instead of '_G' when evaluating expressions
- Added 'scriptRoots' option for enviornments with custom loaders
- Removed 'sourceRoot' option
- Addressed output being delayed under some circumstances
- Other small bug fixes

## Version 0.1.10
- Fixed breakpoints set on first line of code
- Fixed handling of null bytes in strings
- Preventing false error break when `debug.traceback` is called by lua scripts
- Various other small bug fixes

## Version 0.1.9
- Fixed issue with tables that have custom len operator
- Fixed passing `arg` to files being debugged

## Version 0.1.8
- Suppport for debugging threads not created by coroutine.creae/wrap (fixes torch luajit)
- Fixed infinite recursion when debugger assert fails

## Version 0.1.7
- Fixed issues with finding source maps when environment supplies only filenames
- Updated some npm packages for security vulnerabilities

## Version 0.1.6
- Fixed issues with output parsing, including hangups and incorrect newlines
- Fixed issues with paths in source maps

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
