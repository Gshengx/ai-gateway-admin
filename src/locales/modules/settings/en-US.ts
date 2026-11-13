export default {
  passwordPolicy: {
    updatedAt: 'Last updated {time}',
    tab: 'Password policy',
    title: 'Password policy',
    desc: 'Set security requirements for initial user passwords and subsequent password changes.',
    global: 'Global',
    lengthRange: 'Password length range',
    fields: {
      min_length: 'Minimum password length',
      max_length: 'Maximum password length',
      complexity_categories: 'Complexity requirements',
      history_count: 'Password history check',
      failure_threshold: 'Consecutive failed logins before lockout',
      lock_duration_minutes: 'Lock duration',
    },
    prefix: {
      min_length: 'Minimum',
      max_length: 'Maximum',
      complexity_categories: 'At least',
      history_count: 'Last',
      failure_threshold: 'Consecutive',
    },
    to: 'to',
    units: {
      chars: 'chars',
      complexity_categories: 'types',
      history_count: 'times',
      failure_threshold: 'times',
      lock_duration_minutes: 'minutes',
    },
    hints: {
      lengthRange:
        'Default: 8-32 chars. Both limits can be set to 8-64 chars; the minimum must not exceed the maximum.',
      complexity_categories:
        'Require at least the specified number of types: uppercase letters, lowercase letters, digits, and special characters. Default: 3 types.',
      history_count:
        'New passwords must differ from the specified number of recently used passwords. Default: check the last 2 passwords.',
      failure_threshold:
        'Lock the account after the specified number of consecutive failed logins. Range: 3-10 times.',
      lock_duration_minutes: 'Range: 5-1440 minutes. Default: 30 minutes.',
    },
    save: 'Save',
    reset: 'Discard Changes',
    resetDone: 'Restored the last saved configuration',
    unchanged: 'No configuration changes',
    required: 'This field is required',
    range: 'Enter an integer between {min} and {max}',
    lengthOrder: 'Minimum password length must not exceed maximum length',
    saveSuccess: 'Password policy saved',
  },
  terms: {
    tabs: { notice: 'Usage notice' },
    notice: {
      title: 'Usage notice',
      desc: 'Configure the login notice and confirmation requirement.',
      tag: {
        both: 'Login notice with required confirmation',
        dialogOnly: 'Login notice (optional)',
        off: 'Disabled',
      },
      showLoginDialog: 'Show usage notice at login',
      showLoginDialogHint:
        'Users can skip the notice when confirmation is optional. Requiring confirmation always enables the login notice.',
      requireConfirmation: 'Require user confirmation',
      requireConfirmationHint:
        'Users must confirm to complete login. API key requests will also be rejected until confirmation. Enabling this automatically enables the login notice.',
      titleZh: 'Notice title (Chinese)',
      contentZh: 'Notice content (Chinese)',
      titleEn: 'Notice title (English)',
      contentEn: 'Notice content (English)',
      version: 'Current version {version} · Last updated {time}',
      preview: 'Preview',
      previewIncomplete: 'Please complete the titles and bodies in both Chinese and English',
      previewFailed: 'Backend preview failed. The unprocessed local content is shown below.',
      previewRequired: 'Please enter {field} before previewing',
      reset: 'Discard Changes',
      save: 'Save',
      saveSuccess: 'Configuration saved',
      resetDone: 'Last saved configuration restored',
      localeZh: '中文',
      localeEn: 'English',
      closePreview: 'Close Preview',
      required: 'Enter {field}',
    },
    records: {
      columns: {
        acceptedAt: 'Confirmed at',
      },
    },
    gate: {
      checkbox: 'I have read and agree to the terms above',
      confirm: 'Confirm',
      skip: 'Skip',
      accepted: 'Usage notice accepted',
    },
  },
}
