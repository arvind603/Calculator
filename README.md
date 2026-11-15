# Calculator

A calculator that runs in the browser. It has no dependencies and no build step.

## Use

Open `index.html` in a browser.

| Key | Function |
|---|---|
| `0`–`9`, `.` | Enter a number |
| `+` `-` `*` `/` | Operator |
| `Enter` or `=` | Result |
| `%` | Percent |
| `Backspace` | Delete the last digit |
| `Escape` | Clear |

Operations run from left to right: `2 + 3 × 4 =` gives `20`.

## Files

- `index.html` — page, styles, and input handling
- `calculator.js` — calculator logic, with no DOM access
- `test/calculator.test.js` — tests for the logic

## Test

Node.js 18 or later is necessary.

```
npm test
```
