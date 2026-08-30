/**
 * Typed-cast helpers for supertest response bodies, used across
 * `routes/*.test.ts`/`app.test.ts`. supertest's `Response.body` is typed
 * `any` (it does not know the route's response shape), which trips
 * `@typescript-eslint/no-unsafe-member-access` under this repo's
 * `recommendedTypeChecked` ESLint config on every `response.body.foo`
 * access. `asJson<T>` performs one explicit, visible cast per response
 * (matching the route's real `@sift/contracts` response schema) instead of
 * scattering `// eslint-disable` comments through every test.
 */
export function asJson<T>(body: unknown): T {
  return body as T;
}
