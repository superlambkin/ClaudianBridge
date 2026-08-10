import type { ClaudianBridgeSettings, OfficeConflictPolicy, OfficeLogLevel } from '../core/settings';
import { DEFAULT_OFFICE_SETTINGS } from '../core/settings';

const CONFLICT_POLICIES = ['overwrite', 'skip', 'timestamp'];
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

export function convertFromVaultOfficeBridge(raw: unknown): Partial<ClaudianBridgeSettings> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    office: {
      enabled: true,
      pythonPath: typeof r.pythonPath === 'string' && r.pythonPath !== '' ? r.pythonPath : DEFAULT_OFFICE_SETTINGS.pythonPath,
      markitdownArgs: typeof r.markitdownArgs === 'string' ? r.markitdownArgs : DEFAULT_OFFICE_SETTINGS.markitdownArgs,
      enabledExtensions: Array.isArray(r.enabledExtensions)
        ? r.enabledExtensions.filter((e) => typeof e === 'string')
        : [...DEFAULT_OFFICE_SETTINGS.enabledExtensions],
      conflictPolicy: typeof r.conflictPolicy === 'string' && CONFLICT_POLICIES.includes(r.conflictPolicy)
        ? (r.conflictPolicy as OfficeConflictPolicy)
        : DEFAULT_OFFICE_SETTINGS.conflictPolicy,
      frontmatterTemplate: typeof r.frontmatterTemplate === 'string' ? r.frontmatterTemplate : DEFAULT_OFFICE_SETTINGS.frontmatterTemplate,
      logLevel: typeof r.logLevel === 'string' && LOG_LEVELS.includes(r.logLevel)
        ? (r.logLevel as OfficeLogLevel)
        : DEFAULT_OFFICE_SETTINGS.logLevel,
      showProgressModal: typeof r.showProgressModal === 'boolean' ? r.showProgressModal : DEFAULT_OFFICE_SETTINGS.showProgressModal,
      outputDirOverride: typeof r.outputDirOverride === 'string' ? r.outputDirOverride : DEFAULT_OFFICE_SETTINGS.outputDirOverride,
    },
  };
}
