import { Icon } from './shared';
import type { ProtocolType, ConnectionFormData } from './types';
import type { SshAuthType, TestConnectionResponse } from '@/utils/remoteConnectionAPI';

interface NewConnectionModalProps {
  selectedProtocol: ProtocolType;
  authType: SshAuthType;
  formData: ConnectionFormData;
  loading: boolean;
  testingConnection: boolean;
  error: string | null;
  testResult: TestConnectionResponse | null;
  onClose: () => void;
  onProtocolChange: (p: ProtocolType) => void;
  onAuthTypeChange: (t: SshAuthType) => void;
  onFormChange: (field: string, value: string | boolean) => void;
  onTestConnection: () => void;
  onConnect: () => void;
  onClearError: () => void;
}

export function NewConnectionModal({
  selectedProtocol,
  authType,
  formData,
  loading,
  testingConnection,
  error,
  testResult,
  onClose,
  onProtocolChange,
  onAuthTypeChange,
  onFormChange,
  onTestConnection,
  onConnect,
  onClearError,
}: NewConnectionModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#13131E] border border-[#1E1E2E] rounded w-md max-h-[90vh] flex flex-col shadow-2xl panel-depth">

        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E1E2E] shrink-0">
          <div className="flex items-center gap-3">
            <Icon name="lan" className="text-[#7C6DFA] text-xl" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#E2E8F0]">New Connection</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5 transition-colors cursor-pointer">
            <Icon name="close" className="text-slate-400 text-base" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto custom-scrollbar flex-1 px-5 py-4 space-y-4">

          {/* Error Alert */}
          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="error" className="text-red-400 text-base" />
                <span className="text-xs text-red-200">{error}</span>
              </div>
              <button onClick={onClearError} className="cursor-pointer">
                <Icon name="close" className="text-red-400 text-sm" />
              </button>
            </div>
          )}

          {/* Protocol Tabs */}
          <div className="flex gap-2 border-b border-[#1E1E2E]">
            {(['SSH_SFTP', 'FTP', 'SMB'] as const).map(proto => (
              <button
                key={proto}
                onClick={() => onProtocolChange(proto)}
                className={`px-3 py-2 text-xs font-mono uppercase tracking-wider transition-colors border-b-2 -mb-px cursor-pointer ${
                  selectedProtocol === proto
                    ? 'text-[#7C6DFA] border-[#7C6DFA]'
                    : 'text-slate-500 border-transparent hover:text-slate-300'
                }`}
              >
                {proto === 'SSH_SFTP' ? 'SFTP' : proto}
              </button>
            ))}
          </div>

          {/* Form Fields */}
          <div className="space-y-3">

            {/* Connection Name */}
            <div>
              <label className="label block mb-1.5">Connection Name</label>
              <input
                type="text"
                placeholder="e.g., Production Server"
                value={formData.name}
                onChange={e => onFormChange('name', e.target.value)}
                className="w-full bg-[#0C0C14] border border-[#1E1E2E] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#7C6DFA]/40 outline-none transition-all"
              />
            </div>

            {/* Host / IP */}
            <div>
              <label className="label block mb-1.5">Host / IP Address</label>
              <input
                type="text"
                placeholder="e.g., 192.168.1.100"
                value={formData.host}
                onChange={e => onFormChange('host', e.target.value)}
                className="w-full bg-[#0C0C14] border border-[#1E1E2E] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#7C6DFA]/40 outline-none transition-all"
              />
            </div>

            {/* Port & Username */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1.5">Port</label>
                <input
                  type="number"
                  value={formData.port}
                  onChange={e => onFormChange('port', e.target.value)}
                  className="w-full bg-[#0C0C14] border border-[#1E1E2E] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#7C6DFA]/40 outline-none transition-all"
                />
              </div>
              <div>
                <label className="label block mb-1.5">Username</label>
                <input
                  type="text"
                  placeholder="e.g., ubuntu"
                  value={formData.username}
                  onChange={e => onFormChange('username', e.target.value)}
                  className="w-full bg-[#0C0C14] border border-[#1E1E2E] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#7C6DFA]/40 outline-none transition-all"
                />
              </div>
            </div>

            {/* Auth Type Toggle */}
            <div className="flex gap-3 bg-[#0C0C14] rounded p-2">
              {(['PASSWORD', 'PRIVATE_KEY'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => onAuthTypeChange(type)}
                  className={`flex-1 px-2 py-1.5 text-xs font-mono uppercase tracking-wider rounded transition-all cursor-pointer ${
                    authType === type
                      ? 'bg-[#7C6DFA] text-white'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {type === 'PASSWORD' ? 'Password' : 'SSH Key'}
                </button>
              ))}
            </div>

            {/* Password or SSH Key */}
            {authType === 'PASSWORD' ? (
              <div>
                <label className="label block mb-1.5">Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={e => onFormChange('password', e.target.value)}
                  className="w-full bg-[#0C0C14] border border-[#1E1E2E] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#7C6DFA]/40 outline-none transition-all"
                />
              </div>
            ) : (
              <div>
                <label className="label block mb-1.5">SSH Key (PEM)</label>
                <textarea
                  placeholder="-----BEGIN PRIVATE KEY-----"
                  value={formData.privateKey}
                  onChange={e => onFormChange('privateKey', e.target.value)}
                  className="w-full bg-[#0C0C14] border border-[#1E1E2E] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#7C6DFA]/40 outline-none transition-all h-24 resize-none"
                />
              </div>
            )}

            {/* Remote Path */}
            <div>
              <label className="label block mb-1.5">Remote Path (Optional)</label>
              <input
                type="text"
                placeholder="/home/user/data"
                value={formData.remotePath}
                onChange={e => onFormChange('remotePath', e.target.value)}
                className="w-full bg-[#0C0C14] border border-[#1E1E2E] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#7C6DFA]/40 outline-none transition-all"
              />
            </div>

            {/* Session TTL */}
            <div>
              <label className="label block mb-1.5">
                Session TTL
                <span className="ml-2 text-slate-600 normal-case font-sans">(minutes, default 30)</span>
              </label>
              <input
                type="number"
                min="1"
                max="1440"
                placeholder="30"
                value={formData.sessionTtlMinutes}
                onChange={e => onFormChange('sessionTtlMinutes', e.target.value)}
                className="w-full bg-[#0C0C14] border border-[#1E1E2E] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#7C6DFA]/40 outline-none transition-all"
              />
            </div>

            {/* Security options */}
            <div className="space-y-2 pt-1">

              {/* Strict Host Key Checking — SSH only */}
              {selectedProtocol === 'SSH_SFTP' && (
                <div className="space-y-2 border border-[#1E1E2E] rounded p-3 bg-[#0C0C14]/50">
                  <label className="flex items-center gap-3 w-fit cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.strictHostKeyChecking}
                      onChange={e => onFormChange('strictHostKeyChecking', e.target.checked)}
                      className="w-4 h-4 rounded bg-[#0C0C14] border border-[#1E1E2E] accent-[#7C6DFA] cursor-pointer"
                    />
                    <span className="text-xs text-slate-300">Strict host key checking</span>
                  </label>
                  {formData.strictHostKeyChecking && (
                    <div>
                      <label className="label block mb-1.5">
                        Expected Fingerprint
                        <span className="ml-2 text-slate-600 normal-case font-sans">(optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="SHA256:abc123... or MD5:ab:cd:ef..."
                        value={formData.expectedFingerprint}
                        onChange={e => onFormChange('expectedFingerprint', e.target.value)}
                        className="w-full bg-[#0C0C14] border border-[#1E1E2E] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#7C6DFA]/40 outline-none transition-all"
                      />
                      <p className="mt-1.5 text-[10px] text-slate-600 leading-snug">
                        If provided, the server's key fingerprint must match exactly.
                        Leave blank to verify against known_hosts only.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <label className="flex items-center gap-3 w-fit cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.saveConnection}
                  onChange={e => onFormChange('saveConnection', e.target.checked)}
                  className="w-4 h-4 rounded bg-[#0C0C14] border border-[#1E1E2E] accent-[#7C6DFA] cursor-pointer"
                />
                <span className="text-xs text-slate-300">Save this connection</span>
              </label>

              <label className="flex items-center gap-3 w-fit cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.autoReconnect}
                  onChange={e => onFormChange('autoReconnect', e.target.checked)}
                  className="w-4 h-4 rounded bg-[#0C0C14] border border-[#1E1E2E] accent-[#7C6DFA] cursor-pointer"
                />
                <span className="text-xs text-slate-300">Auto-reconnect</span>
              </label>
            </div>
          </div>
        </div>

        {/* Test connection result */}
        {testResult && (
          <div className={`px-5 py-3 ${testResult.success ? 'bg-green-900/30 border-t border-green-700/50' : 'bg-red-900/30 border-t border-red-700/50'}`}>
            <div className="flex items-center gap-2">
              <Icon
                name={testResult.success ? 'check_circle' : 'cancel'}
                className={testResult.success ? 'text-green-400' : 'text-red-400'}
              />
              <span className={`text-xs font-mono ${testResult.success ? 'text-green-200' : 'text-red-200'}`}>
                {testResult.message}
              </span>
            </div>
          </div>
        )}

        {/* Modal footer */}
        <div className="px-5 py-4 border-t border-[#1E1E2E] flex gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={loading || testingConnection}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border border-[#1E1E2E] rounded text-[10px] font-bold uppercase tracking-widest text-slate-300 font-mono hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onTestConnection}
            disabled={loading || testingConnection}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border border-[#1E1E2E] bg-[#13131E] rounded text-[10px] font-bold uppercase tracking-widest text-slate-300 font-mono hover:bg-[#242a3a] transition-colors cursor-pointer disabled:opacity-40"
          >
            <Icon name={testingConnection ? 'hourglass_bottom' : 'science'} className="text-sm" />
            {testingConnection ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            onClick={onConnect}
            disabled={loading || testingConnection}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-[#7C6DFA] rounded text-[10px] font-bold uppercase tracking-widest text-white font-mono hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer shadow-lg shadow-[#7C6DFA]/15"
          >
            <Icon name={loading ? 'hourglass_bottom' : 'play_arrow'} className="text-sm" />
            {loading ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
