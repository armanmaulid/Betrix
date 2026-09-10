# Phase 9 — Decommission Legacy Stack and Production Cutover

## Objective
Remove obsolete infrastructure only after migration evidence is complete.

## Candidates for removal
Remove only after source search proves no active references:
- Express
- Passport
- tsyringe
- custom session repository/Redis auth session logic
- legacy custom route registration
- legacy validation middleware
- custom error middleware replaced by Nest filter
- custom migration runner
- fixed ModelPolicy pricing constants
- obsolete env model tier variables
- interval-based distributed jobs replaced by BullMQ
- duplicated DB repositories

## Dependency cleanup procedure
For each dependency:
1. global repository search;
2. identify direct and transitive use;
3. remove imports/code;
4. run tests/build/lint;
5. remove package;
6. run package manager install/lockfile update;
7. verify production build.

Do not remove a dependency merely because the new architecture normally does not need it.

## API version lifecycle
Document:
- supported versions
- release dates
- deprecation dates
- sunset dates
- migration guide per breaking version

When V2 replaces V1:
1. release V2;
2. keep V1 during migration window;
3. instrument V1 usage;
4. communicate deprecation;
5. remove V1 only after agreed sunset criteria are met.

## Cutover checklist
- [ ] DB backup/snapshot exists.
- [ ] Migration is reversible or forward-recovery procedure is tested.
- [ ] Auth rollback plan exists.
- [ ] Billing reconciliation baseline exists.
- [ ] LLM provider/model registry backup exists.
- [ ] API version compatibility verified.
- [ ] Health/readiness verified.
- [ ] Background workers verified.
- [ ] Metrics/log alerts verified.
- [ ] Error rate and latency baseline compared.
- [ ] Frontend compatibility verified.
- [ ] Rollback owner and procedure documented.

## Post-cutover validation
Monitor:
- 4xx/5xx rate
- latency
- auth failures
- provider failures
- token usage anomalies
- billing reconciliation differences
- queue depth/failures
- DB latency/errors
- Redis errors
- MT5 connection state

## Acceptance criteria
- [ ] Legacy stack is no longer reachable from production paths.
- [ ] Unused dependencies removed.
- [ ] No duplicate authority remains for auth, billing, model selection, migrations or job scheduling.
- [ ] Version lifecycle is documented.
- [ ] Production cutover and rollback are rehearsed.
