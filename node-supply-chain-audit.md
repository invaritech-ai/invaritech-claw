# Node Repo Supply-Chain Audit

Scope: /Users/avi/Documents/Projects

This file tracks every git repo with a package.json under the scan root and records the pnpm supply-chain settings I checked in package.json, .npmrc, and pnpm-workspace.yaml.

## Reading Key

- partial: pnpm repo, but one or more recommended pnpm hardening settings are missing.
- non-pnpm: npm/yarn package manager; pnpm hardening controls do not apply directly.
- mixed: more than one Node surface or package-manager family in the same repo; review each subproject separately.
- needs review: package.json exists, but the repo has no lockfile or a mixed/unclear package-manager setup.

## Summary

- Total repos: 39
- pnpm: 12
- npm: 23
- yarn: 1
- bun: 0
- mixed: 2
- unknown: 0
- pnpm repos with packageManager pinned: 3
- pnpm repos without packageManager pin: 9
- pnpm repos with any hardening beyond a plain lockfile: 4
- pnpm repos with minimumReleaseAge: 2
- pnpm repos with build allowlists: 2
- pnpm repos with trustPolicy: 1
- pnpm repos with blockExoticSubdeps: 1

## Inventory

| Repo                                                   | PM    | Lockfiles                                        | Key settings checked                                                                                                                                                         | Assessment   |
| ------------------------------------------------------ | ----- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| AI/DocuChat/frontend                                   | pnpm  | pnpm-lock.yaml                                   | packageManager=absent; minAge=none; onlyBuilt=no; ignoredBuilt=no; trustPolicy=none; blockExoticSubdeps=none                                                                 | partial      |
| AI/Prospect_shortlisting                               | mixed | none at root; Node frontend in apps/web          | root is Python; Node surface lives in apps/web (package-lock.json, no packageManager pin, npm ci runs install scripts via esbuild/fsevents)                                  | needs review |
| AI/Support-portal-demo                                 | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| AI/ai-demo                                             | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| AI/doc-process/document_processing_application         | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| AI/doc-process/universal_agent/frontend                | pnpm  | pnpm-lock.yaml                                   | packageManager=absent; minAge=none; onlyBuilt=no; ignoredBuilt=no; trustPolicy=none; blockExoticSubdeps=none                                                                 | partial      |
| AI/docuflow                                            | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| AI/exception-resolver                                  | pnpm  | pnpm-lock.yaml                                   | packageManager=pnpm@10.7.0; minAge=none; onlyBuilt=no; ignoredBuilt=yes; trustPolicy=none; blockExoticSubdeps=none                                                           | partial      |
| AI/greenpack                                           | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| AI/invaritech-claw                                     | pnpm  | pnpm-lock.yaml                                   | packageManager=pnpm@10.33.0; minAge=2880; onlyBuilt=yes; ignoredBuilt=yes; trustPolicy=none; blockExoticSubdeps=none                                                         | partial      |
| AI/livekit-nextjs                                      | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| AI/loyaltyprogramme                                    | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| AI/physio-whatsapp-frontend                            | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| AI/resto-pilot-frontend                                | pnpm  | pnpm-lock.yaml                                   | packageManager=absent; minAge=none; onlyBuilt=no; ignoredBuilt=no; trustPolicy=none; blockExoticSubdeps=none                                                                 | partial      |
| AI/restopilot-admin-panel                              | pnpm  | pnpm-lock.yaml                                   | packageManager=absent; minAge=none; onlyBuilt=no; ignoredBuilt=yes; trustPolicy=none; blockExoticSubdeps=none                                                                | partial      |
| AI/tsunami-advisors                                    | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| AI/tsunami-advisors/chat-pdf-app                       | pnpm  | pnpm-lock.yaml                                   | packageManager=absent; minAge=none; onlyBuilt=no; ignoredBuilt=no; trustPolicy=none; blockExoticSubdeps=none                                                                 | partial      |
| AI/venturebuilder                                      | pnpm  | pnpm-lock.yaml                                   | packageManager=absent; minAge=none; onlyBuilt=no; ignoredBuilt=no; trustPolicy=none; blockExoticSubdeps=none                                                                 | partial      |
| Games/ticket_to_ride_clone                             | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| Neil/Rubric                                            | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| Neil/tango                                             | pnpm  | pnpm-lock.yaml                                   | packageManager=absent; minAge=none; onlyBuilt=no; ignoredBuilt=no; trustPolicy=none; blockExoticSubdeps=none                                                                 | partial      |
| Webdev/CCC-redesign                                    | pnpm  | pnpm-lock.yaml                                   | packageManager=pnpm@11.1.1; minAge=1440; blockExoticSubdeps=yes; trustPolicy=no-downgrade; allowBuilds=@swc/core, esbuild                                                    | partial      |
| Webdev/SpaceInvaders                                   | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| Webdev/aihk-report-leadgen                             | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| Webdev/ccc/studio-ccc-redesign                         | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| Webdev/directory-coffee                                | mixed | none at root; pnpm-lock.yaml in web/             | root is Python; Node surface lives in web (packageManager=pnpm@11.1.1; minAge=1440; blockExoticSubdeps=yes; allowBuilds=esbuild/sharp; ignoredOptionalDependencies=fsevents) | partial      |
| Webdev/gic-website                                     | pnpm  | pnpm-lock.yaml                                   | packageManager=absent; minAge=none; onlyBuilt=no; ignoredBuilt=no; trustPolicy=none; blockExoticSubdeps=none                                                                 | partial      |
| Webdev/invaritech-visionary-launch                     | pnpm  | pnpm-lock.yaml                                   | packageManager=absent; minAge=none; onlyBuilt=no; ignoredBuilt=no; trustPolicy=none; blockExoticSubdeps=none                                                                 | partial      |
| Webdev/invaritech-visionary-launch/api-server          | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| Webdev/robert-wrapped-punk/api-server                  | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| Webdev/robert-wrapped-punk/web-app                     | yarn  | yarn.lock                                        | packageManager=absent; lockfile=yarn.lock                                                                                                                                    | non-pnpm     |
| Webdev/robert-wrapped-punk/wrappedpunks-api-emergency  | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| Webdev/robert-wrapped-punk/wrappedpunks-api-production | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| Webdev/workout_tracker_app                             | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| fire-erp                                               | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| movement-admin                                         | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| notion-server                                          | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| options-dashboard/frontend                             | npm   | package-lock.json                                | packageManager=absent; lockfiles=package-lock.json                                                                                                                           | non-pnpm     |
| whisper.cpp                                            | mixed | package.json in examples/addon.node; no lockfile | root is C++/Python, but examples/addon.node is a Node addon demo with npm install docs and no packageManager pin                                                             | needs review |

