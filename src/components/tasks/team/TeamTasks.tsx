'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { useInfiniteQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import Link from '@/components/Link'
import { EmptyState } from '@/components/common/EmptyState'
import { ColorSquare } from '@/components/common/ProjectChip'
import { PersonPicker } from '@/components/common/PersonPicker'
import { UserName } from '@/components/common/UserName'
import type { TaskStatusCategory } from '@/domain/types'
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import { usePreferences } from '@/hooks/usePreferences'
import { th } from '@/i18n/th'
import { getJson } from '@/lib/api'
import { compareThai } from '@/lib/collate'
import type { PersonOption } from '@/lib/contracts/people'
import type { TaskCard as TaskCardDTO, TeamTasksResponse } from '@/lib/contracts/tasks'
import { formatThaiDate } from '@/lib/format'
import { qk } from '@/lib/query-keys'
import { taskPreference } from '@/lib/schemas/preferences'
import { buildCategoryColumns, resolveCategoryDrop } from '@/lib/tasks/board'
import { personOf } from '../AssigneeChips'
import { BlockerBadge } from '../blockers/BlockerBadge'
import { TaskBoard } from '../board/TaskBoard'
import { TaskCard } from '../board/TaskCard'
import { StatusChip } from '../status/StatusChip'
import { StatusMenu } from '../status/StatusMenu'
import { ViewToggle } from '../TaskToolbar'
import { errorMessage } from '../useTaskMutations'
import { teamFiltersToSearchParams, useTeamTaskFilters } from './useTeamTaskFilters'
import { useSetTaskStatus } from './useSetTaskStatus'

const CATEGORIES: readonly TaskStatusCategory[] = ['TODO', 'IN_PROGRESS', 'WAITING', 'DONE']
type ProjectRef = TeamTasksResponse['projects'][number]

const taskHref = (c: TaskCardDTO) => `/projects/${c.projectId}/tasks?task=${c.id}`

/**
 * งานของทีม `/tasks` (FR-665/666, X75, M3-D33/D41): tasks of every project the viewer can see; filters person /
 * project / position / category / blocked / done live in the URL (when `syncUrl`); list grouped by project or a board
 * of the 4 categories, where a drop picks the first status of that category in the task's project (FR-666).
 */
