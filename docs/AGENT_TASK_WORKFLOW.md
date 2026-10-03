# ClaimBack agent task workflow

This protocol applies to both people and any coding agent working for them. It
implements the ownership split in `docs/TASKS.md`; it does not change the frozen
product or architecture.

## Where tasks live

- Repository: `sahil1330/claimback`.
- GitHub Project: <https://github.com/users/sahil1330/projects/4>.
- Every task is a repository issue, assigned to exactly one of `sahil1330`
  (Person A: backend, AI, Supabase) or `harsh-gupta-10` (Person B: product UI,
  design). Add the issue to Project #4. A project draft item alone is not enough:
  the repository issue is the durable record for discussion, code, and PRs.
- The initial assigned issues are the implementation backlog. Do not create a
  second issue for work already covered by one of them.

## Before any task or scope change

1. Read `AGENTS.md` and the required docs in its stated order. Then read the
   relevant issue, its linked dependencies, and the latest comments/PRs.
2. Search open and closed repository issues and Project #4 for the same outcome.
   Continue the existing issue if one exists.
3. If the work is genuinely new, create a repository issue **before editing**.
   Give it one owner, priority (`P0` golden path or `P1` optional), an outcome,
   acceptance criteria, likely files, dependencies, and validation steps. Add
   it to Project #4 and set its status to **In Progress** only when work starts.
4. If project access is temporarily unavailable, still create and assign the
   repository issue, comment that Project #4 linking is pending, and link it as
   soon as access is restored. Do not make an untracked local to-do list or a
   duplicate project draft item.
5. Check whether another active issue or PR touches the same files. Agree on a
   handoff in both issues before changing shared files.

## File ownership and handoffs

| Person A — `sahil1330` | Person B — `harsh-gupta-10` |
| --- | --- |
| `src/lib/**`, `src/app/api/**`, `supabase/**`, server auth, reconciliation, AI, tests and evaluation | `src/components/**`, product and marketing pages, receiving/case/dashboard/supplier UI |
| `package.json` and lockfile after bootstrap, `.env.example`, `proxy.ts`, `src/types/domain.ts` | `src/app/layout.tsx`, `src/app/globals.css`, `components.json` |

Person A publishes stable domain types and API payloads early. Person B uses
fixtures matching those contracts until real data is integrated. Changes across
the ownership boundary need a short agreement in the issue, including which
person edits the shared file. Keep one active editor per shared file. Use a
separate branch/PR per issue and reference the issue number in the PR.

## Progress and completion

- Update the issue and Project status at each checkpoint in
  `docs/IMPLEMENTATION_PLAN.md`. Record changed contracts and blockers in the
  issue, not only in chat.
- Keep P0 work ahead of P1 polish. Do not start optional voice/animation work
  while a golden-path checkpoint is failing.
- Before marking an issue done, meet its acceptance criteria and run the
  applicable `pnpm typecheck` and `pnpm test` checks. At integration milestones,
  manually verify the golden-path screen. Before feature freeze, run `pnpm lint`,
  `pnpm typecheck`, `pnpm test`, and `pnpm build` as required by `AGENTS.md`.
- Link the PR, mention the tests run and any remaining risk, then close the
  issue and move the Project item to **Done**. If acceptance is incomplete,
  leave the issue open and say exactly what remains.