## Quick Readout

- The strongest pnpm configs I found are in AI/invaritech-claw and Webdev/CCC-redesign. Both have minimumReleaseAge and build allowlists, and CCC-redesign also has blockExoticSubdeps and trustPolicy.
- I now found trustPolicy and blockExoticSubdeps in Webdev/CCC-redesign.
- The repos without any lockfile or package-manager pin need manual review first.
- AI/Prospect_shortlisting is not a pure Node repo; the root is Python and the Node surface is apps/web.
- Webdev/directory-coffee is another mixed Python/Node repo; the Node surface is web/, and it is now pinned to pnpm 11.1.1 with build allowlists and release-age hardening.
- whisper.cpp is mixed as well: the Node addon demo lives under examples/addon.node and still relies on npm install / npx cmake-js compile.
- Webdev/CCC-redesign has been migrated to pnpm 11.1.1 with a single pnpm lockfile and v11 hardening.

## Prospect_shortlisting Detail

Scope: `AI/Prospect_shortlisting/apps/web`

Assessment: `needs review`

Findings:

- The documented and deployed install paths execute lifecycle scripts. `README.md:50` tells you to run `npm ci`, `apps/web/Dockerfile:10` runs `npm ci --no-audit --no-fund`, and `apps/web/nixpacks.toml:21` runs `npm ci` with no script suppression.
- The lockfile contains install-script packages. `apps/web/package-lock.json:2584-2590` marks `esbuild@0.25.12` with `hasInstallScript: true`, and `apps/web/package-lock.json:2939-2946` marks `fsevents@2.3.3` with `hasInstallScript: true`.
- `esbuild` is the important exposure here. It is a build-time dependency, but it executes code during install, so a compromised registry package or tampered lockfile can run code in the build environment.
- `fsevents` is optional and mac-only, so it is lower risk than `esbuild`, but it still proves install scripts are allowed in the frontend dependency tree.
- The frontend does not pin a package manager version and does not carry a `.npmrc` hardening file. `apps/web/package.json:1-36` is a plain npm project with no `packageManager` field.
- The lockfile is otherwise well-formed: version 3, integrity fields are present, and there are no git/file/http dependencies in the lockfile.

