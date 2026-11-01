export const meta = {
  name: 'implement-milestone',
  description: 'Implement one SPEC §12 milestone of Team Working OS with parallel specialist agents, integration gates, adversarial review and close-out',
  whenToUse: 'When the previous milestone is ✅ in PROGRESS.md and the tree is clean. Invoke: Workflow({ name: "implement-milestone", args: { milestone: 3 } }). Optional args: maxFixRounds (default 3), skipReview (default false).',
  phases: [
    { title: 'Kickoff', detail: 'preflight, read plan/mNN, write the milestone checklist into PROGRESS.md' },
    { title: 'Contracts', detail: 'stream S0 alone: dependencies, schema + migrations, shared contracts, i18n keys, stubs' },
    { title: 'Build', detail: 'remaining streams in dependency order, parallel where the DAG allows' },
    { title: 'Integrate', detail: 'apply cross-stream requests; pnpm check + full e2e until green' },
    { title: 'Review', detail: 'six lens reviewers (incl. visual QA on the running app); every finding adversarially verified' },
    { title: 'Fix', detail: 'owners fix confirmed findings; gates re-run' },
    { title: 'Close', detail: 'PROGRESS.md, final gates, commit feat(mN) + tag' },
  ],
}

// ───────────────────────── parameters ─────────────────────────
// Milestone order (SPEC §12). M6.1 and M7.1 are catch-up milestones (SPEC v3.2, v3.3).
const ORDER = ['0', '1', '2', '3', '4', '5', '6', '6.1', '7', '7.1', '8', '9', '10', '11', '12']
const KEY = String(args && args.milestone)
const IDX = ORDER.indexOf(KEY)
if (IDX < 0) throw new Error('args.milestone must be one of ' + ORDER.join(', '))
const N = Number(KEY)
const PREV = IDX > 0 ? ORDER[IDX - 1] : null
const NEXT = IDX < ORDER.length - 1 ? ORDER[IDX + 1] : null
const MAX_FIX_ROUNDS = (args && Number(args.maxFixRounds)) || 2 // owner 2026-11-01: 2 rounds (time/tokens)
const REVIEW_MODEL = (args && args.reviewModel) || 'sonnet' // reviewers + skeptics; builders/integrator inherit the session model
const SKIP_REVIEW = Boolean(args && args.skipReview)
const NN = KEY.split('.')[0].padStart(2, '0') + (KEY.includes('.') ? '.' + KEY.split('.')[1] : '') // '06.1'
const MID = 'M' + KEY
const TAG = 'm' + KEY
const PREV_TAG = PREV !== null ? 'm' + PREV : null

const AGENT_TYPES = [
  'domain-engineer', 'backend-engineer', 'frontend-engineer', 'grid-engineer',
  'editor-engineer', 'test-engineer', 'platform-engineer',
]

// ───────────────────────── schemas ─────────────────────────
const STREAM_DEF = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    agent: { type: 'string' },
    owns: { type: 'array', items: { type: 'string' } },
    dependsOn: { type: 'array', items: { type: 'string' } },
    planSection: { type: 'string' },
  },
  required: ['id', 'title', 'agent', 'owns', 'dependsOn', 'planSection'],
}

const KICKOFF_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    blockers: { type: 'array', items: { type: 'string' } },
    planFile: { type: 'string' },
    streams: { type: 'array', items: STREAM_DEF },
    e2eSpecs: { type: 'array', items: { type: 'string' } },
    decisionsCopied: { type: 'integer' },
  },
  required: ['ok', 'blockers', 'planFile', 'streams', 'e2eSpecs'],
}

const STREAM_RESULT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    testsAdded: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string' },
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { ref: { type: 'string' }, decision: { type: 'string' }, reason: { type: 'string' } },
        required: ['ref', 'decision', 'reason'],
      },
    },
    requests: {
      type: 'array',
      items: {
        type: 'object',
        properties: { path: { type: 'string' }, change: { type: 'string' }, owner: { type: 'string' } },
        required: ['path', 'change'],
      },
    },
    openIssues: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'summary', 'filesChanged', 'decisions', 'requests', 'openIssues'],
}

