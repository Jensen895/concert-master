# Concert Master backend

This is the HTTP boundary for analysis and text-input planning. It has no third-party runtime dependencies and deliberately contains no provider implementation yet.

```sh
npm test
npm start
```

The development server listens on `127.0.0.1:8787` by default. Set `HOST` or `PORT` to override it.

Feature handlers return `501 NOT_IMPLEMENTED`. Keep raw profile data, especially government IDs, out of these endpoints; profile resolution and text insertion belong on the Mac.

