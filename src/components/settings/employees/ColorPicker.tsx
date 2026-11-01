'use client'
import Box from '@mui/material/Box'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Typography from '@mui/material/Typography'
import Check from '@mui/icons-material/Check'
import { th } from '@/i18n/th'
import { USER_COLORS, type UserColor } from '@/lib/user-colors'

const AUTO = 'auto'

function Swatch({ color, checked }: { color: string; checked: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        bgcolor: color,
        color: 'common.white',
        display: 'grid',
        placeItems: 'center',
        outline: checked ? '2px solid' : 'none',
        outlineColor: 'text.primary',
        outlineOffset: 2,
      }}
    >
      {/* the check mark carries the selection, not the colour */}
      {checked ? <Check sx={{ fontSize: 'var(--font-lg)' }} /> : null}
    </Box>
  )
}

/** Avatar colour (FR-210, M1-D20): 12 swatches, each a labelled radio; `allowAuto` adds "อัตโนมัติ" (least used). */
export function ColorPicker({
  value,
  onChange,
  allowAuto,
}: {
  value: UserColor | null
  onChange: (c: UserColor | null) => void
  allowAuto: boolean
}) {
  const current = value ?? AUTO
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <Typography component="legend" variant="subtitle2" sx={{ mb: 0.5 }}>
        {th.employees.fields.color}
      </Typography>
      <RadioGroup
        row
        value={current}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === AUTO ? null : (USER_COLORS.find((c) => c === v) ?? null))
        }}
        sx={{ gap: 0.5, alignItems: 'center' }}
      >
        {allowAuto ? (
          <FormControlLabel value={AUTO} control={<Radio size="small" />} label={th.employees.colorAuto} />
        ) : null}
        {USER_COLORS.map((c, i) => (
          <Radio
            key={c}
            value={c}
            size="small"
            icon={<Swatch color={c} checked={false} />}
            checkedIcon={<Swatch color={c} checked />}
            slotProps={{ input: { 'aria-label': th.employees.colorOption(i + 1) } }}
            sx={{ p: 0.5 }}
          />
        ))}
      </RadioGroup>
    </fieldset>
  )
}
