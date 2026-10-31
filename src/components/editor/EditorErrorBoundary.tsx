'use client'
// src/components/editor/EditorErrorBoundary.tsx — keeps a broken document / editor crash from unmounting the page
// (r3 G12). The reload button remounts the editor subtree via a key bump.
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Button from '@mui/material/Button'
import { Component, type ErrorInfo, Fragment, type ReactNode } from 'react'
import { th } from '@/i18n/th'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
  attempt: number
}

export class EditorErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, attempt: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[editor] crashed', error, info.componentStack)
  }

  private readonly retry = (): void => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))
  }

  override render(): ReactNode {
    const t = th.editor.crashed
    if (this.state.error) {
      return (
        <Alert
          severity="error"
          data-testid="editor-crashed"
          action={
            <Button color="inherit" size="small" onClick={this.retry}>
              {t.reload}
            </Button>
          }
        >
          <AlertTitle>{t.title}</AlertTitle>
          {t.body}
        </Alert>
      )
    }
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>
  }
}
