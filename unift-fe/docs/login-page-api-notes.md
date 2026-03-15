# Legacy LoginPage API Notes

Before replacing `src/pages/LoginPage.tsx`, the page depended on these auth calls:

- `POST /auth/login` via `useAuth.login(formData)` with a JSON body shaped like `{ "username": string, "password": string }`.
- The login response was expected to include `access_token` and `refresh_token`, which were then persisted and followed by a redirect to `?page=home`.

Related auth behavior used by the same flow, but implemented outside the page:

- `POST /auth/logout` via `useAuth.logout()`.
- Any API `401` response in `src/utils/apiClient.ts` cleared stored tokens and redirected the user back to `?page=login`.

There was no account-creation request inside the legacy `LoginPage.tsx`.
