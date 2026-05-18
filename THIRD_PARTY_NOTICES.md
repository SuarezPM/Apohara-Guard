# Third-party notices

Apohara Guard incorporates patterns, snippets, or full ports from the
following third-party projects. Their licenses are reproduced or linked
below.

---

## RAPTOR — Runtime Audit Pipeline Tool for Outbound Requests

- Upstream: <https://github.com/gadievron/raptor>
- License: MIT
- Used in: `src/sandbox/index.ts` — the 5-layer kernel sandbox
  pattern (mount-ns + user-ns + Landlock + seccomp + RLIMIT_AS) is
  a TypeScript port of RAPTOR's
  `core/sandbox/{_spawn,landlock,seccomp,proxy}.py`.

### Upstream MIT license text

```
MIT License

Copyright (c) Gadi Evron and RAPTOR contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
