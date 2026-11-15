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

- Press `=` again to repeat the last operation: `2 + 3 = =` gives `8`.
- With `+` or `−`, percent is a part of the first number: `200 + 10 % =` gives `220`.
- The history shows the last 20 results. Select a result to use it again. The browser keeps the history.

## Files

- `index.html` — page, styles, and input handling
- `calculator.js` — calculator logic, with no DOM access
- `test/calculator.test.js` — tests for the logic

## Test

Node.js 18 or later is necessary.

```
npm test
```