export function TeamTasks({ syncUrl = true }: { syncUrl?: boolean }) {
  const { filters, patch, clear } = useTeamTaskFilters({ syncUrl })
  const { prefs } = usePreferences()
  const view = taskPreference(prefs, 'tasks.view')
  const people = usePeopleOptions()
  const router = useRouter()
  const status = useSetTaskStatus()
  const q = useInfiniteQuery({
    queryKey: qk.teamTasks(filters),
    queryFn: ({ pageParam, signal }) =>
      getJson<TeamTasksResponse>(`/api/tasks?${teamFiltersToSearchParams(filters, pageParam).toString()}`, {
        signal,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  // projects seen so far, so the project filter keeps its options while narrowed (state adjusted during render)
  const [seen, setSeen] = useState<ReadonlyMap<string, ProjectRef>>(new Map())
  const pages = useMemo(() => q.data?.pages ?? [], [q.data])
  const fresh = pages.flatMap((p) => p.projects).filter((pr) => !seen.has(pr.id))
  if (fresh.length > 0) setSeen(new Map([...seen, ...fresh.map((pr) => [pr.id, pr] as const)]))
  const projects = [...seen.values()].sort((a, b) => compareThai(a.name, b.name))
  const cards = useMemo(() => pages.flatMap((p) => p.cards), [pages])
  const statusesByProject = useMemo(
    () =>
      Object.assign({}, ...pages.map((p) => p.statusesByProject)) as TeamTasksResponse['statusesByProject'],
    [pages],
  )
  const projectOf = (id: string): ProjectRef => seen.get(id) ?? { id, name: '', color: '' }
  const projectName = (id: string) => projectOf(id).name
  const peopleById = useMemo(
    () => new Map<string, PersonOption>((people.data ?? []).map((p) => [p.id, p])),
    [people.data],
  )
  const positions = useMemo(() => {
    const out = new Map<string, string>()
    for (const p of people.data ?? [])
      if (p.positionId && p.positionName) out.set(p.positionId, p.positionName)
    return [...out].sort((a, b) => compareThai(a[1], b[1]))
  }, [people.data])

  const pickStatus = (card: TaskCardDTO, statusId: string) => {
    const s = statusesByProject[card.projectId]?.find((x) => x.id === statusId)
    if (s) status.setStatus(card, s)
  }
  const onDrop = (cardId: string, columnKey: string) => {
    const card = cards.find((c) => c.id === cardId)
    const category = CATEGORIES.find((c) => columnKey === `category:${c}`)
    if (!card || !category) return
    const target = resolveCategoryDrop(statusesByProject, card.projectId, category)
    if (target === null) {
      toast(
        th.tasks.status.toast.noStatusInCategory(
          projectName(card.projectId),
          th.tasks.status.categories[category],
        ),
      )
      return
    }
    pickStatus(card, target)
  }

  return (
    <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        <ViewToggle />
        <Box sx={{ width: { xs: '100%', sm: 220 } }}>
          <PersonPicker
            label={th.teamTasks.filters.person}
            options={people.data ?? []}
            value={filters.userId ? (peopleById.get(filters.userId) ?? null) : null}
            onSelect={(p) => patch({ userId: p.id })}
            onClear={() => patch({ userId: undefined })}
            loading={people.isLoading}
          />
        </Box>
        <FilterSelect
          label={th.teamTasks.filters.project}
          value={filters.projectId ?? ''}
          options={projects.map((p) => [p.id, p.name] as const)}
          onChange={(v) => patch({ projectId: v || undefined })}
        />
        {positions.length > 0 ? (
          <FilterSelect
            label={th.teamTasks.filters.position}
            value={filters.positionId ?? ''}
            options={positions}
            onChange={(v) => patch({ positionId: v || undefined })}
          />
        ) : null}
        <FormControl size="small" sx={FILTER_SX}>
          <InputLabel id="team-category">{th.teamTasks.filters.category}</InputLabel>
          <Select<TaskStatusCategory[]>
            multiple
            labelId="team-category"
            label={th.teamTasks.filters.category}
            value={filters.category ?? []}
            renderValue={(v) => v.map((c) => th.tasks.status.categories[c]).join(', ')}
            onChange={(e) => {
              const v = typeof e.target.value === 'string' ? [] : e.target.value
              patch({ category: v.length > 0 ? v : undefined })
            }}
          >
            {CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>
                {th.tasks.status.categories[c]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControlLabel
          label={th.teamTasks.filters.blocked}
          control={
            <Switch size="small" checked={filters.blocked} onChange={(_e, v) => patch({ blocked: v })} />
          }
        />
        <FormControlLabel
          label={th.teamTasks.filters.includeDone}
          control={
            <Switch
              size="small"
              checked={filters.includeDone}
              onChange={(_e, v) => patch({ includeDone: v })}
            />
          }
        />
        <Button size="small" onClick={clear}>
          {th.teamTasks.filters.clear}
        </Button>
      </Box>

      {q.isPending ? (
        <CircularProgress size={24} aria-label={th.common.loading} />
      ) : q.isError ? (
        <Alert severity="error">{errorMessage(q.error)}</Alert>
      ) : cards.length === 0 ? (
        <EmptyState title={th.teamTasks.empty} />
      ) : view === 'BOARD' ? (
        <TaskBoard<TaskCardDTO>
          columns={buildCategoryColumns(cards, { hideDone: false })}
          canEdit
          cardLabel={(c) => c.name}
          onMove={onDrop}
          renderCard={(card) => (
            <TaskCard
              card={card}
              statuses={statusesByProject[card.projectId] ?? []}
              canEdit
              projectName={projectName(card.projectId)}
              onOpen={() => router.push(taskHref(card))}
              onPickStatus={(_id, statusId) => pickStatus(card, statusId)}
              onToggleDone={() => status.toggleDone(card)}
            />
          )}
        />
      ) : (
        <TeamList
          cards={cards}
          projectOf={projectOf}
          statusesByProject={statusesByProject}
          people={peopleById}
          onPickStatus={pickStatus}
          onToggleDone={status.toggleDone}
        />
      )}
      {q.hasNextPage ? (
        <Button
          onClick={() => void q.fetchNextPage()}
          disabled={q.isFetchingNextPage}
          sx={{ justifySelf: 'start' }}
        >
          {th.teamTasks.loadMore}
        </Button>
      ) : null}
    </Box>
  )
}

/** Filter selects share a phone row evenly instead of leaving ragged gaps (SPEC §7). */
const FILTER_SX = { minWidth: { xs: 140, sm: 160 }, flex: { xs: '1 1 140px', sm: '0 0 auto' } } as const

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly (readonly [string, string])[]
  onChange: (v: string) => void
}) {
  const id = `team-filter-${label}`
  return (
    <FormControl size="small" sx={FILTER_SX}>
      <InputLabel id={id}>{label}</InputLabel>
      <Select labelId={id} label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        <MenuItem value="">{th.common.all}</MenuItem>
        {options.map(([v, text]) => (
          <MenuItem key={v} value={v}>
            {text}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

function TeamList({
  cards,
  projectOf,
  statusesByProject,
  people,
  onPickStatus,
  onToggleDone,
}: {
  cards: readonly TaskCardDTO[]
  projectOf: (id: string) => ProjectRef
  statusesByProject: TeamTasksResponse['statusesByProject']
  people: ReadonlyMap<string, PersonOption>
  onPickStatus: (card: TaskCardDTO, statusId: string) => void
  onToggleDone: (card: TaskCardDTO) => void
}) {
  const [menu, setMenu] = useState<{ anchor: HTMLElement; card: TaskCardDTO } | null>(null)
  const groups = useMemo(() => {
    const by = new Map<string, TaskCardDTO[]>()
    for (const c of cards) {
      const list = by.get(c.projectId)
      if (list) list.push(c)
      else by.set(c.projectId, [c])
    }
    return [...by].sort((a, b) => compareThai(projectOf(a[0]).name, projectOf(b[0]).name))
  }, [cards, projectOf])
  return (
    <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
      {groups.map(([projectId, list]) => (
        <Paper
          key={projectId}
          variant="outlined"
          component="section"
          aria-label={projectOf(projectId).name}
          data-team-project={projectId}
          sx={{ p: { xs: 1, sm: 2 } }}
        >
          <Typography
            variant="subtitle1"
            component="h2"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
          >
            <ColorSquare color={projectOf(projectId).color || null} />
            {projectOf(projectId).name}
          </Typography>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {list.map((c) => (
              <Box
                component="li"
                key={c.id}
                data-task-id={c.id}
                sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5, minWidth: 0 }}
              >
                <Checkbox
                  size="small"
                  checked={c.completed}
                  onChange={() => onToggleDone(c)}
                  sx={{ p: 0.5 }}
                  slotProps={{ input: { 'aria-label': th.tasks.completeCheckbox(c.name) } }}
                />
                {/* name, then the meta line; on narrow widths the meta wraps under the name (SPEC §7) */}
                <Box
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    columnGap: 1.5,
                    rowGap: 0.5,
                    minHeight: 32,
                  }}
                >
                  <Box
                    component={Link}
                    href={taskHref(c)}
                    sx={{
                      color: 'text.primary',
                      flex: '1 1 220px',
                      minWidth: 0,
                      overflowWrap: 'anywhere',
                      textDecoration: c.completed ? 'line-through' : 'none',
                    }}
                  >
                    {c.name}
                  </Box>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <StatusChip
                      status={c.status}
                      onClick={(e) => setMenu({ anchor: e.currentTarget, card: c })}
                    />
                    {c.blockers.total > 0 ? (
                      <BlockerBadge open={c.blockers.open} total={c.blockers.total} />
                    ) : null}
                    {c.assigneeIds.length === 0 ? (
                      <Typography variant="caption">{th.tasks.unassigned}</Typography>
                    ) : (
                      c.assigneeIds.map((id) => <UserName key={id} user={personOf(people, id)} />)
                    )}
                    {c.dueDate ? (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {formatThaiDate(c.dueDate)}
                      </Typography>
                    ) : null}
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      ))}
      <StatusMenu
        statuses={menu ? (statusesByProject[menu.card.projectId] ?? []) : []}
        currentId={menu?.card.status.id ?? null}
        anchorEl={menu?.anchor ?? null}
        onPick={(statusId) => menu && onPickStatus(menu.card, statusId)}
        onClose={() => setMenu(null)}
      />
    </Box>
  )
}
