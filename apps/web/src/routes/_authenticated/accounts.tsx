import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/accounts')({
  component: () => <p className="mt-6">Accounts coming next.</p>,
})
