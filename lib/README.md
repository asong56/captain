# Captain — lib/

## kdbxweb (required for password vault)

Captain's vault module requires `kdbxweb` to parse and encrypt `.kdbx` files.

### Setup

```bash
npm install kdbxweb
# Then copy/bundle the UMD build:
cp node_modules/kdbxweb/dist/kdbxweb.js lib/kdbxweb.js
```

Or download directly:
https://github.com/keeweb/kdbxweb/releases

The file should be placed at `lib/kdbxweb.js` inside the extension directory.
Captain loads it lazily — the vault module simply won't unlock if this file is absent.
Everything else in Captain works fine without it.

## Size note

- kdbxweb minified: ~85 KB
- Everything else in Captain: ~145 KB
- Total with vault: ~230 KB
