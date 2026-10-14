import type { AccountType } from '@lab/schemas'

// A Record over AccountType: adding a fifth type to the schema fails typecheck here until it has a label.
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Checking',
  savings: 'Savings',
  cash: 'Cash',
  credit_card: 'Credit card',
}
