# Third-party components

The Windows x64 and macOS Apple Silicon graphics runtimes distributed with FableScript contain:

- CPython 3.13.14 in the Windows package and CPython 3.13.16 from Python Build Standalone in the macOS package. The complete Python license is stored inside each Python runtime. Source and license information: https://www.python.org/ and https://github.com/astral-sh/python-build-standalone
- Pygame 2.6.1 and its binary dependencies. Pygame is distributed under the GNU LGPL; its source and license information are available at https://github.com/pygame/pygame/tree/2.6.1 and https://www.pygame.org/docs/LGPL.html.

These components are unmodified and loaded as separate runtime libraries.