Interpretation:

- This is not a “malicious package name” problem.
- This is an install-script exposure problem. The repository is relying on npm’s normal install behavior, which permits dependency scripts during `npm ci`.
- If you want to reduce risk further, the next thing to evaluate is whether the build can isolate or eliminate install scripts, or whether the build environment itself is trusted enough that this exposure is acceptable.

## directory-coffee Detail

Scope: `Webdev/directory-coffee/web`

Assessment: `partial`

Findings:

- The frontend is now pinned to pnpm 11.1.1. `web/package.json:1-28` has `packageManager: pnpm@11.1.1`.
- The install docs now use pnpm, and the test script now uses the local `tsx` binary. `web/README.md:1-18` says to run `pnpm install` and `pnpm run dev`, and `web/package.json:7-15` uses `tsx --test ...` instead of `npx --yes tsx`.
- The old npm lockfile was removed. `web/package-lock.json` is gone, and `web/pnpm-lock.yaml` is now the single lockfile for the frontend.
- The workspace hardening file now sets `minimumReleaseAge: 1440`, `blockExoticSubdeps: true`, `ignoredOptionalDependencies: fsevents`, and an `allowBuilds` map that explicitly allows `esbuild` and `sharp`.
- `corepack pnpm install --frozen-lockfile` succeeded on pnpm 11.1.1.
- `corepack pnpm run build` succeeded on Next 15.5.18.
- `corepack pnpm run test` succeeded.
- `corepack pnpm run lint` succeeded, with a deprecation notice that `next lint` will be removed in Next 16.

Interpretation:

- The frontend migration is complete.
- The remaining follow-up here is optional toolchain cleanup, mainly replacing `next lint` with the ESLint CLI in a later pass if you want to get ahead of the Next 16 removal.

## CCC-redesign Detail

Scope: `Webdev/CCC-redesign`

Assessment: `partial`

Findings:

- The repo is now pinned to pnpm 11.1.1. `package.json:1-97` has `packageManager: pnpm@11.1.1`.
- The install docs and deployment config now use pnpm. `README.md:57-60`, `README.md:75`, `README.md:82-86`, and `README.md:132` now say `pnpm`, `RESEND_SETUP.md:94-104` now says `pnpm install`, and `vercel.json:2` now builds with `pnpm run build`.
- The old npm/bun lockfiles were removed. `package-lock.json` and `bun.lockb` are gone, and `pnpm-lock.yaml` is now the single lockfile.
- The repo now has v11 hardening in `pnpm-workspace.yaml:1-8`. It sets `minimumReleaseAge: 1440`, `blockExoticSubdeps: true`, `trustPolicy: no-downgrade`, and an `allowBuilds` map that explicitly allows `@swc/core` and `esbuild`.
- `corepack pnpm install --frozen-lockfile` succeeded on pnpm 11.1.1.
- `corepack pnpm run build` succeeded.
- `corepack pnpm run lint` still fails, but the failures are pre-existing repo issues unrelated to the migration: widespread `any` usage, a few empty blocks, one `no-require-imports` hit, and some React-refresh warnings.

Interpretation:

- The package-manager migration is complete.
- The remaining work here is code-quality debt, not supply-chain migration debt.

## whisper.cpp Detail

Scope: `whisper.cpp/examples/addon.node`

Assessment: `needs review`

Findings:

- The repo root is not a Node project, but the addon demo is. `examples/addon.node/package.json:1-15` defines a bare npm package with devDependencies and no `packageManager` pin, and there is no lockfile under `examples/addon.node`.
- The documented install path is `npm install` (`examples/addon.node/README.md:6-10`), and the build path uses `npx cmake-js compile` (`examples/addon.node/README.md:12-18`). That means the demo is still relying on npm semantics and an on-demand CLI path instead of a frozen package-manager workflow.
- Because there is no lockfile, the addon demo is not reproducible yet. If you want to migrate this surface to pnpm later, this is the first gap to close before you worry about pnpm hardening knobs.

Interpretation:

- This is a smaller issue than the frontend-heavy repos, but it is still a real Node surface with no lockfile or package-manager pin.
- The addon demo can probably move to pnpm without much drama once you decide whether `cmake-js` should be a pinned dev tool, an explicit `pnpm exec` call, or a separate bootstrap step.