const GATE_SCHEMA = {
  type: 'object',
  properties: {
    green: { type: 'boolean' },
    check: { type: 'string' },
    e2e: { type: 'string' },
    fixesApplied: { type: 'array', items: { type: 'string' } },
    remaining: { type: 'array', items: { type: 'string' } },
  },
  required: ['green', 'check', 'e2e', 'fixesApplied', 'remaining'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          file: { type: 'string' },
          line: { type: 'integer' },
          rule: { type: 'string' },
          problem: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'file', 'rule', 'problem', 'evidence', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['refuted', 'reason'],
}

const CLOSE_SCHEMA = {
  type: 'object',
  properties: {
    committed: { type: 'boolean' },
    commit: { type: 'string' },
    tag: { type: 'string' },
    progressUpdated: { type: 'boolean' },
    summary: { type: 'string' },
    followUps: { type: 'array', items: { type: 'string' } },
  },
  required: ['committed', 'progressUpdated', 'summary', 'followUps'],
}

const LENSES = [
  {
    key: 'scope',
    desc: 'SPEC/AC coverage and scope — every FR/BR/AC the milestone plan lists is implemented and has a passing test; nothing from later milestones, SPEC §13 or §1.4 was built; decisions in plan §3 were followed.',
  },
  {
    key: 'authz',
    desc: 'Authorization, masking and security — every server action and route handler calls src/server/authz.ts before touching data; invisible resources → 404; §3.3 masking is server-side (no hidden project/task names or leave details in payloads); file upload/download rules §7.6; restore* re-checks permissions and the 30-day window; no secrets or server modules in client bundles.',
  },
  {
    key: 'rules',
    desc: 'CLAUDE.md hard rules — Thai text only in src/i18n/**; no confirm dialogs except permanent project delete (undo toast 8 s + Cmd+Z instead); integer cd math only; ISODate strings, no JS Date for plan dates; week_start range on every allocations query; one transaction per multi-table write with audit inside it; DELETE-before-INSERT for WEEK↔DAY; src/domain purity; no localStorage for data; no runtime CDN; no any/@ts-ignore/eslint-disable without a reason comment; schema only via schema.ts + generated migrations.',
  },
  {
    key: 'tests',
    desc: 'Test adequacy — each AC of this milestone maps to a passing automated test; every new action/route has authz-matrix rows for M, L, Me, W (mutating allow cases assert audit rows); property tests for §5.3 invariants where relevant; golden fixtures where required; e2e specs of this and all previous milestones exist and assert real outcomes (not tautologies).',
  },
  {
    key: 'visual',
    desc: `Visual and responsive QA on the RUNNING app — code reading alone missed real layout bugs (owner feedback 2026-11-01). Steps: (1) pnpm db:up; pnpm seed:golden is NOT allowed (it wipes the owner's dev data) — use the existing dev DB; log in as manager@example.com / demo1234 and as a worker (ivy@example.com / demo1234). (2) Start your OWN server: pick a free port 3500–3599, run \`BETTER_AUTH_URL=http://localhost:<port> pnpm exec next dev -p <port>\` in the background, record its PID, and at the end kill ONLY that PID — never pkill/killall by pattern (a production server on :3300 must stay up). (3) With a Playwright script run via \`NODE_PATH=$PWD/node_modules node <script>\` (scripts in your scratchpad, not the repo), screenshot every route/screen this milestone added or changed, at 390×844, 768×1024, 1280×800, 1920×1080 and 2560×1440, in light and dark, sidebar expanded and collapsed; Read the images and look at them. (4) Check: no horizontal document scroll; nothing clipped/overlapping/off-screen; work screens use the full width after the sidebar on 1920/2560; documents use the centred reading column (and full-width toggle when built); phone scope of SPEC §9 Browser row works; dialogs/panels fit the viewport; text/controls follow the SPEC §8.12 token scale and AFFiNE-like style (SPEC §4.16, D19): light borderless forms, 48 px header bar with breadcrumb + actions, consistent spacing/typography, no cramped or misaligned controls, focus rings visible, state not by colour alone. (5) If AFFiNE is reachable at http://localhost:3010 (local workspace, no login needed), screenshot the comparable AFFiNE screen at the same widths and cite concrete differences. Each finding must cite the screenshot path, viewport, route, the element, the rule (SPEC id / §8.12 token / §4.16), and the file:line of the component responsible.`,
  },
  {
    key: 'ux',
    desc: 'UX and accessibility — P1 quick keyboard-first entry, P2 undo instead of confirm, P4 problems visible, state never by colour alone, ARIA roles (grid/tree/dialog), focus management and Esc behaviour, Thai formats (พ.ศ. dates, 1-decimal loads), loading/empty/error states, SPEC §8 layouts.',
  },
]

// ───────────────────────── helpers ─────────────────────────
function ownerFor(file) {
  const f = String(file || '')
  if (/^src\/domain\//.test(f)) return 'domain-engineer'
  if (/^src\/(components|lib)\/grid\//.test(f)) return 'grid-engineer'
  if (/^src\/(components|lib)\/editor\//.test(f)) return 'editor-engineer'
  if (/^(tests|e2e)\//.test(f)) return 'test-engineer'
  if (/^(src\/server|src\/app\/api|drizzle|scripts)\//.test(f)) return 'backend-engineer'
  if (/^docker\//.test(f) || /^[^/]+$/.test(f)) return 'platform-engineer'
  return 'frontend-engineer'
}

function findingKey(f) {
  return String(f.file) + '::' + String(f.rule).toLowerCase().slice(0, 80)
}

function short(list, n) {
  const arr = list || []
  return arr.length > n ? arr.slice(0, n).join(', ') + ` … (+${arr.length - n})` : arr.join(', ')
}

// ───────────────────────── Kickoff ─────────────────────────
phase('Kickoff')
const kickoff = await agent(
  `Kickoff of milestone ${MID} for Team Working OS. The repository root is the current working directory.

1. Preflight
   - Read PROGRESS.md. ${PREV !== null ? `M${PREV} must be ✅ — if not, stop (ok=false, blocker explains).` : 'This is M0; there is no previous milestone.'}
   - ${PREV !== null ? 'Run `git status --porcelain`: the tree must be clean (PROGRESS.md edits allowed). If not, stop and list the files.' : 'git may not be initialised yet (M0 does it). Check that node, npm and docker are available; pnpm may be missing (M0 S0 installs it).'}
   - ${PREV !== null ? 'Run `pnpm db:up` and confirm Postgres is healthy (docker compose ps / pg_isready inside the container).' : 'Confirm Docker is running (`docker info`).'}
2. Locate the plan file plan/m${NN}-*.md. Read it end-to-end and read PLAN.md §2 and §8 (plan-file format).
3. Extract the JSON block in section "## 4. Streams (machine-readable)". Validate: ids unique; "S0" exists and has no dependencies; every dependsOn id exists; no cycles; each owns list is non-empty; agent ∈ {${AGENT_TYPES.join(', ')}}. If invalid, stop (ok=false) and explain.
4. Update PROGRESS.md (and nothing else):
   - "Milestone ปัจจุบัน" → ${MID} and set its table row to 🟨.
   - Replace the body of "## แผนของ milestone ปัจจุบัน" with a checklist: one "- [ ]" line per stream (id · title · agent · plan section), then gates: "- [ ] pnpm check เขียว", one line per e2e spec, "- [ ] review panel", "- [ ] close-out (PROGRESS + commit)".
   - Copy the rows of the plan's "## 3. Decisions for this milestone" table into "## Decisions" (date = output of \`date +%F\`), skipping rows already present.
5. Return: ok, blockers, planFile (relative path), streams (exactly as in the JSON block), e2eSpecs (from the JSON block "e2e" array), decisionsCopied.`,
  { label: `${MID}:kickoff`, phase: 'Kickoff', schema: KICKOFF_SCHEMA },
)

if (!kickoff || !kickoff.ok) {
  return { milestone: MID, stoppedAt: 'kickoff', blockers: kickoff ? kickoff.blockers : ['kickoff agent failed'] }
}

const streams = kickoff.streams
const byId = {}
for (const s of streams) byId[s.id] = s
if (!byId.S0) return { milestone: MID, stoppedAt: 'kickoff', blockers: ['plan has no S0 stream'] }
log(`${MID}: ${streams.length} streams — ${streams.map(s => s.id + ':' + s.agent).join(', ')}`)

const results = {}

function upstreamSummary(s) {
  const ids = []
  for (const d of ['S0'].concat(s.dependsOn || [])) if (d !== s.id && ids.indexOf(d) === -1) ids.push(d)
  return ids
    .map(id => {
      const r = results[id]
      if (!r) return `- ${id}: (no result)`
      return `- ${id} [${r.status}]: ${r.summary}\n  files: ${short(r.filesChanged, 40)}`
    })
    .join('\n')
}

function streamPrompt(s) {
  const contracts =
    s.id === 'S0'
      ? `\nYou are the CONTRACTS stream and run alone before every other stream. Deliver every contract the plan lists for S0 (dependencies installed in one batch, schema + generated/custom migrations applied, shared types and zod schemas, action/route signatures with stub bodies, authz function signatures, i18n namespaces/keys, query keys, test helpers the plan assigns to S0). Leave the tree green: \`pnpm check\` must pass (stubs may throw a NotImplemented error but must type-check and must not be called by existing tests).\n`
      : ''
  return `You are stream ${s.id} — "${s.title}" — of milestone ${MID} of Team Working OS. The repository root is the current working directory.

Read, in order:
1. PLAN.md §2 (operating rules) and the §3/§4 subsections relevant to your role.
2. ${kickoff.planFile}: read ONLY sections 1–4 (goal, read-first, decisions, streams) and your own section "${s.planSection}" — not the other streams' sections — then execute your section step by step (in order, test-first where it says so).
3. Every SPEC.md section your plan section cites.
4. SPEC v3.2 (2026-11-01) added M6.1: tasks are documents (pages.kind 'TASK', /t/[taskId], tasks.notes removed), §8.12 token scale with an automated token-scale check, the 48 px PageHeaderBar on every screen, full-width work screens, light forms (SPEC §4.6.4, §4.16, §8.12). Where the plan predates this, SPEC wins: use the layout primitives in src/components/layout/** and tokens, add ↗ /t/ links on task rows, never reference tasks.notes. Also read PROGRESS.md › Known issues "forward notes" for ${MID}.
${contracts}
OWNERSHIP — you may create/modify ONLY: ${s.owns.join(', ')}
Everything else is read-only for you. Other streams may be running right now in the same working tree. If you need any change outside your ownership (a dependency, schema, an i18n key outside your namespace, another module's API, PROGRESS.md), do NOT make it — put it in "requests". Never run git commands that change state, never install packages, never run repo-wide formatters.

Upstream results:
${upstreamSummary(s) || '- none'}

When finished, run the verification commands from your agent instructions and from the plan section, then return your report. Do not commit.`
}

// ───────────────────────── Contracts (S0) ─────────────────────────
phase('Contracts')
results.S0 = await agent(streamPrompt(byId.S0), {
  label: `${MID}:S0`,
  phase: 'Contracts',
  agentType: AGENT_TYPES.indexOf(byId.S0.agent) >= 0 ? byId.S0.agent : undefined,
  schema: STREAM_RESULT,
})
if (!results.S0 || results.S0.status === 'blocked') {
  return { milestone: MID, stoppedAt: 'contracts', s0: results.S0 }
}

// ───────────────────────── Build (DAG, no global barrier) ─────────────────────────
phase('Build')
const running = {}
function runStream(id) {
  if (running[id]) return running[id]
  const s = byId[id]
  const deps = (s.dependsOn || []).filter(d => d !== 'S0' && byId[d])
  running[id] = Promise.all(deps.map(runStream))
    .then(() => {
      const blockedDeps = deps.filter(d => !results[d] || results[d].status === 'blocked')
      if (blockedDeps.length) {
        const skipped = {
          status: 'blocked',
          summary: `skipped: dependency ${blockedDeps.join(', ')} blocked or failed`,
          filesChanged: [], decisions: [], requests: [], openIssues: [],
        }
        return skipped
      }
      return agent(streamPrompt(s), {
        label: `${MID}:${s.id}`,
        phase: 'Build',
        agentType: AGENT_TYPES.indexOf(s.agent) >= 0 ? s.agent : undefined,
        schema: STREAM_RESULT,
      })
    })
    .then(r => {
      results[id] = r
      if (!r) log(`${MID}:${id} returned no result`)
      else log(`${MID}:${id} → ${r.status}`)
      return r
    })
  return running[id]
}
await Promise.all(streams.filter(s => s.id !== 'S0').map(s => runStream(s.id)))

const blocked = Object.keys(results).filter(id => !results[id] || results[id].status === 'blocked')
if (blocked.length) log(`Blocked/failed streams: ${blocked.join(', ')} — integration will try to complete their work`)

const decisions = []
const requests = []
const openIssues = []
for (const id of Object.keys(results)) {
  const r = results[id]
  if (!r) continue
  for (const d of r.decisions || []) decisions.push({ stream: id, ref: d.ref, decision: d.decision, reason: d.reason })
  for (const q of r.requests || []) requests.push({ from: id, path: q.path, change: q.change })
  for (const o of r.openIssues || []) openIssues.push(`${id}: ${o}`)
}

// ───────────────────────── Integrate ─────────────────────────
function gatePrompt(extra, targeted) {
  if (targeted) {
    return `Targeted re-gate for milestone ${MID} of Team Working OS after review fixes. The repository root is the current working directory. No other agent is editing files now.
${extra}
Run: pnpm db:up; pnpm typecheck; pnpm lint; the Vitest files covering the changed files (git diff --name-only HEAD plus untracked: their *.test.ts / *.int.test.ts, and tests/authz when server actions/routes changed) via pnpm exec vitest run <files>; and only the Playwright specs that exercise the changed screens via pnpm exec playwright test <specs>. Fix failures at the root cause (never delete, skip or weaken tests). The full pnpm check + full e2e suite run later at close-out — do NOT run them here.
Return green=true only if every targeted run passed in your final attempt; list the commands you ran in "check"/"e2e".`
  }
  return `Integration gate for milestone ${MID} of Team Working OS. The repository root is the current working directory. No other agent is editing files now.
${extra}
Then:
1. Read PLAN.md §2.5 (gates) and ${kickoff.planFile} sections 6 (integration) and 7 (verification).
2. pnpm db:up && pnpm db:migrate && pnpm check. Fix every failure at its root cause. Never delete, skip or weaken tests; never add eslint-disable/@ts-ignore without a reason comment; never hand-edit generated migrations.
3. Run the FULL e2e suite (this milestone and all previous ones): pnpm test:e2e. Fix failures at the root cause.
4. Repeat until both are green, or until a failure clearly needs a product decision (then explain it).
Return green=true only if pnpm check AND the full e2e suite passed in your final run. Summarise the final runs (test counts), list fixes applied and anything remaining with a diagnosis.`
}

phase('Integrate')
const blockedNote = blocked.length
  ? `These streams were blocked or failed; read their plan sections and complete the missing work first: ${blocked.join(', ')}.\n`
  : ''
const requestNote = requests.length
  ? `First apply these cross-stream requests (the requesting streams deliberately did not make them):\n${requests.map(r => `- from ${r.from} → ${r.path}: ${r.change}`).join('\n')}\n`
  : ''
let gate = await agent(gatePrompt(blockedNote + requestNote), { label: `${MID}:integrate`, phase: 'Integrate', schema: GATE_SCHEMA })
if (!gate || !gate.green) {
  gate = await agent(
    gatePrompt(`A previous integration attempt did not reach green. Its report: ${JSON.stringify(gate || {}).slice(0, 4000)}\nStart by reproducing the remaining failures.`),
    { label: `${MID}:integrate-2`, phase: 'Integrate', schema: GATE_SCHEMA },
  )
}
if (!gate || !gate.green) {
  return { milestone: MID, stoppedAt: 'integrate', gate, decisions, openIssues }
}

// ───────────────────────── Review → Fix loop ─────────────────────────
const attempts = {}
const refutedKeys = {}
let lastConfirmed = []
if (!SKIP_REVIEW) {
  for (let round = 1; round <= MAX_FIX_ROUNDS; round++) {
    phase('Review')
    const scope = PREV_TAG
      ? `all changes since tag ${PREV_TAG} (git diff ${PREV_TAG} --stat; git diff ${PREV_TAG}) plus untracked files (git status --porcelain)`
      : 'the whole repository (first milestone)'

    const perLens = await pipeline(
      LENSES,
      lens =>
        agent(
          `REVIEW milestone ${MID} of Team Working OS through the "${lens.key}" lens (round ${round}).
Lens: ${lens.desc}
Scope: ${scope}.
References: ${kickoff.planFile} (sections 1, 3, 5, 7), the SPEC.md sections it cites, CLAUDE.md, PROGRESS.md › Decisions/Deviations (accepted — do not re-litigate).
Report only findings you can evidence with file:line and a quote, each tied to a rule. Return an empty list if the lens is clean.`,
          { label: `${MID}:review:${lens.key}:r${round}`, phase: 'Review', agentType: 'spec-reviewer', schema: FINDINGS_SCHEMA, model: REVIEW_MODEL },
        ),
      (res, lens) =>
        parallel(
          ((res && res.findings) || [])
            .filter(f => !refutedKeys[findingKey(f)])
            .map(f => () => {
              // owner 2026-11-01: minor findings go straight to the fixers (no skeptic) to save time/tokens
              if (f.severity === 'minor') return Promise.resolve(Object.assign({}, f, { lens: lens.key, confirmed: true }))
              const votes = 2
              return parallel(
                Array.from({ length: votes }, (_, i) => () =>
                  agent(
                    `REFUTE this review finding for milestone ${MID} of Team Working OS (skeptic #${i + 1}, lens ${lens.key}).
Finding: ${JSON.stringify(f)}
Open the cited file and the cited rule. Look for evidence that the finding is wrong: the behaviour is handled elsewhere (wrapper, service, middleware), the rule does not apply to this milestone, a recorded Decision/Deviation covers it, or the quote is misread. Return refuted=true only with concrete evidence; if you cannot disprove it, return refuted=false.`,
                    { label: `${MID}:verify:${lens.key}:${i + 1}`, phase: 'Review', agentType: 'spec-reviewer', schema: VERDICT_SCHEMA, model: REVIEW_MODEL },
                  ),
                ),
              ).then(vs => {
                const valid = vs.filter(Boolean)
                const refutes = valid.filter(v => v.refuted).length
                const confirmed = valid.length > 0 && refutes < valid.length
                if (!confirmed) refutedKeys[findingKey(f)] = true
                return Object.assign({}, f, { lens: lens.key, confirmed })
              })
            }),
        ),
    )

    // barrier justified: dedupe across all lenses before spending fix effort
    const seenThisRound = {}
    const confirmed = []
    for (const f of perLens.flat().filter(Boolean)) {
      if (!f.confirmed) continue
      const k = findingKey(f)
      if (seenThisRound[k]) continue
      seenThisRound[k] = true
      attempts[k] = (attempts[k] || 0) + 1
      if (attempts[k] > 2) {
        openIssues.push(`unresolved after 2 fix attempts: ${f.file} — ${f.rule}: ${f.problem}`)
        continue
      }
      confirmed.push(f)
    }
    lastConfirmed = confirmed
    log(`${MID} review round ${round}: ${confirmed.length} confirmed findings to fix`)
    if (!confirmed.length) break

    phase('Fix')
    const groups = {}
    for (const f of confirmed) {
      const o = ownerFor(f.file)
      if (!groups[o]) groups[o] = []
      groups[o].push(f)
    }
    const fixResults = await parallel(
      Object.keys(groups).map(owner => () =>
        agent(
          `Fix these CONFIRMED review findings for milestone ${MID} of Team Working OS. You are the ${owner}. Other fixers run in parallel on other paths: edit only the cited files and files you own that the fix strictly requires; request anything else.
${groups[owner]
  .map((f, i) => `${i + 1}. [${f.severity}] ${f.file}:${f.line || '?'} — ${f.rule}\n   Problem: ${f.problem}\n   Evidence: ${f.evidence}\n   Suggested fix: ${f.fix}`)
  .join('\n')}
For each finding: fix the root cause, add or adjust a test that would have caught it, run the relevant tests. In your report's summary state per finding: fixed / not-a-bug (evidence) / needs-decision.`,
          { label: `${MID}:fix:${owner}:r${round}`, phase: 'Fix', agentType: owner, schema: STREAM_RESULT },
        ),
      ),
    )
    for (const r of fixResults.filter(Boolean)) {
      for (const d of r.decisions || []) decisions.push({ stream: 'fix-r' + round, ref: d.ref, decision: d.decision, reason: d.reason })
      for (const q of r.requests || []) requests.push({ from: 'fix-r' + round, path: q.path, change: q.change })
    }
    const fixRequests = requests.filter(q => q.from === 'fix-r' + round)
    gate = await agent(
      gatePrompt(
        (fixRequests.length ? `Apply these requests from the fixers first:\n${fixRequests.map(q => `- ${q.path}: ${q.change}`).join('\n')}\n` : '') +
          `Review-fix round ${round} just changed code; re-establish green.`,
        true,
      ),
      { label: `${MID}:regate:r${round}`, phase: 'Fix', schema: GATE_SCHEMA },
    )
    if (!gate || !gate.green) {
      return { milestone: MID, stoppedAt: `fix-round-${round}`, gate, lastConfirmed, decisions, openIssues }
    }
  }
}

// ───────────────────────── Close ─────────────────────────
phase('Close')
const close = await agent(
  `Close-out of milestone ${MID} for Team Working OS. The repository root is the current working directory.
1. Run pnpm check and the full e2e suite (pnpm test:e2e) one final time. If either fails, do NOT commit: set the PROGRESS.md row to ⛔ with the reason and return committed=false.
2. Walk ${kickoff.planFile} section 8 (Definition of done) and SPEC §12 ${MID}; tick every box you can verify, and list anything unverifiable in followUps.
3. Update PROGRESS.md:
   - row ${MID} → ✅ with a one-line note (date from \`date +%F\`); "Milestone ปัจจุบัน" → ${NEXT !== null ? 'M' + NEXT + ' — ยังไม่เริ่ม' : 'MVP เสร็จ'}.
   - "## แผนของ milestone ปัจจุบัน": tick everything done; then clear it back to the template placeholder for the next milestone.
   - "## Decisions": add these stream decisions (dedupe; date · ref · decision · reason):
${decisions.length ? decisions.map(d => `     - ${d.ref} · ${d.decision} · ${d.reason} (${d.stream})`).join('\n') : '     - (none reported)'}
   - "## Deviations": add any deviation from SPEC you find in the stream reports or code comments marked DEVIATION.
   - "## Known issues / TODO ถัดไป": add:
${openIssues.length ? openIssues.map(o => `     - ${o}`).join('\n') : '     - (none reported)'}
4. git add -A; git commit with subject "feat(${TAG}): <one-line summary in English>" and a short body listing the delivered FR/AC ids; end the message with the attribution trailer your session instructions specify (if any). Then git tag ${TAG}.
Return committed, commit (hash + subject), tag, progressUpdated, summary (5 lines max), followUps.`,
  { label: `${MID}:close`, phase: 'Close', schema: CLOSE_SCHEMA },
)

return {
  milestone: MID,
  streams: Object.keys(results).map(id => ({ id, status: results[id] ? results[id].status : 'none', summary: results[id] ? results[id].summary : '' })),
  decisions,
  openIssues,
  lastReviewRoundFindings: lastConfirmed.length,
  gate,
  close,
}
